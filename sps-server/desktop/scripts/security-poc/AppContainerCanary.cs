// Development-only Windows canary. Never launches plugins or reads a real SPS Vault.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;

internal static class AppContainerCanary
{
    private static string operation = "none";
    [StructLayout(LayoutKind.Sequential)] private struct Capabilities { public IntPtr Sid; public IntPtr Entries; public uint Count; public uint Reserved; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct StartupInfo
    {
        public int Size; public string Reserved; public string Desktop; public string Title;
        public uint X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
        public short ShowWindow, ReservedSize; public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] private struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
    {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
    {
        public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] private static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr caps, uint count, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] private static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll")] private static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr bytes);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr bytes, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CreateProcess(string executable, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inheritHandles, uint flags, IntPtr environment, string cwd, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits value, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateSymbolicLinkW")]
    [return: MarshalAs(UnmanagedType.U1)] private static extern bool CreateSymbolicLink(string link, string target, uint flags);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint rights, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr value, int size, out int returned);

    private static void Check(bool result, string name = "native-api") { if (!result) { int error = Marshal.GetLastWin32Error(); operation = name; throw new Win32Exception(error); } }
    private static string Quote(string value)
    {
        if (value.IndexOfAny(new char[] { '"', '%', '!', '&', '|', '<', '>', '^', '\r', '\n' }) >= 0) throw new InvalidOperationException("Unsupported temporary path.");
        return "\"" + value + "\"";
    }

    private static uint Run(IntPtr sid, string root, string command)
    {
        IntPtr size = IntPtr.Zero, attributes = IntPtr.Zero, capabilities = IntPtr.Zero, environment = IntPtr.Zero, job = IntPtr.Zero;
        bool attributesInitialized = false;
        ProcessInfo process = new ProcessInfo();
        try
        {
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
            attributes = Marshal.AllocHGlobal(size);
            Check(InitializeProcThreadAttributeList(attributes, 1, 0, ref size));
            attributesInitialized = true;
            Capabilities caps = new Capabilities(); caps.Sid = sid;
            capabilities = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Capabilities)));
            Marshal.StructureToPtr(caps, capabilities, false);
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20009), capabilities, new IntPtr(Marshal.SizeOf(typeof(Capabilities))), IntPtr.Zero, IntPtr.Zero));
            job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
            ExtendedLimits limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE, not a filesystem policy.
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            string systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            // Windows resolves the new AppContainer profile through LOCALAPPDATA.
            // Passing this path does not grant that directory to the container.
            environment = Marshal.StringToHGlobalUni("LOCALAPPDATA=" + Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                + "\0PATH=" + Path.Combine(systemRoot, "System32") + "\0SystemRoot=" + systemRoot
                + "\0TEMP=" + root + "\0TMP=" + root + "\0WINDIR=" + systemRoot + "\0\0");
            StartupInfoEx startup = new StartupInfoEx(); startup.Startup.Size = Marshal.SizeOf(typeof(StartupInfoEx)); startup.Attributes = attributes;
            string executable = Path.Combine(systemRoot, "System32", "cmd.exe");
            StringBuilder args = new StringBuilder(Quote(executable) + " /d /q /c " + command);
            Check(CreateProcess(executable, args, IntPtr.Zero, IntPtr.Zero, false, 0x08080404, environment, systemRoot, ref startup, out process), "create-process");
            Check(AssignProcessToJobObject(job, process.Process), "assign-job");
            IntPtr token; Check(OpenProcessToken(process.Process, 8, out token));
            try
            {
                IntPtr value = Marshal.AllocHGlobal(4);
                try { int returned; Check(GetTokenInformation(token, 29, value, 4, out returned)); if (Marshal.ReadInt32(value) != 1) throw new InvalidOperationException("Child is not an AppContainer."); }
                finally { Marshal.FreeHGlobal(value); }
            }
            finally { CloseHandle(token); }
            if (ResumeThread(process.Thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
            if (WaitForSingleObject(process.Process, 10000) != 0) { TerminateJobObject(job, 124); throw new TimeoutException(); }
            uint exitCode; Check(GetExitCodeProcess(process.Process, out exitCode)); return exitCode;
        }
        finally
        {
            if (process.Process != IntPtr.Zero) { TerminateProcess(process.Process, 125); CloseHandle(process.Process); }
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (attributes != IntPtr.Zero) { if (attributesInitialized) DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); }
            if (capabilities != IntPtr.Zero) Marshal.FreeHGlobal(capabilities);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
        }
    }

    private static string Bool(bool value) { return value ? "true" : "false"; }
    private static void CheckAncestors(string target)
    {
        DirectoryInfo current = new DirectoryInfo(Path.GetFullPath(target));
        while (current != null)
        {
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Reparse point in test path.");
            current = current.Parent;
        }
    }

    private static void CheckTree(string root)
    {
        CheckAncestors(root);
        foreach (string entry in Directory.GetFileSystemEntries(root))
        {
            FileAttributes attributes = File.GetAttributes(entry);
            if ((attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Reparse point in test tree.");
            if ((attributes & FileAttributes.Directory) != 0) CheckTree(entry);
        }
    }

    private static bool Cleanup(string id, bool removeProfile)
    {
        bool succeeded = true;
        if (removeProfile)
        {
            int result = DeleteAppContainerProfile("SPS.Isolation.PoC." + id);
            if (result != 0 && result != unchecked((int)0x80070002) && result != unchecked((int)0x80070490)) succeeded = false;
        }
        try
        {
            string temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
            string root = Path.GetFullPath(Path.Combine(temp, "sps-appcontainer-poc-" + id));
            if (!String.Equals(Path.GetDirectoryName(root), temp, StringComparison.OrdinalIgnoreCase)
                || Path.GetFileName(root) != "sps-appcontainer-poc-" + id) throw new InvalidOperationException();
            CheckAncestors(root);
            if (Directory.Exists(root)) { CheckTree(root); Directory.Delete(root, true); }
        }
        catch { succeeded = false; }
        return succeeded;
    }

    private static void RunTimeoutFixture(string id)
    {
        string name = "SPS.Isolation.PoC." + id;
        string tempRoot = Path.GetFullPath(Path.GetTempPath());
        string root = Path.Combine(tempRoot, "sps-appcontainer-poc-" + id);
        CheckAncestors(root);
        Directory.CreateDirectory(root);
        string allowed = Path.Combine(root, "allowed"), vault = Path.Combine(root, "vault-canary");
        Directory.CreateDirectory(allowed); Directory.CreateDirectory(vault);
        File.WriteAllText(Path.Combine(allowed, "read.txt"), "SPS-PUBLIC-CANARY");
        File.WriteAllText(Path.Combine(vault, "fake-secret.txt"), "SPS-FAKE-SECRET-" + id);
        IntPtr sid = IntPtr.Zero;
        int result = CreateAppContainerProfile(name, "SPS isolated canary test", "Temporary development canary only", IntPtr.Zero, 0, out sid);
        try
        {
            if (result != 0) Marshal.ThrowExceptionForHR(result);
        }
        finally
        {
            if (sid != IntPtr.Zero) FreeSid(sid);
        }
        Console.WriteLine("{\"timeoutFixtureReady\":true}");
        Console.Out.Flush();
        Thread.Sleep(Timeout.Infinite);
    }

    private static int RunReparseFixture(string id)
    {
        string tempRoot = Path.GetFullPath(Path.GetTempPath());
        string root = Path.Combine(tempRoot, "sps-appcontainer-poc-" + id);
        string tree = Path.Combine(root, "tree"), target = Path.Combine(root, "fake-target");
        string link = Path.Combine(tree, "fake-directory-link");
        bool supported = false, rejected = false, linked = false, cleanup = false;
        int errorCode = 0;
        try
        {
            CheckAncestors(root);
            Directory.CreateDirectory(tree);
            Directory.CreateDirectory(target);
            File.WriteAllText(Path.Combine(target, "fake.txt"), "SPS-REPARSE-CANARY");
            if (!CreateSymbolicLink(link, target, 3))
            {
                errorCode = Marshal.GetLastWin32Error();
                if (errorCode != 1 && errorCode != 50 && errorCode != 87 && errorCode != 1314) throw new Win32Exception(errorCode);
                errorCode = 0;
            }
            else
            {
                supported = true;
                linked = true;
                try { CheckTree(tree); }
                catch (InvalidOperationException error)
                {
                    if (error.Message != "Reparse point in test tree.") throw;
                    rejected = true;
                }
            }
        }
        catch (Win32Exception error) { errorCode = error.NativeErrorCode; }
        catch { errorCode = -1; }
        finally
        {
            if (linked)
            {
                try { Directory.Delete(link, false); }
                catch { errorCode = -1; }
            }
            cleanup = Cleanup(id, false);
        }
        bool passed = errorCode == 0 && cleanup && (!supported || rejected);
        Console.WriteLine("{\"schemaVersion\":1,\"scope\":\"development-canary-only\",\"productIsolationImplemented\":false,\"reparseFixtureSupported\":" + Bool(supported)
            + ",\"reparseRejected\":" + Bool(rejected) + ",\"cleanupSucceeded\":" + Bool(cleanup) + ",\"errorCode\":" + errorCode + ",\"passed\":" + Bool(passed) + "}");
        return passed ? 0 : 2;
    }

    public static int Main(string[] args)
    {
        Guid guid;
        if (args.Length != 2 || (args[0] != "--run" && args[0] != "--cleanup" && args[0] != "--timeout-fixture" && args[0] != "--reparse-fixture") || !Guid.TryParseExact(args[1], "N", out guid)) return 2;
        string id = guid.ToString("N");
        if (args[0] == "--cleanup")
        {
            bool succeeded = Cleanup(id, true);
            Console.WriteLine("{\"cleanupSucceeded\":" + Bool(succeeded) + "}");
            return succeeded ? 0 : 2;
        }
        if (args[0] == "--timeout-fixture")
        {
            RunTimeoutFixture(id);
            return 0;
        }
        if (args[0] == "--reparse-fixture") return RunReparseFixture(id);
        string name = "SPS.Isolation.PoC." + id;
        string tempRoot = Path.GetFullPath(Path.GetTempPath());
        string root = Path.Combine(tempRoot, "sps-appcontainer-poc-" + id);
        IntPtr sid = IntPtr.Zero;
        bool created = false, cleanup = true, allowedRead = false, allowedWrite = false, deniedRead = false, deniedWrite = false, nestedAllowed = false, nestedDenied = false, baseline = false;
        int errorCode = 0; string stage = "initialization";
        try
        {
            CheckAncestors(root);
            Directory.CreateDirectory(root);
            string allowed = Path.Combine(root, "allowed"), vault = Path.Combine(root, "vault-canary");
            Directory.CreateDirectory(allowed); Directory.CreateDirectory(vault);
            string allowFile = Path.Combine(allowed, "read.txt"), secretFile = Path.Combine(vault, "fake-secret.txt");
            File.WriteAllText(allowFile, "SPS-PUBLIC-CANARY"); File.WriteAllText(secretFile, "SPS-FAKE-SECRET-" + id);
            baseline = File.ReadAllText(secretFile) == "SPS-FAKE-SECRET-" + id;
            stage = "profile";
            int result = CreateAppContainerProfile(name, "SPS isolated canary test", "Temporary development canary only", IntPtr.Zero, 0, out sid);
            if (result != 0) Marshal.ThrowExceptionForHR(result);
            created = true;
            stage = "fixture-acl";
            SecurityIdentifier identity = new SecurityIdentifier(sid);
            DirectoryInfo directory = new DirectoryInfo(allowed);
            DirectorySecurity security = directory.GetAccessControl();
            security.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.Modify, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            directory.SetAccessControl(security);
            ProcessStartInfo aclInfo = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "icacls.exe"), Quote(allowed) + " /setintegritylevel \"(OI)(CI)L\"");
            aclInfo.UseShellExecute = false; aclInfo.CreateNoWindow = true; aclInfo.RedirectStandardOutput = true; aclInfo.RedirectStandardError = true;
            using (Process acl = Process.Start(aclInfo))
            {
                acl.BeginOutputReadLine(); acl.BeginErrorReadLine();
                if (!acl.WaitForExit(10000)) { acl.Kill(); acl.WaitForExit(5000); throw new TimeoutException(); }
                if (acl.ExitCode != 0) throw new InvalidOperationException("Fixture ACL failed.");
            }
            stage = "process-canaries";
            allowedRead = Run(sid, root, "type " + Quote(allowFile) + " >nul 2>nul") == 0;
            allowedWrite = Run(sid, root, "echo changed>>" + Quote(allowFile) + " 2>nul") == 0 && File.ReadAllText(allowFile).Contains("changed");
            deniedRead = Run(sid, root, "type " + Quote(secretFile) + " >nul 2>nul") != 0;
            deniedWrite = Run(sid, root, "echo changed>>" + Quote(secretFile) + " 2>nul") != 0 && File.ReadAllText(secretFile) == "SPS-FAKE-SECRET-" + id;
            nestedAllowed = Run(sid, root, "cmd.exe /d /q /c type " + Quote(allowFile) + " >nul 2>nul") == 0;
            nestedDenied = Run(sid, root, "cmd.exe /d /q /c type " + Quote(secretFile) + " >nul 2>nul") != 0;
            stage = "completed";
        }
        catch (Win32Exception error) { errorCode = error.NativeErrorCode; }
        catch { errorCode = -1; }
        finally
        {
            if (sid != IntPtr.Zero) FreeSid(sid);
            cleanup = Cleanup(id, created);
        }
        bool passed = stage == "completed" && baseline && allowedRead && allowedWrite && deniedRead && deniedWrite && nestedAllowed && nestedDenied && cleanup;
        Console.WriteLine("{\"schemaVersion\":1,\"scope\":\"development-canary-only\",\"productIsolationImplemented\":false,\"stage\":\"" + stage
            + "\",\"passed\":" + Bool(passed) + ",\"sameUserControlRead\":" + Bool(baseline) + ",\"allowedRead\":" + Bool(allowedRead) + ",\"allowedWrite\":" + Bool(allowedWrite)
            + ",\"vaultCanaryReadDenied\":" + Bool(deniedRead) + ",\"vaultCanaryWriteDenied\":" + Bool(deniedWrite) + ",\"nestedAllowedRead\":" + Bool(nestedAllowed) + ",\"nestedVaultReadDenied\":" + Bool(nestedDenied)
            + ",\"cleanupSucceeded\":" + Bool(cleanup) + ",\"errorCode\":" + errorCode + ",\"failedOperation\":\"" + operation + "\"}");
        return passed ? 0 : 2;
    }
}
