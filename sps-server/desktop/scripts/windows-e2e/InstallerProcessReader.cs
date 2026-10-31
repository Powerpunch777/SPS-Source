using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

internal static class InstallerProcessReader
{
    private const uint SnapshotProcesses = 0x00000002;
    private const int ErrorNoMoreFiles = 18;
    private static readonly IntPtr InvalidHandle = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry
    {
        public uint Size;
        public uint Usage;
        public uint ProcessId;
        public IntPtr DefaultHeapId;
        public uint ModuleId;
        public uint Threads;
        public uint ParentProcessId;
        public int BasePriority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string ExecutableName;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW", SetLastError = true)]
    private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32NextW", SetLastError = true)]
    private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public static string ReadJson()
    {
        var timer = Stopwatch.StartNew();
        IntPtr snapshot = CreateToolhelp32Snapshot(SnapshotProcesses, 0);
        if (snapshot == IntPtr.Zero || snapshot == InvalidHandle)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Create process snapshot");

        try
        {
            int count = 0;
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
            if (Process32First(snapshot, ref entry))
            {
                do
                {
                    if (String.Equals(entry.ExecutableName, "SPS Desktop.exe", StringComparison.OrdinalIgnoreCase))
                        checked { count++; }
                    entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
                }
                while (Process32Next(snapshot, ref entry));

                int error = Marshal.GetLastWin32Error();
                if (error != ErrorNoMoreFiles)
                    throw new Win32Exception(error, "Enumerate process snapshot");
            }
            else
            {
                int error = Marshal.GetLastWin32Error();
                if (error != ErrorNoMoreFiles)
                    throw new Win32Exception(error, "Read first process snapshot entry");
            }

            timer.Stop();
            return "{\"count\":" + count + ",\"elapsedMs\":" + timer.ElapsedMilliseconds + "}";
        }
        finally
        {
            if (!CloseHandle(snapshot))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Close process snapshot");
        }
    }
}
