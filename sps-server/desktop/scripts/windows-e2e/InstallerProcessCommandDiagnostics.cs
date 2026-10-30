using System;
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
        IntPtr process = IntPtr.Zero, buffer = IntPtr.Zero;
        try
        {
            if (job == IntPtr.Zero || processId == 0) return Unavailable;
            process = OpenProcess(0x1000, false, processId);
            if (process == IntPtr.Zero) return Unavailable;
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
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }
}
