using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

// CI/test launcher only. Same-user privilege reduction is not a Plugin sandbox.
public static class RestrictedE2eRunner
{
    static string stage = "arguments";
    const string OwnedJobCleanupArgument = "--owned-job-cleanup-pending";
    const uint OwnedJobCleanupPendingExitCode = 76;
    const int OwnedProcessDiagnosticLimit = 256;
    [StructLayout(LayoutKind.Sequential)] struct SidAttributes { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct TokenDefaultDacl { public IntPtr DefaultDacl; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupInfo
    {
        public int Size; public string Reserved; public string Desktop; public string Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, Reserved2; public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits
    {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits
    {
        public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int Size; public IntPtr Descriptor; public int Inherit; }
    [StructLayout(LayoutKind.Sequential)] struct Accounting
    {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct ProcessEntry
    {
        public uint Size, Usage, ProcessId; public IntPtr DefaultHeapId; public uint ModuleId, Threads, ParentProcessId;
        public int BasePriority; public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string ExecutableName;
    }

    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFileW(string path, uint access, uint sharing, ref SecurityAttributes attributes, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW", SetLastError = true)] static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "Process32NextW", SetLastError = true)] static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW", SetLastError = true)]
    static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder image, ref uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr value, int length, out int returned);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr token, int kind, IntPtr value, int length);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool LookupPrivilegeNameW(string system, IntPtr luid, StringBuilder name, ref int length);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSidToSidW(string sid, out IntPtr result);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint disableCount, [In] SidAttributes[] disable, uint deleteCount, IntPtr delete, uint restrictCount, IntPtr restrict, out IntPtr token);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessAsUserW(IntPtr token, string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo info);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string descriptor, uint revision, out IntPtr result, IntPtr size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateWindowStationW(string name, uint flags, uint access, ref SecurityAttributes attributes);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool GetUserObjectInformationW(IntPtr handle, int index, IntPtr value, uint length, out uint needed);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetProcessWindowStation(IntPtr station);
    [DllImport("user32.dll", SetLastError = true)] static extern bool SetThreadDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktopW(string name, IntPtr device, IntPtr mode, uint flags, uint access, ref SecurityAttributes attributes);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseWindowStation(IntPtr station);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr desktop);

    static void Require(bool ok, string operation)
    {
        if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }
    static bool Valid(IntPtr handle) { return handle != IntPtr.Zero && handle != new IntPtr(-1); }
    static IntPtr ReadTokenInformation(IntPtr token, int kind, out int length)
    {
        length = 0;
        bool available = GetTokenInformation(token, kind, IntPtr.Zero, 0, out length);
        int error = Marshal.GetLastWin32Error();
        if (available || error != 122 || length <= 0 || length > 1048576)
            throw new Win32Exception(error, "Read token information size");
        IntPtr data = Marshal.AllocHGlobal(length);
        if (!GetTokenInformation(token, kind, data, length, out length))
        {
            error = Marshal.GetLastWin32Error();
            Marshal.FreeHGlobal(data);
            throw new Win32Exception(error, "Read token information");
        }
        return data;
    }
    static SecurityIdentifier TokenUserSid(IntPtr token)
    {
        using (var identity = new WindowsIdentity(token))
        {
            if (identity.User == null) throw new InvalidOperationException("Token has no user SID");
            return identity.User;
        }
    }
    static RawAcl ReadDefaultDacl(IntPtr token)
    {
        int length;
        IntPtr data = ReadTokenInformation(token, 6, out length);
        try
        {
            if (length < IntPtr.Size) throw new InvalidOperationException("Invalid default DACL size");
            IntPtr acl = Marshal.ReadIntPtr(data);
            if (!Valid(acl)) throw new InvalidOperationException("Restricted token has a null default DACL");
            int aclSize = Marshal.ReadInt16(acl, 2) & 0xFFFF;
            if (aclSize < 8) throw new InvalidOperationException("Invalid default DACL length");
            byte[] aclBytes = new byte[aclSize];
            Marshal.Copy(acl, aclBytes, 0, aclSize);
            return new RawAcl(aclBytes, 0);
        }
        finally { Marshal.FreeHGlobal(data); }
    }
    static bool HasUserFullAccess(RawAcl acl, SecurityIdentifier user)
    {
        for (int index = 0; index < acl.Count; index++)
        {
            QualifiedAce ace = acl[index] as QualifiedAce;
            if (ace != null && ace.AceQualifier == AceQualifier.AccessAllowed
                && ace.SecurityIdentifier.Equals(user) && (ace.AccessMask & 0x10000000) != 0)
                return true;
        }
        return false;
    }
    static bool SameAce(GenericAce left, GenericAce right)
    {
        if (left.BinaryLength != right.BinaryLength) return false;
        byte[] leftBytes = new byte[left.BinaryLength], rightBytes = new byte[right.BinaryLength];
        left.GetBinaryForm(leftBytes, 0); right.GetBinaryForm(rightBytes, 0);
        for (int index = 0; index < leftBytes.Length; index++)
            if (leftBytes[index] != rightBytes[index]) return false;
        return true;
    }
    static bool HasAcePrefix(RawAcl acl, RawAcl prefix)
    {
        if (acl.Count < prefix.Count) return false;
        for (int index = 0; index < prefix.Count; index++)
            if (!SameAce(acl[index], prefix[index])) return false;
        return true;
    }
    static void AddUserToRestrictedTokenDacl(IntPtr token)
    {
        SecurityIdentifier user = TokenUserSid(token);
        RawAcl original = ReadDefaultDacl(token);
        for (int index = 0; index < original.Count; index++)
        {
            QualifiedAce ace = original[index] as QualifiedAce;
            if (ace != null && ace.AceQualifier == AceQualifier.AccessDenied
                && ace.SecurityIdentifier.Equals(user))
                throw new InvalidOperationException("Token default DACL denies its user SID");
        }
        if (HasUserFullAccess(original, user)) return;

        var updated = new RawAcl(original.Revision, original.Count + 1);
        for (int index = 0; index < original.Count; index++)
            updated.InsertAce(updated.Count, original[index]);
        updated.InsertAce(updated.Count, new CommonAce(AceFlags.None, AceQualifier.AccessAllowed,
            unchecked((int)0x10000000), user, false, null));
        if (!HasAcePrefix(updated, original))
            throw new InvalidOperationException("Token default DACL did not preserve existing ACEs");

        byte[] aclBytes = new byte[updated.BinaryLength];
        updated.GetBinaryForm(aclBytes, 0);
        IntPtr aclData = Marshal.AllocHGlobal(aclBytes.Length);
        IntPtr information = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TokenDefaultDacl)));
        try
        {
            Marshal.Copy(aclBytes, 0, aclData, aclBytes.Length);
            Marshal.StructureToPtr(new TokenDefaultDacl { DefaultDacl = aclData }, information, false);
            Require(SetTokenInformation(token, 6, information, Marshal.SizeOf(typeof(TokenDefaultDacl))),
                "Set restricted token default DACL");
        }
        finally
        {
            Marshal.FreeHGlobal(information);
            Marshal.FreeHGlobal(aclData);
        }

        RawAcl actual = ReadDefaultDacl(token);
        if (actual.Count != updated.Count || !HasAcePrefix(actual, original)
            || !SameAce(actual[actual.Count - 1], updated[updated.Count - 1]))
            throw new InvalidOperationException("Restricted token default DACL changed existing ACEs");
        if (!HasUserFullAccess(actual, user))
            throw new InvalidOperationException("Restricted token default DACL did not retain user access");
    }
    static bool CurrentTokenDaclAllowsUser()
    {
        IntPtr token = IntPtr.Zero;
        Require(OpenProcessToken(GetCurrentProcess(), 8, out token), "Read child default DACL token");
        try { return HasUserFullAccess(ReadDefaultDacl(token), TokenUserSid(token)); }
        finally { if (Valid(token)) CloseHandle(token); }
    }
    static bool CheckAdministratorsDenyOnly(IntPtr token)
    {
        int length;
        IntPtr data = ReadTokenInformation(token, 2, out length);
        try
        {
            int offset = (IntPtr.Size + 3) & ~3;
            int entrySize = Marshal.SizeOf(typeof(SidAttributes));
            int count = length >= 4 ? Marshal.ReadInt32(data) : -1;
            if (count < 0 || offset > length || count > (length - offset) / entrySize)
                throw new InvalidOperationException("Invalid token group information");
            var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
            for (int index = 0; index < count; index++)
            {
                var group = (SidAttributes)Marshal.PtrToStructure(IntPtr.Add(data, offset + index * entrySize), typeof(SidAttributes));
                if (!new SecurityIdentifier(group.Sid).Equals(administrators)) continue;
                if ((group.Attributes & 0x10) == 0 || (group.Attributes & 0x4) != 0)
                    throw new InvalidOperationException("Administrators SID is not deny-only");
            }
            return true;
        }
        finally { Marshal.FreeHGlobal(data); }
    }
    static string Quote(string value)
    {
        if (value == null || value.IndexOf('\0') >= 0) throw new ArgumentException("Invalid launcher argument");
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }
    static string Command(string executable, params string[] args)
    {
        var command = new StringBuilder(Quote(executable));
        foreach (string arg in args) command.Append(' ').Append(Quote(arg));
        return command.ToString();
    }
    static bool Mode(string value)
    {
        return value == "probe" || value == "probe-registry" || value == "probe-exit" || value == "probe-native-exit" || value == "probe-timeout" || value == "probe-descendant" || value == "probe-node"
            || value == "probe-preview-pending" || value == "probe-preview-pending-descendant" || value == "probe-preview-failure-descendant" || value == "probe-preview-zeroexit" || value == "probe-exit-76"
            || value == "workspace-pending" || value == "workspace-pending-descendant" || value == "workspace-failure-descendant" || value == "workspace-zeroexit"
            || value == "runtime-discovery" || value == "native-management" || value == "native-plugin-sdk" || value == "execution-control" || value == "workspace-surfaces"
            || value == "plugin-preview" || value == "host-plugin-lifecycle" || value == "installer-data-preservation"
            || value == "owner-vault-transfer" || value == "owner-vault-crash-recovery";
    }
    static bool OwnedJobGateMode(string value)
    {
        return value == "plugin-preview" || value == "host-plugin-lifecycle" || value == "installer-data-preservation" || value == "runtime-discovery" || value == "native-management" || value == "native-plugin-sdk" || value == "execution-control" || value == "workspace-surfaces"
            || value == "owner-vault-transfer" || value == "owner-vault-crash-recovery"
            || value == "probe-preview-pending"
            || value == "probe-preview-pending-descendant" || value == "probe-preview-failure-descendant"
            || value == "probe-preview-zeroexit" || value == "workspace-pending"
            || value == "workspace-pending-descendant" || value == "workspace-failure-descendant" || value == "workspace-zeroexit";
    }
    static int OwnedJobWaitMilliseconds(string mode)
    {
        return mode == "probe-preview-pending-descendant" || mode == "probe-preview-failure-descendant"
            || mode == "workspace-pending-descendant" || mode == "workspace-failure-descendant" ? 1500 : 10000;
    }
    static IntPtr EnvironmentBlock()
    {
        // Preserve Windows/Node discovery and the three explicit fixture settings,
        // not CI credentials or arbitrary SPS/provider execution configuration.
        var allowed = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string name in new[] {
            "SystemRoot", "WINDIR", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "TEMP", "TMP",
            "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
            "ProgramW6432", "CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432",
            "HOME", "HOMEDRIVE", "HOMEPATH", "GITHUB_ACTIONS", "RUNNER_OS", "RUNNER_ENVIRONMENT", "CI",
            "SPS_DESKTOP_E2E_SOURCE", "SPS_DESKTOP_E2E_BINARY", "SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS"
        })
        {
            string value = Environment.GetEnvironmentVariable(name);
            if (value != null) allowed.Add(name, value);
        }
        var block = new StringBuilder();
        foreach (var entry in allowed) block.Append(entry.Key).Append('=').Append(entry.Value).Append('\0');
        block.Append('\0');
        return Marshal.StringToHGlobalUni(block.ToString());
    }
    static int RunNode(string node, string directory, string script, params string[] args)
    {
        return RunNodeFile(node, directory, Path.Combine(directory, "scripts", script), args);
    }
    static int RunNodeFile(string node, string workingDirectory, string entrypoint, params string[] args)
    {
        stage = "child_script";
        var arguments = new StringBuilder(Quote(entrypoint));
        foreach (string arg in args) arguments.Append(' ').Append(Quote(arg));
        var start = new ProcessStartInfo(node, arguments.ToString());
        start.WorkingDirectory = workingDirectory; start.UseShellExecute = false; start.CreateNoWindow = true;
        start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
        start.StandardOutputEncoding = Encoding.UTF8; start.StandardErrorEncoding = Encoding.UTF8;
        start.EnvironmentVariables.Remove("NODE_OPTIONS");
        start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        using (var process = new Process())
        {
            process.StartInfo = start;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs value) { if (value.Data != null) Console.Out.WriteLine(value.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs value) { if (value.Data != null) Console.Error.WriteLine(value.Data); };
            process.Start(); process.StandardInput.Close(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
            process.WaitForExit(); return process.ExitCode;
        }
    }
    static int RunNativePluginSdk(string node, string desktopDirectory)
    {
        string repositoryDirectory = Path.GetFullPath(Path.Combine(desktopDirectory, "..", ".."));
        string coreDirectory = Path.Combine(repositoryDirectory, "external", "sps-core");
        string tsx = Path.Combine(coreDirectory, "packages", "db", "node_modules", "tsx", "dist", "cli.mjs");
        string smoke = Path.Combine(desktopDirectory, "scripts", "smoke-native-workspace-channel.mjs");
        if (!File.Exists(tsx) || !File.Exists(smoke)) throw new FileNotFoundException("Native SDK smoke entrypoint is unavailable.");
        int code = RunNodeFile(node, coreDirectory, tsx, smoke, "--isolated-native-workspace-channel", "--with-native-plugin-sdk");
        // Require the owning helper to observe the entire restricted process job
        // naturally empty after the smoke itself confirms Electron close.
        return code == 0 ? unchecked((int)OwnedJobCleanupPendingExitCode) : code;
    }
    static int Child(string mode, string node, string directory)
    {
        stage = "child_token";
        var principal = new WindowsPrincipal(WindowsIdentity.GetCurrent());
        if (principal.IsInRole(WindowsBuiltInRole.Administrator) || principal.IsInRole(WindowsBuiltInRole.PowerUser))
            throw new InvalidOperationException("Child token retains administrative group authority");
        bool administratorDenied = CheckPrivileges();
        bool userDefaultDacl = CurrentTokenDaclAllowsUser();
        if (!administratorDenied || !userDefaultDacl) throw new InvalidOperationException("Child token security checks failed");
        Console.WriteLine("{\"restrictedE2eChild\":true,\"administratorEnabled\":false,\"powerUsersEnabled\":false,\"privilegesReduced\":true,\"sameUserToken\":true,\"administratorDenied\":" + (administratorDenied ? "true" : "false") + ",\"userDefaultDacl\":" + (userDefaultDacl ? "true" : "false") + "}");
        if (mode == "probe") return 0;
        if (mode == "probe-registry")
        {
            Environment.SetEnvironmentVariable("SPS_INSTALLER_REGISTRY_QUERY_HELPER",
                System.Reflection.Assembly.GetExecutingAssembly().Location);
            return RunNode(node, directory, "windows-e2e/probe-installer-registry.mjs");
        }
        if (mode == "probe-exit") return 7;
        if (mode == "probe-exit-76") return unchecked((int)OwnedJobCleanupPendingExitCode);
        if (mode == "probe-native-exit") return unchecked((int)0xC0000142);
        if (mode == "probe-timeout") { System.Threading.Thread.Sleep(60000); return 1; }
        if (mode == "probe-preview-pending") return unchecked((int)OwnedJobCleanupPendingExitCode);
        if (mode == "probe-preview-zeroexit") return 0;
        if (mode == "workspace-pending") return unchecked((int)OwnedJobCleanupPendingExitCode);
        if (mode == "workspace-zeroexit") return 0;
        if (mode == "probe-descendant" || mode == "probe-preview-pending-descendant" || mode == "probe-preview-failure-descendant"
            || mode == "workspace-pending-descendant" || mode == "workspace-failure-descendant")
        {
            var start = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "--probe-leaf");
            start.UseShellExecute = false; start.CreateNoWindow = true;
            using (var descendant = Process.Start(start))
            {
                if (descendant.HasExited) throw new InvalidOperationException("Missing owned descendant");
                Console.WriteLine("{\"ownedDescendantCreated\":true}");
            }
            if (mode == "probe-preview-pending-descendant" || mode == "workspace-pending-descendant")
                return unchecked((int)OwnedJobCleanupPendingExitCode);
            return mode == "probe-preview-failure-descendant" || mode == "workspace-failure-descendant" ? 7 : 0;
        }
        if (mode == "probe-node") return RunNode(node, directory, "windows-e2e/probe-node.mjs", "a \"quoted\" value", "tail\\", "unicode-\uD55C\uAE00");
        if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true"
            || Environment.GetEnvironmentVariable("RUNNER_OS") != "Windows")
            throw new InvalidOperationException("Desktop launch mode is restricted to Windows CI");
        if ((mode == "owner-vault-transfer" || mode == "owner-vault-crash-recovery")
            && Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted")
            throw new InvalidOperationException("Owner Vault E2E requires a GitHub-hosted runner");
        foreach (string script in new[] { "sync-local-desktop-node.mjs", "sync-local-plugin-sdk.mjs" })
        {
            // The normal build stage prepares these copies and native helpers.
            // A restricted acceptance child verifies them without recompiling
            // into the checkout or mutating installed dependency snapshots.
            int code = RunNode(node, directory, script, "--check");
            if (code != 0) return code;
        }
        if (mode == "runtime-discovery") return RunNode(node, directory, "smoke-workspace-surfaces-desktop.mjs", "--runtime-discovery", OwnedJobCleanupArgument);
        if (mode == "native-management") return RunNode(node, directory, "smoke-workspace-surfaces-desktop.mjs", "--native-management", OwnedJobCleanupArgument);
        if (mode == "native-plugin-sdk") return RunNativePluginSdk(node, directory);
        if (mode == "execution-control") return RunNode(node, directory, "smoke-workspace-surfaces-desktop.mjs", "--execution-control", OwnedJobCleanupArgument);
        if (mode == "workspace-surfaces") return RunNode(node, directory, "smoke-workspace-surfaces-desktop.mjs", OwnedJobCleanupArgument);
        if (mode == "owner-vault-transfer") return RunNode(node, directory, "smoke-owner-vault-transfer-desktop.mjs", OwnedJobCleanupArgument);
        if (mode == "owner-vault-crash-recovery") return RunNode(node, directory, "smoke-owner-vault-transfer-desktop.mjs", "--crash-after-promotion", OwnedJobCleanupArgument);
        if (mode == "plugin-preview") return RunNode(node, directory, "smoke-plugin-preview-desktop.mjs", OwnedJobCleanupArgument);
        if (mode == "installer-data-preservation")
        {
            if (Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted")
                throw new InvalidOperationException("Installer data preservation E2E requires a GitHub-hosted runner");
            Environment.SetEnvironmentVariable("SPS_INSTALLER_REGISTRY_QUERY_HELPER",
                System.Reflection.Assembly.GetExecutingAssembly().Location);
            return RunNode(node, directory, "smoke-installer-data-preservation.mjs", OwnedJobCleanupArgument);
        }
        return RunNode(node, directory, "smoke-host-plugin-lifecycle-desktop.mjs", OwnedJobCleanupArgument);
    }
    static bool CheckPrivileges()
    {
        IntPtr token = IntPtr.Zero, data = IntPtr.Zero;
        try
        {
            Require(OpenProcessToken(GetCurrentProcess(), 8, out token), "Read child token");
            int length; GetTokenInformation(token, 3, IntPtr.Zero, 0, out length);
            if (length < 4 || length > 16384) throw new InvalidOperationException("Invalid privilege size");
            data = Marshal.AllocHGlobal(length);
            Require(GetTokenInformation(token, 3, data, length, out length), "Read child privileges");
            int count = Marshal.ReadInt32(data);
            if (count < 0 || count > (length - 4) / 12) throw new InvalidOperationException("Invalid privilege count");
            for (int index = 0; index < count; index++)
            {
                int size = 128; var name = new StringBuilder(size);
                Require(LookupPrivilegeNameW(null, IntPtr.Add(data, 4 + index * 12), name, ref size), "Resolve child privilege");
                if (name.ToString() != "SeChangeNotifyPrivilege") throw new InvalidOperationException("Child retains extra privilege");
            }
            return CheckAdministratorsDenyOnly(token);
        }
        finally { if (data != IntPtr.Zero) Marshal.FreeHGlobal(data); if (Valid(token)) CloseHandle(token); }
    }
    static void TerminateAndConfirmJob(IntPtr job)
    {
        Require(TerminateJobObject(job, 125), "Terminate owned E2E descendants");
        var deadline = Stopwatch.StartNew();
        for (;;)
        {
            Accounting info;
            Require(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero), "Inspect E2E job cleanup");
            if (info.ActiveProcesses == 0) return;
            if (deadline.ElapsedMilliseconds > 10000) throw new InvalidOperationException("Owned E2E descendants remain");
            System.Threading.Thread.Sleep(20);
        }
    }
    static string SanitizedImageName(string value)
    {
        if (String.IsNullOrEmpty(value) || value.Length > 64) return "unavailable";
        foreach (char c in value) if (!(Char.IsLetterOrDigit(c) || c == '_' || c == '-' || c == '.')) return "unavailable";
        return value;
    }
    static Dictionary<uint, ProcessEntry> SnapshotProcessParents(out bool readOK)
    {
        readOK = false;
        var entries = new Dictionary<uint, ProcessEntry>();
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
        if (!Valid(snapshot)) return entries;
        try
        {
            var entry = new ProcessEntry();
            entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
            if (!Process32First(snapshot, ref entry)) return entries;
            do
            {
                if (entries.Count >= 32768) return new Dictionary<uint, ProcessEntry>();
                if (entry.ProcessId > 0 && entry.ExecutableName != null) entries[entry.ProcessId] = entry;
                entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
            } while (Process32Next(snapshot, ref entry));
            readOK = true;
            return entries;
        }
        catch { return new Dictionary<uint, ProcessEntry>(); }
        finally { CloseHandle(snapshot); }
    }
    static int OwnedProcessCategory(IntPtr job, uint processId, uint exitedRunnerChildProcessId, out bool readOK, out string imageName, out int readFailureStage, out int openProcessError)
    {
        readOK = false;
        imageName = "unavailable";
        // Fixed, path-free stages identify which Windows query failed without
        // turning an unreadable process into an accepted cleanup result.
        readFailureStage = 0;
        openProcessError = 0;
        // The launcher's exact child is known to have exited once its retained
        // process handle was signaled. Windows may still return that PID in
        // the Job list while the handle remains open; it is not a live process
        // whose image can still be queried.
        if (exitedRunnerChildProcessId != 0 && processId == exitedRunnerChildProcessId)
        {
            readOK = true;
            imageName = "exited_runner_child";
            return 10;
        }
        IntPtr process = IntPtr.Zero;
        try
        {
            process = OpenProcess(0x1000, false, processId);
            if (!Valid(process)) { readFailureStage = 1; openProcessError = Marshal.GetLastWin32Error(); return 5; }

            bool inJob;
            if (!IsProcessInJob(process, job, out inJob) || !inJob) { readFailureStage = 2; return 5; }

            uint imageLength = 32768;
            var image = new StringBuilder((int)imageLength);
            if (!QueryFullProcessImageName(process, 0, image, ref imageLength)) { readFailureStage = 3; return 5; }
            string imagePath = Path.GetFullPath(image.ToString());
            string name = Path.GetFileName(imagePath);
            if (String.IsNullOrEmpty(name)) { readFailureStage = 4; return 5; }

            readOK = true;
            imageName = SanitizedImageName(name);
            if (String.Equals(name, "node.exe", StringComparison.OrdinalIgnoreCase)) return 0;
            if (String.Equals(name, "postgres.exe", StringComparison.OrdinalIgnoreCase)) return 1;
            if (String.Equals(name, "electron.exe", StringComparison.OrdinalIgnoreCase)) return 2;
            if (String.Equals(name, "chrome_crashpad_handler.exe", StringComparison.OrdinalIgnoreCase)
                || String.Equals(name, "crashpad_handler.exe", StringComparison.OrdinalIgnoreCase)) return 3;
            string systemDirectory = Path.GetFullPath(Environment.SystemDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (String.Equals(imagePath, Path.Combine(systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"), StringComparison.OrdinalIgnoreCase)) return 6;
            if (String.Equals(imagePath, Path.Combine(systemDirectory, "cmd.exe"), StringComparison.OrdinalIgnoreCase)) return 7;
            if (String.Equals(imagePath, Path.Combine(systemDirectory, "conhost.exe"), StringComparison.OrdinalIgnoreCase)
                || String.Equals(imagePath, Path.Combine(systemDirectory, "OpenConsole.exe"), StringComparison.OrdinalIgnoreCase)) return 8;
            if (String.Equals(imagePath, Path.Combine(systemDirectory, "WerFault.exe"), StringComparison.OrdinalIgnoreCase)
                || String.Equals(imagePath, Path.Combine(systemDirectory, "WerFaultSecure.exe"), StringComparison.OrdinalIgnoreCase)
                || String.Equals(imagePath, Path.Combine(systemDirectory, "wermgr.exe"), StringComparison.OrdinalIgnoreCase)) return 9;
            return 4;
        }
        catch { readFailureStage = 5; return 5; }
        finally { if (Valid(process)) CloseHandle(process); }
    }
    static List<uint> ReadOwnedJobProcessIds(IntPtr job, out uint total, out bool truncated, out bool readOK)
    {
        total = 0;
        truncated = false;
        readOK = false;
        IntPtr buffer = IntPtr.Zero;
        try
        {
            uint bufferSize = (uint)(8 + OwnedProcessDiagnosticLimit * IntPtr.Size);
            buffer = Marshal.AllocHGlobal((int)bufferSize);
            if (!QueryInformationJobObject(job, 3, buffer, bufferSize, IntPtr.Zero))
            {
                truncated = Marshal.GetLastWin32Error() == 234;
                return null;
            }
            total = unchecked((uint)Marshal.ReadInt32(buffer));
            uint bounded = unchecked((uint)Marshal.ReadInt32(buffer, 4));
            if (bounded > OwnedProcessDiagnosticLimit || bounded > total)
            {
                total = 0;
                truncated = true;
                return null;
            }
            truncated = bounded < total;
            var ids = new List<uint>((int)bounded);
            for (uint index = 0; index < bounded; index++)
            {
                int offset = 8 + (int)index * IntPtr.Size;
                uint processId = IntPtr.Size == 8
                    ? unchecked((uint)Marshal.ReadInt64(buffer, offset))
                    : unchecked((uint)Marshal.ReadInt32(buffer, offset));
                ids.Add(processId);
            }
            readOK = true;
            return ids;
        }
        catch { return null; }
        finally { if (Valid(buffer)) Marshal.FreeHGlobal(buffer); }
    }
    static bool SameJobProcessIds(List<uint> left, List<uint> right)
    {
        if (left == null || right == null || left.Count != right.Count) return false;
        left.Sort();
        right.Sort();
        for (int index = 0; index < left.Count; index++) if (left[index] != right[index]) return false;
        return true;
    }
    static void WriteOwnedJobProcessDiagnostics(IntPtr job, uint exitedRunnerChildProcessId, int collectionAttempt = 0)
    {
        uint total = 0, bounded = 0;
        int node = 0, postgres = 0, electron = 0, crashpad = 0, other = 0, unavailable = 0;
        int powershell = 0, shell = 0, console = 0, windowsError = 0;
        int exitedParent = 0;
        int unavailableOpenProcess = 0, unavailableJobCheck = 0, unavailableImageRead = 0;
        int unavailableImageName = 0, unavailableException = 0;
        int openProcessAccessDenied = 0, openProcessInvalidParameter = 0, openProcessOtherError = 0;
        bool parentSnapshotOK = false;
        var unknownImages = new List<string>();
        bool truncated = false, readOK = true;
        uint initialTotal, finalTotal;
        bool initialTruncated, initialReadOK, finalTruncated, finalReadOK;
        List<uint> initialIds = ReadOwnedJobProcessIds(job, out initialTotal, out initialTruncated, out initialReadOK);
        List<uint> failedOpenProcessIds = new List<uint>();
        List<uint> workingIds = new List<uint>();
        bool openProcessFailed = false;
        IntPtr buffer = IntPtr.Zero;
        try
        {
            uint bufferSize = (uint)(8 + OwnedProcessDiagnosticLimit * IntPtr.Size);
            buffer = Marshal.AllocHGlobal((int)bufferSize);
            if (!QueryInformationJobObject(job, 3, buffer, bufferSize, IntPtr.Zero))
            {
                truncated = Marshal.GetLastWin32Error() == 234; // ERROR_MORE_DATA; no uninitialized buffer reads.
                readOK = false;
            }
            else
            {
                total = unchecked((uint)Marshal.ReadInt32(buffer));
                bounded = unchecked((uint)Marshal.ReadInt32(buffer, 4));
                if (bounded > OwnedProcessDiagnosticLimit || bounded > total)
                {
                    total = 0;
                    bounded = 0;
                    truncated = true;
                    readOK = false;
                }
                else
                {
                    truncated = bounded < total;
                    bool parentReadOK;
                    Dictionary<uint, ProcessEntry> processParents = SnapshotProcessParents(out parentReadOK);
                    parentSnapshotOK = parentReadOK;
                    if (!parentReadOK) readOK = false;
                    for (uint index = 0; index < bounded; index++)
                    {
                        int category = 5;
                        bool processReadOK = false;
                        int readFailureStage = 0;
                        int openProcessError = 0;
                        string imageName = "unavailable";
                        try
                        {
                            int offset = 8 + (int)index * IntPtr.Size;
                            uint processId = IntPtr.Size == 8
                                ? unchecked((uint)Marshal.ReadInt64(buffer, offset))
                                : unchecked((uint)Marshal.ReadInt32(buffer, offset));
                            workingIds.Add(processId);
                            category = OwnedProcessCategory(job, processId, exitedRunnerChildProcessId, out processReadOK, out imageName, out readFailureStage, out openProcessError);
                            if (readFailureStage == 1) { openProcessFailed = true; failedOpenProcessIds.Add(processId); }
                            if (category == 4 && unknownImages.Count < OwnedProcessDiagnosticLimit)
                            {
                                string parentName = "unavailable";
                                ProcessEntry childEntry;
                                if (processParents.TryGetValue(processId, out childEntry))
                                {
                                    ProcessEntry parentEntry;
                                    if (processParents.TryGetValue(childEntry.ParentProcessId, out parentEntry))
                                        parentName = SanitizedImageName(parentEntry.ExecutableName);
                                }
                                unknownImages.Add("{\"image\":\"" + imageName + "\",\"parentImage\":\"" + parentName + "\"}");
                            }
                        }
                        catch { }
                        if (!processReadOK) readOK = false;
                        if (readFailureStage == 1) unavailableOpenProcess++;
                        else if (readFailureStage == 2) unavailableJobCheck++;
                        else if (readFailureStage == 3) unavailableImageRead++;
                        else if (readFailureStage == 4) unavailableImageName++;
                        else if (readFailureStage == 5) unavailableException++;
                        if (readFailureStage == 1) {
                            if (openProcessError == 5) openProcessAccessDenied++;
                            else if (openProcessError == 87) openProcessInvalidParameter++;
                            else openProcessOtherError++;
                        }
                        if (category == 0) node++;
                        else if (category == 1) postgres++;
                        else if (category == 2) electron++;
                        else if (category == 3) crashpad++;
                        else if (category == 4) other++;
                        else if (category == 6) powershell++;
                        else if (category == 7) shell++;
                        else if (category == 8) console++;
                        else if (category == 9) windowsError++;
                        else if (category == 10) exitedParent++;
                        else unavailable++;
                    }
                }
            }
        }
        catch { readOK = false; }
        finally
        {
            try { if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer); }
            catch { readOK = false; }
        }

        List<uint> finalIds = ReadOwnedJobProcessIds(job, out finalTotal, out finalTruncated, out finalReadOK);
        bool membershipStable = initialReadOK && finalReadOK && !initialTruncated && !finalTruncated
            && SameJobProcessIds(initialIds, workingIds) && SameJobProcessIds(initialIds, finalIds);
        if (!initialReadOK || !finalReadOK || initialTruncated || finalTruncated) readOK = false;
        if (!membershipStable && collectionAttempt == 0 && openProcessFailed && initialReadOK && finalReadOK
            && !initialTruncated && !finalTruncated
            && failedOpenProcessIds.Exists(processId => !finalIds.Contains(processId)))
        {
            // A PID disappeared from the actual Job set while OpenProcess was
            // inspecting the earlier snapshot. Discard the mixed-time result
            // and recollect once. Stable unreadable PIDs remain failures.
            WriteOwnedJobProcessDiagnostics(job, exitedRunnerChildProcessId, 1);
            return;
        }
        if (!membershipStable) readOK = false;

        try
        {
            Console.WriteLine("{\"node\":" + node + ",\"postgres\":" + postgres + ",\"electron\":" + electron
                + ",\"crashpad\":" + crashpad + ",\"other\":" + other + ",\"unavailable\":" + unavailable
                + ",\"powershell\":" + powershell + ",\"shell\":" + shell + ",\"console\":" + console + ",\"windowsError\":" + windowsError
                + ",\"exitedParent\":" + exitedParent
                + ",\"unavailableOpenProcess\":" + unavailableOpenProcess
                + ",\"unavailableJobCheck\":" + unavailableJobCheck
                + ",\"unavailableImageRead\":" + unavailableImageRead
                + ",\"unavailableImageName\":" + unavailableImageName
                + ",\"unavailableException\":" + unavailableException
                + ",\"openProcessAccessDenied\":" + openProcessAccessDenied
                + ",\"openProcessInvalidParameter\":" + openProcessInvalidParameter
                + ",\"openProcessOtherError\":" + openProcessOtherError
                + ",\"parentSnapshotOK\":" + (parentSnapshotOK ? "true" : "false")
                + ",\"total\":" + total + ",\"bounded\":" + bounded + ",\"truncated\":"
                + (truncated ? "true" : "false") + ",\"readOK\":" + (readOK ? "true" : "false")
                + ",\"unknownImages\":[" + String.Join(",", unknownImages.ToArray()) + "]}");
        }
        catch { }
    }
    static bool WaitForNaturalJobEmpty(IntPtr job, int timeoutMilliseconds)
    {
        var deadline = Stopwatch.StartNew();
        for (;;)
        {
            Accounting info;
            if (!QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero))
            {
                int error = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("restricted_e2e_job_query_error:code=" + error + ",hex=0x" + unchecked((uint)error).ToString("X8"));
                return false;
            }
            if (info.ActiveProcesses == 0) return true;
            if (deadline.ElapsedMilliseconds >= timeoutMilliseconds) return false;
            System.Threading.Thread.Sleep(20);
        }
    }
    static string WindowStationName(IntPtr station)
    {
        uint required;
        GetUserObjectInformationW(station, 2, IntPtr.Zero, 0, out required);
        if (required < 2 || required > 32768) throw new InvalidOperationException("Invalid E2E window station name size");
        IntPtr buffer = Marshal.AllocHGlobal((int)required);
        try
        {
            Require(GetUserObjectInformationW(station, 2, buffer, required, out required), "Read E2E window station name");
            string name = Marshal.PtrToStringUni(buffer);
            if (String.IsNullOrEmpty(name) || name.IndexOf('\\') >= 0) throw new InvalidOperationException("Invalid E2E window station name");
            return name;
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }
    static void CreatePrivateDesktop(out IntPtr station, out IntPtr desktop, out string desktopPath, out bool privateWindowStation)
    {
        station = IntPtr.Zero; desktop = IntPtr.Zero; desktopPath = null; privateWindowStation = false;
        stage = "window_station_setup";
        IntPtr stationDescriptor = IntPtr.Zero, desktopDescriptor = IntPtr.Zero;
        IntPtr originalStation = GetProcessWindowStation();
        IntPtr originalDesktop = GetThreadDesktop(GetCurrentThreadId());
        if (!Valid(originalStation) || !Valid(originalDesktop)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Read original window station and desktop");
        bool stationChanged = false, desktopCreated = false;
        try
        {
            string userSid = WindowsIdentity.GetCurrent().User.Value;
            string stationSddl = "D:P(A;;0x000F037F;;;" + userSid + ")(A;;0x000F037F;;;SY)";
            Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(stationSddl, 1, out stationDescriptor, IntPtr.Zero), "Build E2E window station security descriptor");
            var stationSecurity = new SecurityAttributes { Size = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = stationDescriptor, Inherit = 0 };

            // Named stations are private where permitted; non-admin callers keep their station and still get an isolated desktop.
            string requestedStationName = "SpsE2e_" + Guid.NewGuid().ToString("N");
            station = CreateWindowStationW(requestedStationName, 1, 0x000F037F, ref stationSecurity);
            string stationName;
            if (Valid(station))
            {
                privateWindowStation = true;
                stationName = WindowStationName(station);
                Require(SetProcessWindowStation(station), "Select owned E2E window station"); stationChanged = true;
            }
            else
            {
                int nativeError = Marshal.GetLastWin32Error();
                if (nativeError != 5) throw new Win32Exception(nativeError, "Create owned E2E window station");
                stationName = WindowStationName(originalStation);
            }

            stage = "desktop_setup";
            string desktopName = "SpsE2e_" + Guid.NewGuid().ToString("N");
            string desktopSddl = "D:P(A;;0x000F01FF;;;" + userSid + ")(A;;0x000F01FF;;;SY)";
            Require(ConvertStringSecurityDescriptorToSecurityDescriptorW(desktopSddl, 1, out desktopDescriptor, IntPtr.Zero), "Build E2E desktop security descriptor");
            var desktopSecurity = new SecurityAttributes { Size = Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = desktopDescriptor, Inherit = 0 };
            desktop = CreateDesktopW(desktopName, IntPtr.Zero, IntPtr.Zero, 0, 0x000F01FF, ref desktopSecurity);
            Require(Valid(desktop), "Create owned E2E desktop"); desktopCreated = true;
            desktopPath = stationName + "\\" + desktopName;
        }
        finally
        {
            try
            {
                if (stationChanged)
                {
                    stage = "restore_window_station";
                    Require(SetProcessWindowStation(originalStation), "Restore caller window station");
                }
                if (desktopCreated)
                {
                    stage = "restore_thread_desktop";
                    Require(SetThreadDesktop(originalDesktop), "Restore caller thread desktop");
                }
            }
            finally
            {
                if (stationDescriptor != IntPtr.Zero) LocalFree(stationDescriptor);
                if (desktopDescriptor != IntPtr.Zero) LocalFree(desktopDescriptor);
            }
        }
    }
    static bool CloseOwnedWindowObjects(IntPtr desktop, IntPtr station)
    {
        bool closedAll = true;
        string desktopState = "not_owned", stationState = "not_owned";
        if (Valid(desktop))
        {
            if (CloseDesktop(desktop)) desktopState = "closed";
            else
            {
                int error = Marshal.GetLastWin32Error();
                desktopState = "failed"; closedAll = false;
                Console.Error.WriteLine("restricted_e2e_cleanup_error:phase=owned_object_cleanup,resource=desktop,code=" + error + ",hex=0x" + unchecked((uint)error).ToString("X8"));
            }
        }
        if (Valid(station))
        {
            if (CloseWindowStation(station)) stationState = "closed";
            else
            {
                int error = Marshal.GetLastWin32Error();
                stationState = "failed"; closedAll = false;
                Console.Error.WriteLine("restricted_e2e_cleanup_error:phase=owned_object_cleanup,resource=window_station,code=" + error + ",hex=0x" + unchecked((uint)error).ToString("X8"));
            }
        }
        Console.WriteLine("{\"ownedDesktopClose\":\"" + desktopState + "\",\"ownedWindowStationClose\":\"" + stationState + "\"}");
        return closedAll;
    }
    static int Launch(string mode, string node, string directory)
    {
        stage = "token_setup";
        IntPtr token = IntPtr.Zero, restricted = IntPtr.Zero, admin = IntPtr.Zero, power = IntPtr.Zero;
        IntPtr job = IntPtr.Zero, attributes = IntPtr.Zero, handles = IntPtr.Zero, environment = IntPtr.Zero;
        IntPtr windowStation = IntPtr.Zero, desktop = IntPtr.Zero;
        IntPtr input = IntPtr.Zero, output = IntPtr.Zero, error = IntPtr.Zero;
        bool attributesInitialized = false, assigned = false;
        bool childExitObserved = false, cleanupWasForced = false;
        uint childExitCode = 125;
        ProcessInfo child = new ProcessInfo();
        int resultCode = 125;
        try
        {
            Require(OpenProcessToken(GetCurrentProcess(), 0x008B, out token), "Open caller token");
            Require(ConvertStringSidToSidW("S-1-5-32-544", out admin), "Allocate Administrators SID");
            Require(ConvertStringSidToSidW("S-1-5-32-547", out power), "Allocate Power Users SID");
            var disabled = new[] { new SidAttributes { Sid = admin }, new SidAttributes { Sid = power } };
            Require(CreateRestrictedToken(token, 0x1, 2, disabled, 0, IntPtr.Zero, 0, IntPtr.Zero, out restricted), "Restrict caller token");
            using (var original = new WindowsIdentity(token))
            using (var reduced = new WindowsIdentity(restricted))
                if (original.User != reduced.User) throw new InvalidOperationException("Restricted token changed user");
            stage = "token_dacl_setup";
            AddUserToRestrictedTokenDacl(restricted);
            job = CreateJobObjectW(IntPtr.Zero, null); Require(Valid(job), "Create E2E job");
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE, no breakaway.
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))), "Set E2E job cleanup");

            stage = "handle_setup";
            var security = new SecurityAttributes { Size = Marshal.SizeOf(typeof(SecurityAttributes)), Inherit = 1 };
            input = CreateFileW("NUL", 0x80000000, 3, ref security, 3, 0, IntPtr.Zero); Require(Valid(input), "Open empty stdin");
            Require(DuplicateHandle(GetCurrentProcess(), GetStdHandle(-11), GetCurrentProcess(), out output, 0, true, 2), "Duplicate stdout");
            Require(DuplicateHandle(GetCurrentProcess(), GetStdHandle(-12), GetCurrentProcess(), out error, 0, true, 2), "Duplicate stderr");
            IntPtr bytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref bytes);
            if (bytes == IntPtr.Zero) throw new InvalidOperationException("Missing process attribute size");
            attributes = Marshal.AllocHGlobal(bytes);
            Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref bytes), "Initialize process attributes");
            attributesInitialized = true;
            handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
            Marshal.Copy(new[] { input, output, error }, 0, handles, 3);
            Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero), "Limit inherited handles");
            var startup = new StartupInfoEx(); startup.Startup.Size = Marshal.SizeOf(typeof(StartupInfoEx));
            startup.Startup.Flags = 0x100; startup.Startup.Input = input; startup.Startup.Output = output; startup.Startup.Error = error;
            startup.Attributes = attributes;
            string desktopPath;
            bool privateWindowStation;
            CreatePrivateDesktop(out windowStation, out desktop, out desktopPath, out privateWindowStation);
            startup.Startup.Desktop = desktopPath;
            Console.WriteLine("{\"restrictedE2eDesktop\":true,\"privateWindowStation\":" + (privateWindowStation ? "true" : "false") + "}");
            stage = "child_creation";
            string self = Process.GetCurrentProcess().MainModule.FileName;
            var command = new StringBuilder(Command(self, "--child", mode, node, directory));
            environment = EnvironmentBlock();
            Require(CreateProcessAsUserW(restricted, self, command, IntPtr.Zero, IntPtr.Zero, true,
                0x08080404, environment, directory, ref startup, out child), "Create restricted E2E child");
            Require(AssignProcessToJobObject(job, child.Process), "Assign suspended child to cleanup job"); assigned = true;
            Require(ResumeThread(child.Thread) != 0xFFFFFFFF, "Resume E2E child");
            stage = "child_wait";
            uint wait = WaitForSingleObject(child.Process, mode == "probe-timeout" ? 1500u : 18u * 60u * 1000u);
            if (wait == 258)
            {
                Require(TerminateJobObject(job, 124), "Terminate timed-out E2E job");
                cleanupWasForced = true;
                Require(WaitForSingleObject(child.Process, 10000) == 0, "Confirm timed-out child exit");
                Console.Error.WriteLine("restricted_e2e_timeout:phase=child_wait"); resultCode = 124;
            }
            else
            {
                Require(wait == 0, "Wait for E2E child");
                stage = "child_exit";
                uint code; Require(GetExitCodeProcess(child.Process, out code), "Read E2E exit code");
                childExitObserved = true; childExitCode = code;
                bool pendingCode = code == OwnedJobCleanupPendingExitCode && OwnedJobGateMode(mode);
                if (code != 0 && !pendingCode) Console.Error.WriteLine("restricted_e2e_child_exit:phase=child_exit,mode=" + mode + ",code=" + code + ",hex=0x" + code.ToString("X8"));
                if (mode == "probe-descendant")
                {
                    Accounting info;
                    Require(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero), "Inspect descendant fixture");
                    if (info.TotalProcesses < 2 || info.ActiveProcesses < 1) throw new InvalidOperationException("Descendant fixture was not live");
                }
                resultCode = unchecked((int)code);
            }
        }
        finally
        {
            try
            {
                if (Valid(child.Process))
                {
                    if (!assigned) Require(TerminateProcess(child.Process, 125), "Terminate unassigned suspended child");
                    else if (Valid(job) && OwnedJobGateMode(mode))
                    {
                        if (cleanupWasForced)
                        {
                            TerminateAndConfirmJob(job);
                            Console.WriteLine("{\"ownedJobEmpty\":true,\"ownedJobCleanup\":\"forced\",\"accepted\":false}");
                            if (resultCode == 0 || resultCode == unchecked((int)OwnedJobCleanupPendingExitCode)) resultCode = 125;
                        }
                        else
                        {
                            bool naturallyEmpty = WaitForNaturalJobEmpty(job, OwnedJobWaitMilliseconds(mode));
                            if (naturallyEmpty)
                            {
                                Console.WriteLine("{\"ownedJobEmpty\":true,\"ownedJobCleanup\":\"natural\"}");
                                if (childExitObserved && childExitCode == OwnedJobCleanupPendingExitCode) resultCode = 0;
                                else if (childExitObserved && childExitCode == 0)
                                {
                                    Console.Error.WriteLine("restricted_e2e_pending_exit_required:mode=" + mode);
                                    resultCode = 125;
                                }
                            }
                            else
                            {
                                WriteOwnedJobProcessDiagnostics(job, childExitObserved ? child.ProcessId : 0);
                                TerminateAndConfirmJob(job);
                                Console.WriteLine("{\"ownedJobEmpty\":true,\"ownedJobCleanup\":\"forced\",\"accepted\":false}");
                                if (resultCode == 0 || resultCode == unchecked((int)OwnedJobCleanupPendingExitCode)) resultCode = 125;
                            }
                        }
                    }
                    else if (Valid(job))
                    {
                        if (mode == "probe-descendant") WriteOwnedJobProcessDiagnostics(job, childExitObserved ? child.ProcessId : 0);
                        TerminateAndConfirmJob(job);
                    }
                    Require(WaitForSingleObject(child.Process, 10000) == 0, "Confirm E2E child exit");
                    if (assigned && !OwnedJobGateMode(mode)) Console.WriteLine("{\"ownedJobEmpty\":true}");
                }
            }
            finally
            {
                stage = "child_cleanup";
                if (Valid(child.Thread)) CloseHandle(child.Thread);
                if (Valid(child.Process)) CloseHandle(child.Process);
                if (Valid(job)) CloseHandle(job);
                if (!CloseOwnedWindowObjects(desktop, windowStation)) resultCode = 125;
                if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
                if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
                if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
                foreach (IntPtr handle in new[] { input, output, error, restricted, token }) if (Valid(handle)) CloseHandle(handle);
                if (admin != IntPtr.Zero) LocalFree(admin);
                if (power != IntPtr.Zero) LocalFree(power);
            }
        }
        return resultCode;
    }
    public static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            if (args.Length == 1 && args[0] == "--read-installer-registry")
            {
                stage = "installer_registry_query";
                Console.WriteLine(InstallerRegistryReader.ReadJson());
                return 0;
            }
            if (args.Length == 1 && args[0] == "--probe-leaf")
            { CheckPrivileges(); System.Threading.Thread.Sleep(60000); return 1; }
            if (args.Length == 4 && args[0] == "--child" && Mode(args[1])) return Child(args[1], args[2], args[3]);
            if (args.Length != 3 || !Mode(args[0]) || !Path.IsPathRooted(args[1])
                || !File.Exists(args[1]) || !Path.IsPathRooted(args[2]) || !Directory.Exists(args[2]))
            {
                Console.Error.WriteLine("restricted_e2e_arguments:count=" + args.Length
                    + ",node=" + (args.Length > 1 && File.Exists(args[1]))
                    + ",directory=" + (args.Length > 2 && Directory.Exists(args[2])));
                throw new ArgumentException("Invalid fixed E2E launch mode");
            }
            return Launch(args[0], args[1], args[2]);
        }
        catch (Win32Exception exception) { Console.Error.WriteLine("restricted_e2e_native_error:phase=" + stage + ",code=" + exception.NativeErrorCode + ",hex=0x" + unchecked((uint)exception.NativeErrorCode).ToString("X8")); return 125; }
        catch (Exception exception) { Console.Error.WriteLine("restricted_e2e_invalid_context:phase=" + stage + ",type=" + exception.GetType().Name); return 125; }
    }
}
