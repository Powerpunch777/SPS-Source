// Development-only AppContainer Node + SPS Plugin SDK stdio canary.
// Uses only an ID-derived temp fixture; never accepts product paths or Vault credentials.
using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32.SafeHandles;
using System.Web.Script.Serialization;

internal static class AppContainerNodeWorkerCanary
{
    private static bool fixtureMutationUnconfirmed;
    private const uint CreateSuspended = 0x00000004;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint ExtendedStartupInfoPresent = 0x00080000;
    private const uint CreateNoWindow = 0x08000000;
    private const uint StartfUseStdHandles = 0x00000100;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint WaitObject0 = 0;
    private const uint WaitTimeout = 258;
    private const uint StillActive = 259;
    private const int ProcThreadAttributeHandleList = 0x00020002;
    private const int ProcThreadAttributeSecurityCapabilities = 0x00020009;
    private const int TokenIsAppContainer = 29;
    private const int TokenAppContainerSid = 31;
    private const int JobObjectBasicAccountingInformation = 1;
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint OpenExisting = 3;
    private const uint HandleFlagInherit = 1;
    private const uint ErrorAlreadyExists = 183;
    private const int HResultFileNotFound = unchecked((int)0x80070002);
    private const int HResultNotFound = unchecked((int)0x80070490);
    private const int MaxFrameBytes = 65536;
    private const int MaxRequestBytes = 4096;
    private const int OverallRpcTimeoutMs = 15000;
    private const int MaxStderrCaptureBytes = 16384;
    private const int ChildTimeoutMs = 30000;
    private const string HostStateMarker = "SPS_APP_CONTAINER_HOST_STATE_MARKER";

    [StructLayout(LayoutKind.Sequential)] private struct Capabilities
    {
        public IntPtr AppContainerSid;
        public IntPtr CapabilitiesSidAndAttributes;
        public uint CapabilityCount;
        public uint Reserved;
    }
    [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes
    {
        public int Length;
        public IntPtr Descriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool InheritHandle;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct StartupInfo
    {
        public int Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
        public short ShowWindow, ReservedSize;
        public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] private struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
    {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] private struct JobAccounting
    {
        public long TotalUserTime, TotalKernelTime, ThisPeriodUserTime, ThisPeriodKernelTime;
        public uint TotalPageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] private static extern int CreateAppContainerProfile(
        string name, string display, string description, IntPtr capabilities, uint capabilityCount, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] private static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll")] private static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint rights, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr value, int size, out int returned);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool EqualSid(IntPtr left, IntPtr right);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SecurityAttributes attributes, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool PeekNamedPipe(IntPtr pipe, IntPtr buffer, uint bufferSize,
        out uint bytesRead, out uint totalBytesAvailable, out uint bytesLeftThisMessage);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr bytes);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr bytes, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateProcessW")]
    private static extern bool CreateProcess(string executable, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
        bool inheritHandles, uint flags, IntPtr environment, string cwd, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits value, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool QueryInformationJobObject(IntPtr job, int kind, out JobAccounting value, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    private static void Require(bool ok, string stage)
    {
        if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), stage);
    }

    private static string FailureCategory(Exception error)
    {
        if (error is TimeoutException) return "timeout";
        if (error is EndOfStreamException) return "rpc-eof";
        if (error is Win32Exception) return "win32";
        if (error is UnauthorizedAccessException) return "access-denied";
        InvalidDataException invalid = error as InvalidDataException;
        if (invalid != null)
        {
            string[] known = { "rpc-frame-limit", "rpc-request-limit", "rpc-response", "rpc-result",
                "sdk-initialize-result", "sdk-initialize-methods", "sdk-filesystem-result", "descendant-filesystem-result",
                "node-exit-code", "fixture-after-state" };
            foreach (string category in known) if (String.Equals(invalid.Message, category, StringComparison.Ordinal)) return category;
            foreach (string phase in CanaryFailurePhases)
                if (String.Equals(invalid.Message, "canary-" + phase, StringComparison.Ordinal)) return invalid.Message;
            return "invalid-data";
        }
        if (error is IOException) return "io";
        return "other";
    }

    private static string FailureReport(string modulePathMode, string stage, string category, object childExitCode, object win32ErrorCode, string stderrCategory,
        bool appContainerVerified, bool childConfirmed, bool jobEmpty, bool profileRemoved, bool retainFixture)
    {
        return new JavaScriptSerializer().Serialize(new Dictionary<string, object> {
            { "schemaVersion", 1 }, { "scope", "development-canary-only" }, { "productIsolationImplemented", false },
            { "modulePathMode", modulePathMode }, { "stage", stage }, { "failureCategory", category }, { "childExitCode", childExitCode },
            { "win32ErrorCode", win32ErrorCode }, { "stderrCategory", stderrCategory },
            { "appContainerIdentityVerified", appContainerVerified }, { "childTerminationConfirmed", childConfirmed },
            { "jobEmpty", jobEmpty }, { "profileCleanupSucceeded", profileRemoved },
            { "fixtureMustBeRetained", retainFixture }, { "passed", false }
        });
    }

    private static string SuccessReport(string modulePathMode)
    {
        return new JavaScriptSerializer().Serialize(new Dictionary<string, object> {
            { "schemaVersion", 1 }, { "scope", "development-canary-only" }, { "productIsolationImplemented", false },
            { "modulePathMode", modulePathMode }, { "appContainerIdentityVerified", true },
            { "sdkInitialize", true }, { "sdkGetData", true }, { "sdkHostRoundTrip", true }, { "packageReadAllowed", true },
            { "workspaceWriteAllowed", true }, { "fakeVaultReadDenied", true }, { "fakeVaultWriteDenied", true },
            { "descendantDenied", true }, { "descendantWorkspaceWriteAllowed", true }, { "childTerminationConfirmed", true },
            { "jobEmpty", true }, { "childExitCode", 0 }, { "profileCleanupSucceeded", true },
            { "fixtureMustBeRetained", false }, { "passed", true }
        });
    }

    private sealed class BoundedStderrCapture
    {
        private readonly object gate = new object();
        private readonly byte[] buffer = new byte[MaxStderrCaptureBytes];
        private int length;

        public void Append(byte[] source, int count)
        {
            lock (gate)
            {
                int copy = Math.Min(count, buffer.Length - length);
                if (copy > 0)
                {
                    Buffer.BlockCopy(source, 0, buffer, length, copy);
                    length += copy;
                }
            }
        }

        public string Category()
        {
            lock (gate)
            {
                if (length == 0) return "none";
                string text = Encoding.ASCII.GetString(buffer, 0, length);
                bool denied = text.IndexOf("EACCES", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("EPERM", StringComparison.OrdinalIgnoreCase) >= 0;
                if (denied)
                {
                    if (text.IndexOf("lstat", StringComparison.OrdinalIgnoreCase) >= 0) return "fs-lstat-denied";
                    if (text.IndexOf("realpath", StringComparison.OrdinalIgnoreCase) >= 0) return "fs-realpath-denied";
                    if (text.IndexOf("stat", StringComparison.OrdinalIgnoreCase) >= 0
                        || text.IndexOf("open", StringComparison.OrdinalIgnoreCase) >= 0
                        || text.IndexOf("access", StringComparison.OrdinalIgnoreCase) >= 0) return "fs-path-denied";
                    return "generic-access-denied";
                }
                if (text.IndexOf("ERR_MODULE_NOT_FOUND", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("MODULE_NOT_FOUND", StringComparison.OrdinalIgnoreCase) >= 0) return "module-not-found";
                if (text.IndexOf("ERR_INVALID_PACKAGE_CONFIG", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("ERR_PACKAGE_PATH_NOT_EXPORTED", StringComparison.OrdinalIgnoreCase) >= 0) return "package-config";
                if (text.IndexOf("SyntaxError", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("ERR_INVALID_MODULE_SPECIFIER", StringComparison.OrdinalIgnoreCase) >= 0) return "syntax";
                if (text.IndexOf("Assertion failed", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("node::Assert", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("FATAL ERROR: v8::", StringComparison.OrdinalIgnoreCase) >= 0) return "native-assertion";
                if (text.IndexOf("CSPRNG", StringComparison.OrdinalIgnoreCase) >= 0
                    || text.IndexOf("random number generator", StringComparison.OrdinalIgnoreCase) >= 0) return "crypto-rng";
                return "unknown";
            }
        }
    }

    private static string FixtureRoot(string id)
    {
        string root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "sps-appcontainer-node-poc-" + id));
        if (!String.Equals(Path.GetDirectoryName(root), Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase)
            || Path.GetFileName(root) != "sps-appcontainer-node-poc-" + id) throw new InvalidOperationException("fixture-path");
        return root;
    }

    private static void AssertPlainTree(string directory)
    {
        FileAttributes attributes = File.GetAttributes(directory);
        if ((attributes & FileAttributes.Directory) == 0 || (attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("fixture-entry");
        foreach (string item in Directory.GetFileSystemEntries(directory))
        {
            attributes = File.GetAttributes(item);
            if ((attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("fixture-entry");
            if ((attributes & FileAttributes.Directory) != 0) AssertPlainTree(item);
        }
    }

    private static void AddAppContainerRule(string directory, SecurityIdentifier identity, FileSystemRights rights, InheritanceFlags inheritance)
    {
        DirectoryInfo info = new DirectoryInfo(directory);
        DirectorySecurity security = info.GetAccessControl(AccessControlSections.Access);
        security.AddAccessRule(new FileSystemAccessRule(identity, rights, inheritance, PropagationFlags.None, AccessControlType.Allow));
        info.SetAccessControl(security);
    }

    private static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') { result.Append('\\', slashes * 2 + 1).Append('"'); slashes = 0; continue; }
            result.Append('\\', slashes).Append(character); slashes = 0;
        }
        result.Append('\\', slashes * 2).Append('"');
        return result.ToString();
    }

    private static void SetLowIntegrity(string directory)
    {
        string icacls = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "icacls.exe");
        ProcessStartInfo start = new ProcessStartInfo(icacls, Quote(directory) + " /setintegritylevel \"(OI)(CI)L\"");
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        using (Process process = Process.Start(start))
        {
            process.OutputDataReceived += delegate { };
            process.ErrorDataReceived += delegate { };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            if (!process.WaitForExit(10000))
            {
                try { process.Kill(); } catch { }
                if (!process.WaitForExit(5000))
                {
                    fixtureMutationUnconfirmed = true;
                    throw new TimeoutException("fixture-integrity-exit-unconfirmed");
                }
                throw new TimeoutException("fixture-integrity-timeout");
            }
            process.WaitForExit();
            if (process.ExitCode != 0) throw new InvalidOperationException("fixture-integrity");
        }
    }

    private static void CreatePipePair(out IntPtr childRead, out IntPtr parentWrite, out IntPtr childWrite, out IntPtr parentRead)
    {
        SecurityAttributes security = new SecurityAttributes();
        security.Length = Marshal.SizeOf(typeof(SecurityAttributes));
        security.InheritHandle = true;
        Require(CreatePipe(out childRead, out parentWrite, ref security, 65536), "create-stdin-pipe");
        Require(SetHandleInformation(parentWrite, HandleFlagInherit, 0), "mark-parent-stdin");
        Require(CreatePipe(out parentRead, out childWrite, ref security, 65536), "create-stdout-pipe");
        Require(SetHandleInformation(parentRead, HandleFlagInherit, 0), "mark-parent-stdout");
    }

    private static void CreateStderrPipe(out IntPtr childWrite, out IntPtr parentRead)
    {
        SecurityAttributes security = new SecurityAttributes();
        security.Length = Marshal.SizeOf(typeof(SecurityAttributes));
        security.InheritHandle = true;
        Require(CreatePipe(out parentRead, out childWrite, ref security, 4096), "create-stderr-pipe");
        Require(SetHandleInformation(parentRead, HandleFlagInherit, 0), "mark-parent-stderr");
    }

    private static IntPtr InitializeAttributes(IntPtr sid, IntPtr stdin, IntPtr stdout, IntPtr stderr,
        out IntPtr attributeList, out IntPtr capabilityValue, out IntPtr handleList)
    {
        IntPtr size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
        if (size == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "attribute-size");
        attributeList = Marshal.AllocHGlobal(size);
        capabilityValue = IntPtr.Zero;
        handleList = IntPtr.Zero;
        Require(InitializeProcThreadAttributeList(attributeList, 2, 0, ref size), "attribute-list");
        Capabilities capabilities = new Capabilities();
        capabilities.AppContainerSid = sid;
        capabilityValue = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Capabilities)));
        Marshal.StructureToPtr(capabilities, capabilityValue, false);
        Require(UpdateProcThreadAttribute(attributeList, 0, new IntPtr(ProcThreadAttributeSecurityCapabilities), capabilityValue,
            new IntPtr(Marshal.SizeOf(typeof(Capabilities))), IntPtr.Zero, IntPtr.Zero), "security-capabilities");
        handleList = Marshal.AllocHGlobal(IntPtr.Size * 3);
        Marshal.WriteIntPtr(handleList, 0, stdin);
        Marshal.WriteIntPtr(handleList, IntPtr.Size, stdout);
        Marshal.WriteIntPtr(handleList, IntPtr.Size * 2, stderr);
        Require(UpdateProcThreadAttribute(attributeList, 0, new IntPtr(ProcThreadAttributeHandleList), handleList,
            new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero), "inherited-handle-list");
        return size;
    }

    private static IntPtr BuildEnvironment(string systemRoot, string localAppData, string packageRoot, string workspace, string id,
        string packageMarker, string workspaceMarker, string vaultMarker, string descendantMarker)
    {
        SortedDictionary<string, string> values = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        values["NODE_ENV"] = "production";
        values["PATH"] = Path.Combine(systemRoot, "System32");
        values["LOCALAPPDATA"] = localAppData;
        values["SPS_APP_CONTAINER_CANARY_DESCENDANT_MARKER"] = descendantMarker;
        values["SPS_APP_CONTAINER_CANARY_FIXTURE_ID"] = id;
        values["SPS_APP_CONTAINER_CANARY_PACKAGE_MARKER"] = packageMarker;
        values["SPS_APP_CONTAINER_CANARY_VAULT_MARKER"] = vaultMarker;
        values["SPS_APP_CONTAINER_CANARY_WORKSPACE_MARKER"] = workspaceMarker;
        values["SYSTEMROOT"] = systemRoot;
        values["TEMP"] = workspace;
        values["TMP"] = workspace;
        values["WINDIR"] = systemRoot;
        StringBuilder block = new StringBuilder();
        foreach (KeyValuePair<string, string> entry in values)
        {
            if (entry.Key.IndexOfAny(new[] { '=', '\0' }) >= 0 || entry.Value.IndexOf('\0') >= 0) throw new InvalidOperationException("environment");
            block.Append(entry.Key).Append('=').Append(entry.Value).Append('\0');
        }
        block.Append('\0');
        return Marshal.StringToHGlobalUni(block.ToString());
    }

    private static SafeFileHandle StreamHandle(IntPtr handle) { return new SafeFileHandle(handle, true); }

    private sealed class RpcReader
    {
        private readonly Stream stream;
        private readonly IntPtr pipe;
        private readonly List<byte> pending = new List<byte>();
        public RpcReader(Stream input, IntPtr handle) { stream = input; pipe = handle; }
        public string ReadLine(int timeoutMs)
        {
            Stopwatch deadline = Stopwatch.StartNew();
            for (;;)
            {
                int newline = pending.IndexOf(10);
                if (newline >= 0)
                {
                    if (newline > MaxFrameBytes) throw new InvalidDataException("rpc-frame-limit");
                    byte[] line = pending.GetRange(0, newline).ToArray();
                    pending.RemoveRange(0, newline + 1);
                    if (line.Length > 0 && line[line.Length - 1] == 13) Array.Resize(ref line, line.Length - 1);
                    return new UTF8Encoding(false, true).GetString(line);
                }
                if (pending.Count > MaxFrameBytes) throw new InvalidDataException("rpc-frame-limit");
                if (deadline.ElapsedMilliseconds >= timeoutMs) throw new TimeoutException("rpc-response-timeout");
                uint read, available, remaining;
                if (!PeekNamedPipe(pipe, IntPtr.Zero, 0, out read, out available, out remaining))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "rpc-pipe-peek");
                if (available == 0) { System.Threading.Thread.Sleep(10); continue; }
                byte[] buffer = new byte[(int)Math.Min(available, 4096u)];
                int count = stream.Read(buffer, 0, buffer.Length);
                if (count <= 0) throw new EndOfStreamException("rpc-eof");
                for (int index = 0; index < count; index++) pending.Add(buffer[index]);
            }
        }
    }

    private static bool HasExactKeys(Dictionary<string, object> value, params string[] keys)
    {
        if (value == null || value.Count != keys.Length) return false;
        foreach (string key in keys) if (!value.ContainsKey(key)) return false;
        return true;
    }

    private static void WriteHostResponse(Stream input, string id, JavaScriptSerializer serializer)
    {
        Dictionary<string, object> response = new Dictionary<string, object> {
            { "jsonrpc", "2.0" }, { "id", id }, { "result", HostStateMarker }
        };
        byte[] bytes = new UTF8Encoding(false, true).GetBytes(serializer.Serialize(response) + "\n");
        if (bytes.Length > MaxRequestBytes) throw new InvalidDataException("rpc-request-limit");
        input.Write(bytes, 0, bytes.Length);
        input.Flush();
    }

    private static void HandleStateGetRequest(Stream input, string line, string fixtureId, JavaScriptSerializer serializer)
    {
        if (Encoding.UTF8.GetByteCount(line) > MaxRequestBytes) throw new InvalidDataException("rpc-request-limit");
        Dictionary<string, object> request = serializer.Deserialize<Dictionary<string, object>>(line);
        object version, requestId, method, parametersValue;
        if (!HasExactKeys(request, "jsonrpc", "id", "method", "params")
            || !request.TryGetValue("jsonrpc", out version) || !Object.Equals(version, "2.0")
            || !request.TryGetValue("id", out requestId) || !Object.Equals(requestId, "sps-1")
            || !request.TryGetValue("method", out method) || !Object.Equals(method, "state.get")
            || !request.TryGetValue("params", out parametersValue)) throw new InvalidDataException("rpc-response");

        Dictionary<string, object> parameters = parametersValue as Dictionary<string, object>;
        object scopeKind, scopeId, nameSpace, stateKey;
        if (!HasExactKeys(parameters, "scopeKind", "scopeId", "namespace", "stateKey")
            || !parameters.TryGetValue("scopeKind", out scopeKind) || !Object.Equals(scopeKind, "workspace")
            || !parameters.TryGetValue("scopeId", out scopeId) || !Object.Equals(scopeId, fixtureId)
            || !parameters.TryGetValue("namespace", out nameSpace) || !Object.Equals(nameSpace, "appcontainer.canary")
            || !parameters.TryGetValue("stateKey", out stateKey) || !Object.Equals(stateKey, "marker")) {
            throw new InvalidDataException("rpc-response");
        }
        WriteHostResponse(input, (string)requestId, serializer);
    }

    private static Dictionary<string, object> ReadResponse(Stream input, RpcReader reader, string id, JavaScriptSerializer serializer,
        Stopwatch deadline, bool allowStateGet, string fixtureId, out bool hostRequestObserved)
    {
        hostRequestObserved = false;
        for (;;)
        {
            int remaining = OverallRpcTimeoutMs - (int)Math.Min(OverallRpcTimeoutMs, deadline.ElapsedMilliseconds);
            if (remaining <= 0) throw new TimeoutException("rpc-response-timeout");
            string line = reader.ReadLine(remaining);
            Dictionary<string, object> response = serializer.Deserialize<Dictionary<string, object>>(line);
            object responseId;
            if (response != null && response.TryGetValue("id", out responseId) && Object.Equals(responseId, id))
            {
                object version;
                if (!response.TryGetValue("jsonrpc", out version) || !Object.Equals(version, "2.0"))
                    throw new InvalidDataException("rpc-response");
                object errorValue;
                if (response.TryGetValue("error", out errorValue))
                {
                    if (!HasExactKeys(response, "jsonrpc", "id", "error")) throw new InvalidDataException("rpc-response");
                    Dictionary<string, object> rpcError = errorValue as Dictionary<string, object>;
                    object dataValue;
                    if (rpcError != null && rpcError.TryGetValue("data", out dataValue))
                    {
                        Dictionary<string, object> diagnostic = dataValue as Dictionary<string, object>;
                        object phase;
                        if (diagnostic != null && diagnostic.Count == 1 && diagnostic.TryGetValue("canaryFailure", out phase))
                            foreach (string known in CanaryFailurePhases)
                                if (Object.Equals(phase, known)) throw new InvalidDataException("canary-" + known);
                    }
                    throw new InvalidDataException("rpc-response");
                }
                if (!HasExactKeys(response, "jsonrpc", "id", "result")) throw new InvalidDataException("rpc-response");
                return response;
            }
            if (!allowStateGet || hostRequestObserved) throw new InvalidDataException("rpc-response");
            HandleStateGetRequest(input, line, fixtureId, serializer);
            hostRequestObserved = true;
        }
    }

    private static readonly string[] CanaryFailurePhases = {
        "fixture-paths", "package-read", "workspace-write", "workspace-read", "descendant-spawn-denied",
        "descendant-start", "descendant-result", "initialize-params", "host-state-result"
    };

    private static Dictionary<string, object> Rpc(Stream input, RpcReader output, string id, string method, object parameters, JavaScriptSerializer serializer)
    {
        bool ignored;
        return Rpc(input, output, id, method, parameters, serializer, false, String.Empty, out ignored);
    }

    private static Dictionary<string, object> Rpc(Stream input, RpcReader output, string id, string method, object parameters,
        JavaScriptSerializer serializer, bool allowStateGet, string fixtureId, out bool hostRequestObserved)
    {
        Stopwatch deadline = Stopwatch.StartNew();
        Dictionary<string, object> request = new Dictionary<string, object> {
            { "jsonrpc", "2.0" }, { "id", id }, { "method", method }, { "params", parameters }
        };
        byte[] bytes = new UTF8Encoding(false, true).GetBytes(serializer.Serialize(request) + "\n");
        if (bytes.Length > MaxRequestBytes) throw new InvalidDataException("rpc-request-limit");
        input.Write(bytes, 0, bytes.Length);
        input.Flush();
        return ReadResponse(input, output, id, serializer, deadline, allowStateGet, fixtureId, out hostRequestObserved);
    }

    private static object Field(Dictionary<string, object> value, string key)
    {
        object result;
        if (value == null || !value.TryGetValue(key, out result)) throw new InvalidDataException("rpc-result");
        return result;
    }

    private static string ReadText(string file)
    {
        using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false, true), false)) return reader.ReadToEnd();
    }

    private static bool DeleteProfile(string name)
    {
        int result = DeleteAppContainerProfile(name);
        return result == 0 || result == HResultFileNotFound || result == HResultNotFound;
    }

    private static bool WaitForJobEmpty(IntPtr job, int timeoutMs)
    {
        Stopwatch timer = Stopwatch.StartNew();
        while (timer.ElapsedMilliseconds < timeoutMs)
        {
            JobAccounting accounting;
            if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, out accounting,
                (uint)Marshal.SizeOf(typeof(JobAccounting)), IntPtr.Zero)) return false;
            if (accounting.ActiveProcesses == 0) return true;
            System.Threading.Thread.Sleep(50);
        }
        return false;
    }

    private static bool VerifyAppContainer(IntPtr process, IntPtr expectedSid)
    {
        IntPtr token = IntPtr.Zero, value = IntPtr.Zero;
        try
        {
            Require(OpenProcessToken(process, 0x0008, out token), "open-child-token");
            int returned;
            value = Marshal.AllocHGlobal(4);
            Require(GetTokenInformation(token, TokenIsAppContainer, value, 4, out returned), "read-appcontainer-token");
            if (Marshal.ReadInt32(value) != 1) return false;
            Marshal.FreeHGlobal(value);
            value = IntPtr.Zero;
            int size = 0;
            GetTokenInformation(token, TokenAppContainerSid, IntPtr.Zero, 0, out size);
            if (size < IntPtr.Size || size > 4096) return false;
            value = Marshal.AllocHGlobal(size);
            Require(GetTokenInformation(token, TokenAppContainerSid, value, size, out returned), "read-appcontainer-sid");
            IntPtr actualSid = Marshal.ReadIntPtr(value);
            return actualSid != IntPtr.Zero && EqualSid(actualSid, expectedSid);
        }
        finally
        {
            if (value != IntPtr.Zero) Marshal.FreeHGlobal(value);
            if (token != IntPtr.Zero) CloseHandle(token);
        }
    }

    private static void Close(ref IntPtr value)
    {
        if (value != IntPtr.Zero) { CloseHandle(value); value = IntPtr.Zero; }
    }

    private static int Run(string id, bool preserveModulePaths)
    {
        string modulePathMode = preserveModulePaths ? "preserve-module-paths" : "baseline";
        string profileName = "SPS.AppContainer.NodeCanary." + id;
        string root = FixtureRoot(id);
        string packageRoot = Path.Combine(root, "package");
        string workspace = Path.Combine(root, "workspace");
        string vault = Path.Combine(root, "fake-vault");
        string node = Path.Combine(packageRoot, "node.exe");
        string worker = Path.Combine(packageRoot, "worker.mjs");
        string packageMarker = Path.Combine(packageRoot, "package-marker.txt");
        string workspaceMarker = Path.Combine(workspace, "worker-write.txt");
        string descendantMarker = Path.Combine(workspace, "descendant-write.txt");
        string vaultMarker = Path.Combine(vault, "fake-secret.txt");
        IntPtr sid = IntPtr.Zero, job = IntPtr.Zero, process = IntPtr.Zero, thread = IntPtr.Zero;
        IntPtr childInputRead = IntPtr.Zero, parentInputWrite = IntPtr.Zero, parentOutputRead = IntPtr.Zero, childOutputWrite = IntPtr.Zero;
        IntPtr parentErrorRead = IntPtr.Zero, childErrorWrite = IntPtr.Zero;
        IntPtr attributeList = IntPtr.Zero, capabilityValue = IntPtr.Zero, handleList = IntPtr.Zero, environment = IntPtr.Zero;
        bool profileCreated = false, childCreated = false, childAssigned = false, childConfirmed = false;
        bool appContainerVerified = false, jobEmpty = false, profileRemoved = false;
        BoundedStderrCapture stderrCapture = new BoundedStderrCapture();
        System.Threading.Thread stderrDrain = null;
        string stage = "fixture";
        uint exitCode = 0;
        try
        {
            AssertPlainTree(root);
            if (!File.Exists(node) || !File.Exists(worker) || !File.Exists(packageMarker)
                || !Directory.Exists(workspace) || !Directory.Exists(vault) || !File.Exists(vaultMarker)) throw new InvalidDataException("fixture-layout");
            if (!String.Equals(ReadText(packageMarker), "SPS_APP_CONTAINER_PACKAGE_READ_OK", StringComparison.Ordinal)
                || !String.Equals(ReadText(vaultMarker), "SPS_APP_CONTAINER_FAKE_SECRET_" + id, StringComparison.Ordinal)) throw new InvalidDataException("fixture-baseline");

            stage = "profile";
            int profileResult = CreateAppContainerProfile(profileName, "SPS Node Worker Canary", "Temporary development-only canary", IntPtr.Zero, 0, out sid);
            if (profileResult != 0) Marshal.ThrowExceptionForHR(profileResult);
            profileCreated = true;
            SecurityIdentifier appIdentity = new SecurityIdentifier(sid);

            stage = "fixture-acl";
            AddAppContainerRule(root, appIdentity, FileSystemRights.Traverse, InheritanceFlags.None);
            AddAppContainerRule(packageRoot, appIdentity, FileSystemRights.ReadAndExecute, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit);
            AddAppContainerRule(workspace, appIdentity, FileSystemRights.Modify, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit);
            SetLowIntegrity(packageRoot);
            SetLowIntegrity(workspace);

            stage = "pipes";
            CreatePipePair(out childInputRead, out parentInputWrite, out childOutputWrite, out parentOutputRead);
            CreateStderrPipe(out childErrorWrite, out parentErrorRead);
            IntPtr attributeBytes = InitializeAttributes(sid, childInputRead, childOutputWrite, childErrorWrite,
                out attributeList, out capabilityValue, out handleList);
            string systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            environment = BuildEnvironment(systemRoot, localAppData, packageRoot, workspace, id, packageMarker, workspaceMarker, vaultMarker, descendantMarker);
            StartupInfoEx startup = new StartupInfoEx();
            startup.Startup.Size = Marshal.SizeOf(typeof(StartupInfoEx));
            startup.Startup.Flags = StartfUseStdHandles;
            startup.Startup.Input = childInputRead;
            startup.Startup.Output = childOutputWrite;
            startup.Startup.Error = childErrorWrite;
            startup.Attributes = attributeList;

            stage = "job";
            job = CreateJobObject(IntPtr.Zero, null);
            Require(job != IntPtr.Zero, "create-job");
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = JobObjectLimitKillOnJobClose;
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))), "configure-job");

            stage = "create-node";
            string moduleFlags = preserveModulePaths ? " --preserve-symlinks --preserve-symlinks-main" : String.Empty;
            StringBuilder command = new StringBuilder(Quote(node) + moduleFlags + " " + Quote(worker));
            ProcessInfo created;
            Require(CreateProcess(node, command, IntPtr.Zero, IntPtr.Zero, true,
                CreateSuspended | CreateUnicodeEnvironment | ExtendedStartupInfoPresent | CreateNoWindow,
                environment, packageRoot, ref startup, out created), "create-appcontainer-node");
            process = created.Process;
            thread = created.Thread;
            childCreated = true;
            Close(ref childInputRead);
            Close(ref childOutputWrite);
            Close(ref childErrorWrite);

            stage = "assign-job";
            Require(AssignProcessToJobObject(job, process), "assign-node-job");
            childAssigned = true;
            if (!VerifyAppContainer(process, sid)) throw new InvalidDataException("appcontainer-identity");
            appContainerVerified = true;
            stage = "resume-node";
            Require(ResumeThread(thread) != UInt32.MaxValue, "resume-node");
            Close(ref thread);

            using (FileStream input = new FileStream(StreamHandle(parentInputWrite), FileAccess.Write, 4096, false))
            using (FileStream output = new FileStream(StreamHandle(parentOutputRead), FileAccess.Read, 4096, false))
            using (FileStream error = new FileStream(StreamHandle(parentErrorRead), FileAccess.Read, 4096, false))
            {
                parentInputWrite = IntPtr.Zero;
                parentOutputRead = IntPtr.Zero;
                parentErrorRead = IntPtr.Zero;
                stderrDrain = new System.Threading.Thread(delegate()
                {
                    try
                    {
                        byte[] buffer = new byte[1024];
                        int count;
                        while ((count = error.Read(buffer, 0, buffer.Length)) > 0) stderrCapture.Append(buffer, count);
                    }
                    catch { }
                });
                stderrDrain.IsBackground = true;
                stderrDrain.Start();
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                serializer.MaxJsonLength = MaxFrameBytes;
                serializer.RecursionLimit = 16;
                RpcReader rpcReader = new RpcReader(output, output.SafeFileHandle.DangerousGetHandle());
                stage = "sdk-initialize";
                Dictionary<string, object> initialize = Rpc(input, rpcReader, "init", "initialize",
                    new Dictionary<string, object> { { "fixtureId", id }, { "config", new Dictionary<string, object>() } }, serializer);
                Dictionary<string, object> initializeResult = Field(initialize, "result") as Dictionary<string, object>;
                if (!Object.Equals(Field(initializeResult, "ok"), true)) throw new InvalidDataException("sdk-initialize-result");
                object supportedRaw = Field(initializeResult, "supportedMethods");
                IList supported = supportedRaw as IList;
                bool supportsGetData = false;
                if (supported != null) foreach (object method in supported) if (Object.Equals(method, "getData")) supportsGetData = true;
                if (!supportsGetData) throw new InvalidDataException("sdk-initialize-methods");

                stage = "sdk-getdata";
                bool hostRequestObserved;
                Dictionary<string, object> data = Rpc(input, rpcReader, "data", "getData",
                    new Dictionary<string, object> { { "key", "appcontainer.canary" }, { "params", new Dictionary<string, object>() } },
                    serializer, true, id, out hostRequestObserved);
                Dictionary<string, object> result = Field(data, "result") as Dictionary<string, object>;
                if (!hostRequestObserved || !Object.Equals(Field(result, "hostCallObserved"), true)
                    || !Object.Equals(Field(result, "hostState"), HostStateMarker)
                    || !Object.Equals(Field(result, "packageRead"), "SPS_APP_CONTAINER_PACKAGE_READ_OK")
                    || !Object.Equals(Field(result, "workspaceWrite"), "SPS_APP_CONTAINER_WORKSPACE_WRITE_OK")
                    || !Object.Equals(Field(result, "vaultReadDenied"), true)
                    || !Object.Equals(Field(result, "vaultWriteDenied"), true)) throw new InvalidDataException("sdk-filesystem-result");
                Dictionary<string, object> descendant = Field(result, "descendant") as Dictionary<string, object>;
                if (!Object.Equals(Field(descendant, "readDenied"), true) || !Object.Equals(Field(descendant, "writeDenied"), true)) {
                    throw new InvalidDataException("descendant-filesystem-result");
                }

                stage = "sdk-shutdown";
                Rpc(input, rpcReader, "shutdown", "shutdown", new Dictionary<string, object>(), serializer);
                input.Dispose();

                stage = "node-exit";
                uint wait = WaitForSingleObject(process, ChildTimeoutMs);
                if (wait != WaitObject0) throw new TimeoutException("node-exit-timeout");
                childConfirmed = true;
                Require(GetExitCodeProcess(process, out exitCode), "read-node-exit");
                if (exitCode != 0) throw new InvalidDataException("node-exit-code");
                if (!stderrDrain.Join(5000)) throw new TimeoutException("stderr-drain-timeout");
            }

            stage = "job-empty";
            jobEmpty = WaitForJobEmpty(job, 10000);
            if (!jobEmpty) throw new TimeoutException("job-empty-timeout");
            if (!String.Equals(ReadText(workspaceMarker), "SPS_APP_CONTAINER_WORKSPACE_WRITE_OK", StringComparison.Ordinal)
                || !String.Equals(ReadText(descendantMarker), "SPS_APP_CONTAINER_DESCENDANT_WORKSPACE_WRITE_OK", StringComparison.Ordinal)
                || !String.Equals(ReadText(vaultMarker), "SPS_APP_CONTAINER_FAKE_SECRET_" + id, StringComparison.Ordinal)) {
                throw new InvalidDataException("fixture-after-state");
            }

            stage = "profile-cleanup";
            profileRemoved = DeleteProfile(profileName);
            if (!profileRemoved) throw new InvalidOperationException("profile-cleanup");
            Console.WriteLine(SuccessReport(modulePathMode));
            return 0;
        }
        catch (Exception error)
        {
            Win32Exception win32 = error as Win32Exception;
            object win32ErrorCode = win32 == null ? null : (object)win32.NativeErrorCode;
            bool childExitCodeAvailable = false;
            uint childExitCode = 0;
            if (childCreated && GetExitCodeProcess(process, out childExitCode) && childExitCode != StillActive)
                childExitCodeAvailable = true;
            if (childCreated && !childAssigned && !childConfirmed)
            {
                try { TerminateProcess(process, 125); } catch { }
                childConfirmed = WaitForSingleObject(process, 10000) == WaitObject0;
                jobEmpty = childConfirmed;
            }
            if (job != IntPtr.Zero && childCreated && childAssigned && !jobEmpty)
            {
                try { TerminateJobObject(job, 125); } catch { }
                childConfirmed = childConfirmed || WaitForSingleObject(process, 10000) == WaitObject0;
                jobEmpty = WaitForJobEmpty(job, 10000);
            }
            if (stderrDrain != null) stderrDrain.Join(1000);
            string stderrCategory = stderrCapture.Category();
            bool cleanupCanBeConfirmed = !fixtureMutationUnconfirmed && (!childCreated || (childConfirmed && jobEmpty));
            if (!profileCreated) profileRemoved = true;
            if (profileCreated && cleanupCanBeConfirmed) profileRemoved = DeleteProfile(profileName);
            Console.WriteLine(FailureReport(modulePathMode, stage, FailureCategory(error), childExitCodeAvailable ? (object)childExitCode : null,
                win32ErrorCode, stderrCategory,
                appContainerVerified, childConfirmed, jobEmpty, profileRemoved, !cleanupCanBeConfirmed || !profileRemoved));
            return 2;
        }
        finally
        {
            if (thread != IntPtr.Zero) Close(ref thread);
            if (process != IntPtr.Zero) Close(ref process);
            Close(ref childInputRead); Close(ref parentInputWrite); Close(ref parentOutputRead); Close(ref childOutputWrite);
            Close(ref parentErrorRead); Close(ref childErrorWrite);
            if (job != IntPtr.Zero) Close(ref job);
            if (attributeList != IntPtr.Zero) { DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); }
            if (capabilityValue != IntPtr.Zero) Marshal.FreeHGlobal(capabilityValue);
            if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            if (sid != IntPtr.Zero) FreeSid(sid);
        }
    }

    private static bool TryId(string value)
    {
        Guid id;
        return Guid.TryParseExact(value, "N", out id) && id.ToString("N") == value;
    }

    public static int Main(string[] args)
    {
        // Exercises the actual failure serializer without creating a profile, child, or fixture.
        if (args.Length == 1 && args[0] == "--check-report")
        {
            Console.WriteLine(FailureReport("baseline", "sdk-initialize", "rpc-eof", null, null, "none", true, true, true, true, false));
            BoundedStderrCapture probe = new BoundedStderrCapture();
            byte[] boundedProbe = Encoding.ASCII.GetBytes("EACCES: permission denied, lstat <canary>");
            probe.Append(boundedProbe, boundedProbe.Length);
            Console.WriteLine(FailureReport("preserve-module-paths", "sdk-initialize", "node-exit-code", (uint)0xffffffff, 5, probe.Category(), true, true, true, true, false));
            return 0;
        }
        if (args.Length != 2 || (args[0] != "--run" && args[0] != "--run-preserve-module-paths") || !TryId(args[1]))
        {
            Console.WriteLine("{\"schemaVersion\":1,\"scope\":\"development-canary-only\",\"passed\":false,\"stage\":\"arguments\"}");
            return 2;
        }
        return Run(args[1], args[0] == "--run-preserve-module-paths");
    }
}
