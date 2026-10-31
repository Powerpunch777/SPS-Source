using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// Best-effort metadata for an already-owned PowerShell process, never authority
// or cleanup evidence. Unsupported native information classes stay unavailable.
public static class InstallerProcessCommandDiagnostics
{
    [StructLayout(LayoutKind.Sequential)]
    struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref uint length);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int kind, IntPtr information, uint length, out uint returned);

    const string Unavailable = "{\"readOK\":false,\"kind\":\"unavailable\",\"architecture\":\"unknown\",\"noProfile\":false,\"nonInteractive\":false}";

    static string Classify(string command)
    {
        if (command.IndexOf("Get-Command Get-CimInstance", StringComparison.OrdinalIgnoreCase) >= 0) return "availability";
        if (command.IndexOf("Get-ExecutionPolicy", StringComparison.OrdinalIgnoreCase) >= 0) return "execution-policy";
        if (command.IndexOf("Get-CimInstance", StringComparison.OrdinalIgnoreCase) >= 0)
            return command.IndexOf("Stop-Process", StringComparison.OrdinalIgnoreCase) >= 0 ? "stop-process" : "process-query";
        return "other";
    }

    public static string ReadOwnedPowerShell(IntPtr job, uint processId)
    {
        IntPtr process = IntPtr.Zero;
        try
        {
            if (job == IntPtr.Zero || processId == 0) return Unavailable;
            process = OpenProcess(0x1000, false, processId);
            return process == IntPtr.Zero ? Unavailable : ReadOwnedPowerShellHandle(job, process);
        }
        catch { return Unavailable; }
        finally { if (process != IntPtr.Zero) CloseHandle(process); }
    }

    static string ReadOwnedPowerShellHandle(IntPtr job, IntPtr process)
    {
        IntPtr buffer = IntPtr.Zero;
        try
        {
            if (job == IntPtr.Zero || process == IntPtr.Zero) return Unavailable;
            bool member;
            if (!IsProcessInJob(process, job, out member) || !member) return Unavailable;
            var image = new StringBuilder(32768);
            uint imageLength = (uint)image.Capacity;
            if (!QueryFullProcessImageNameW(process, 0, image, ref imageLength)) return Unavailable;
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string imagePath = Path.GetFullPath(image.ToString());
            string architecture;
            if (String.Equals(imagePath, Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), StringComparison.OrdinalIgnoreCase)) architecture = "x64";
            else if (String.Equals(imagePath, Path.Combine(windows, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe"), StringComparison.OrdinalIgnoreCase)) architecture = "x86";
            else return Unavailable;

            uint required;
            int status = NtQueryInformationProcess(process, 60, IntPtr.Zero, 0, out required);
            int headerLength = Marshal.SizeOf(typeof(UnicodeString));
            if (status != unchecked((int)0xC0000004) || required < headerLength || required > 65536) return Unavailable;
            buffer = Marshal.AllocHGlobal((int)required);
            uint returned;
            status = NtQueryInformationProcess(process, 60, buffer, required, out returned);
            if (status < 0 || returned < headerLength || returned > required) return Unavailable;
            var value = (UnicodeString)Marshal.PtrToStructure(buffer, typeof(UnicodeString));
            long start = buffer.ToInt64(), text = value.Buffer.ToInt64();
            if (value.Length == 0 || value.Length % 2 != 0 || value.MaximumLength < value.Length
                || value.Length > returned - headerLength || text < start + headerLength
                || text > start + returned - value.Length) return Unavailable;
            string command = Marshal.PtrToStringUni(value.Buffer, value.Length / 2);
            if (command == null || command.IndexOf('\0') >= 0) return Unavailable;
            bool noProfile = command.IndexOf("-NoProfile", StringComparison.OrdinalIgnoreCase) >= 0;
            bool nonInteractive = command.IndexOf("-NonInteractive", StringComparison.OrdinalIgnoreCase) >= 0;
            return "{\"readOK\":true,\"kind\":\"" + Classify(command) + "\",\"architecture\":\"" + architecture
                + "\",\"noProfile\":" + (noProfile ? "true" : "false")
                + ",\"nonInteractive\":" + (nonInteractive ? "true" : "false") + "}";
        }
        catch { return Unavailable; }
        finally
        {
            if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
        }
    }

    // Polling is deliberately incomplete: short-lived or unreadable commands
    // can be missed. These retained read-only handles never authorize cleanup.
    public sealed class Observations : IDisposable
    {
        sealed class Entry
        {
            public IntPtr Process;
            public string Command;
            public long FirstSeen;
            public bool Finished;
            public int Sequence;
        }

        readonly Dictionary<uint, Entry> entries = new Dictionary<uint, Entry>();
        readonly Stopwatch clock = Stopwatch.StartNew();
        int enumerationFailures, pending, unavailableExits;
        bool truncated, finished;

        public void Poll(IntPtr job, IEnumerable<uint> processIds, bool completeEnumeration)
        {
            if (finished) return;
            if (!completeEnumeration) enumerationFailures = Math.Min(100000, enumerationFailures + 1);
            try
            {
                if (job != IntPtr.Zero && processIds != null)
                {
                    foreach (uint processId in processIds)
                    {
                        if (processId == 0 || entries.ContainsKey(processId)) continue;
                        if (entries.Count >= 64) { truncated = true; break; }
                        IntPtr process = OpenProcess(0x101000, false, processId); // QUERY_LIMITED_INFORMATION | SYNCHRONIZE
                        if (process == IntPtr.Zero) continue;
                        try
                        {
                            string command = ReadOwnedPowerShellHandle(job, process);
                            if (command == Unavailable) continue;
                            entries.Add(processId, new Entry { Process = process, Command = command,
                                FirstSeen = clock.ElapsedMilliseconds, Sequence = entries.Count + 1 });
                            process = IntPtr.Zero;
                        }
                        finally { if (process != IntPtr.Zero) CloseHandle(process); }
                    }
                }
                foreach (Entry entry in entries.Values) ObserveExit(entry, false);
            }
            catch { enumerationFailures = Math.Min(100000, enumerationFailures + 1); }
        }

        void ObserveExit(Entry entry, bool final)
        {
            if (entry.Finished) return;
            uint wait = WaitForSingleObject(entry.Process, 0), code;
            string status;
            string exitCode = "null";
            if (wait == 0 && GetExitCodeProcess(entry.Process, out code))
            {
                status = "exited";
                exitCode = code.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }
            else if (wait == 258 && !final) return;
            else if (wait == 258) { status = "pending"; pending++; }
            else { status = "unavailable"; unavailableExits++; }
            entry.Finished = true;
            Console.WriteLine("{\"ownedInstallerCommandObservation\":true,\"sequence\":" + entry.Sequence
                + ",\"status\":\"" + status + "\",\"elapsedMs\":" + clock.ElapsedMilliseconds
                + ",\"observedDurationMs\":" + (clock.ElapsedMilliseconds - entry.FirstSeen)
                + ",\"exitCode\":" + exitCode + ",\"command\":" + entry.Command + "}");
        }

        public void Finish()
        {
            if (finished) return;
            foreach (Entry entry in entries.Values) ObserveExit(entry, true);
            finished = true;
            Console.WriteLine("{\"ownedInstallerCommandObservationSummary\":true,\"observed\":" + entries.Count
                + ",\"pending\":" + pending + ",\"unavailableExits\":" + unavailableExits
                + ",\"enumerationFailures\":" + enumerationFailures + ",\"truncated\":" + (truncated ? "true" : "false")
                + ",\"mayMissShortProcesses\":true}");
        }

        public void Dispose()
        {
            foreach (Entry entry in entries.Values)
                if (entry.Process != IntPtr.Zero) { CloseHandle(entry.Process); entry.Process = IntPtr.Zero; }
        }
    }
}
