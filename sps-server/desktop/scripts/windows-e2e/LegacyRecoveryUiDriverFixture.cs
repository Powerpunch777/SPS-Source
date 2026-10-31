using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Sps.LegacyRecovery;

internal static class LegacyRecoveryUiDriverFixture
{
    const string ChildMode = "--show-form";
    static readonly string[] DriverPhases = { "initial-window", "initial-target", "initial-controls", "initial-backup",
        "initial-inside", "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit" };

    static void Require(bool condition, string code)
    {
        if (!condition) throw new InvalidOperationException(code);
    }

    [STAThread]
    public static int Main(string[] args)
    {
        if (args != null && args.Length == 1 && args[0] == "--probe-check-observation")
            return ExerciseCheckObservation();
        if (args != null && args.Length == 3 && args[0] == ChildMode)
            return ShowForm(args[1], args[2]);
        return ExerciseDriver(args);
    }

    static int ExerciseCheckObservation()
    {
        try
        {
            var watch = Stopwatch.StartNew();
            var flags = BindingFlags.Static | BindingFlags.NonPublic;
            FieldInfo clock = typeof(LegacyRecoveryUiDriver).GetField("clock", flags);
            MethodInfo observe = typeof(LegacyRecoveryUiDriver).GetMethod("ObserveCheck", flags);
            MethodInfo budget = typeof(LegacyRecoveryUiDriver).GetMethod("UiWaitBudget", flags);
            Require(clock != null && observe != null && budget != null, "observer_entry");
            clock.SetValue(null, watch);
            Require((int)budget.Invoke(null, null) == 15000, "original_ui_budget");

            int queries = 0;
            Task<bool> delayed = Task.Run(delegate
            {
                Interlocked.Increment(ref queries);
                Thread.Sleep(1500);
                return true;
            });
            Require((bool)observe.Invoke(null, new object[] { delayed, watch.ElapsedMilliseconds + 15000 }), "delayed_value");
            Require(queries == 1, "single_query");
            Require(!(bool)observe.Invoke(null, new object[] { Task.FromResult(false), watch.ElapsedMilliseconds + 15000 }), "false_value");

            bool unfinishedRejected = false;
            var unfinished = new TaskCompletionSource<bool>();
            long shortDeadline = watch.ElapsedMilliseconds + 300;
            try { observe.Invoke(null, new object[] { unfinished.Task, shortDeadline }); }
            catch (TargetInvocationException error) { unfinishedRejected = error.InnerException.GetType().Name == "CheckObservationDeadlineFailure"; }
            Require(unfinishedRejected && watch.ElapsedMilliseconds < shortDeadline + 3000, "unfinished_bound");

            bool expiredRejected = false;
            try { observe.Invoke(null, new object[] { Task.FromResult(true), watch.ElapsedMilliseconds - 1 }); }
            catch (TargetInvocationException error) { expiredRejected = error.InnerException.GetType().Name == "CheckObservationDeadlineFailure"; }
            Require(expiredRejected, "expired_deadline");

            var faulted = new TaskCompletionSource<bool>();
            faulted.SetException(new InvalidOperationException("fixture"));
            bool faultRejected = false;
            try { observe.Invoke(null, new object[] { faulted.Task, watch.ElapsedMilliseconds + 15000 }); }
            catch (TargetInvocationException error) { faultRejected = error.InnerException is InvalidOperationException; }
            Require(faultRejected, "query_fault");
            Console.WriteLine("{\"ok\":true,\"oneQuery\":true,\"delayedValue\":true,\"falseValueRetained\":true,\"unfinishedRejected\":true,\"expiredRejected\":true,\"faultRejected\":true,\"uiBudgetMs\":15000}");
            return 0;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"phase\":\"check-observation\"}");
            return 1;
        }
    }

    static int ExerciseDriver(string[] args)
    {
        Process child = null;
        string phase = "arguments";
        StringWriter driverTrace = null;
        TextWriter originalError = null;
        try
        {
            Require(args != null && args.Length == 2, "arguments");
            string root = Path.GetFullPath(args[0]);
            string sentinel = Path.GetFullPath(args[1]);
            Require(String.Equals(Path.GetDirectoryName(sentinel), root, StringComparison.OrdinalIgnoreCase), "sentinel_location");
            byte[] sentinelBefore = File.ReadAllBytes(sentinel);

            phase = "child_start";
            var start = new ProcessStartInfo
            {
                FileName = Assembly.GetExecutingAssembly().Location,
                Arguments = ChildMode + " \"" + root + "\" \"" + sentinel + "\"",
                UseShellExecute = false,
                CreateNoWindow = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            child = Process.Start(start);
            Require(child != null, "child_start");

            phase = "driver";
            FieldInfo clock = typeof(LegacyRecoveryUiDriver).GetField("clock", BindingFlags.Static | BindingFlags.NonPublic);
            MethodInfo exercise = typeof(LegacyRecoveryUiDriver).GetMethod("ExerciseInitialForm", BindingFlags.Static | BindingFlags.NonPublic);
            Require(clock != null && exercise != null, "private_driver_entry");
            clock.SetValue(null, Stopwatch.StartNew());
            originalError = Console.Error;
            driverTrace = new StringWriter();
            Console.SetError(driverTrace);
            try { exercise.Invoke(null, new object[] { child, root }); }
            finally { Console.SetError(originalError); }
            Require(WriteDriverTrace(driverTrace.ToString()), "driver_trace");

            phase = "child_output";
            string childOutput = child.StandardOutput.ReadToEnd();
            string childError = child.StandardError.ReadToEnd();
            Require(child.ExitCode == 1, "child_exit_code");
            Require(childError.Length == 0, "child_stderr");
            Require(childOutput.Trim() == "{\"ok\":true,\"cleanupAttempted\":false,\"cleanupCompleted\":false,\"sentinelUnchanged\":true}", "child_postconditions");
            Require(ByteArraysEqual(sentinelBefore, File.ReadAllBytes(sentinel)), "parent_sentinel_unchanged");

            Console.WriteLine("{\"ok\":true,\"driverCompleted\":true,\"childExitCode\":1,\"cleanupUntouched\":true,\"sentinelUnchanged\":true}");
            return 0;
        }
        catch (Exception error)
        {
            if (originalError != null) Console.SetError(originalError);
            string lastDriverPhase = LastDriverPhase(driverTrace == null ? String.Empty : driverTrace.ToString());
            if (lastDriverPhase != null)
            {
                Console.Error.WriteLine("LEGACY_UI_FAILURE:" + lastDriverPhase);
                Console.Error.Flush();
                phase = lastDriverPhase;
            }
            string code = error is TargetInvocationException && error.InnerException != null
                ? error.InnerException.GetType().Name : error.GetType().Name;
            string operation = "unclassified";
            if (error is TargetInvocationException && error.InnerException != null)
            {
                foreach (StackFrame frame in new StackTrace(error.InnerException, false).GetFrames() ?? new StackFrame[0])
                {
                    string name = frame.GetMethod().Name;
                    if (name == "FindTopWindows" || name == "WindowClass" || name == "ReadWindowText"
                        || name == "WaitForRecoveryWindow" || name == "RemainingMilliseconds")
                    { operation = name; break; }
                }
            }
            FieldInfo enumerationError = typeof(LegacyRecoveryUiDriver).GetField("windowEnumerationError", BindingFlags.Static | BindingFlags.NonPublic);
            int nativeCode = enumerationError == null ? -1 : (int)enumerationError.GetValue(null);
            Console.WriteLine("{\"ok\":false,\"phase\":\"" + phase + "\",\"failure\":\"" + code + "\",\"operation\":\"" + operation + "\",\"nativeCode\":" + nativeCode + "}");
            return 1;
        }
        finally
        {
            if (child != null)
            {
                try
                {
                    if (!child.HasExited && child.CloseMainWindow()) child.WaitForExit(5000);
                    if (!child.HasExited)
                    {
                        child.Kill();
                        child.WaitForExit(5000);
                    }
                }
                catch { }
                child.Dispose();
            }
        }
    }

    static bool WriteDriverTrace(string trace)
    {
        string[] lines = trace.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length != DriverPhases.Length) return false;
        for (int index = 0; index < lines.Length; index++)
        {
            if (lines[index] != "LEGACY_UI_PHASE:" + DriverPhases[index]) return false;
        }
        Console.Error.Write(trace);
        Console.Error.Flush();
        return true;
    }

    static string LastDriverPhase(string trace)
    {
        string last = null;
        string[] lines = trace.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (string line in lines)
        {
            const string prefix = "LEGACY_UI_PHASE:";
            if (!line.StartsWith(prefix, StringComparison.Ordinal)) return null;
            string value = line.Substring(prefix.Length);
            bool allowed = false;
            foreach (string candidate in DriverPhases) if (candidate == value) { allowed = true; break; }
            if (!allowed) return null;
            last = value;
        }
        return last;
    }

    static int ShowForm(string rootArgument, string sentinelArgument)
    {
        bool cleanupAttempted = false;
        bool cleanupCompleted = false;
        bool sentinelUnchanged = false;
        try
        {
            // Guarantee an initial empty-desktop interval before the real form
            // exists, as on an otherwise empty isolated Windows CI desktop.
            Thread.Sleep(300);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string root = Path.GetFullPath(rootArgument);
            string sentinel = Path.GetFullPath(sentinelArgument);
            Require(String.Equals(Path.GetDirectoryName(sentinel), root, StringComparison.OrdinalIgnoreCase), "sentinel_location");
            byte[] before = File.ReadAllBytes(sentinel);
            PinnedProgramCatalog catalog = PinnedProgramCatalog.LoadEmbedded(typeof(LegacyRecoveryUiDriverFixture).Assembly);
            RootBinding binding = VerifiedResidue.InspectRoot(root);
            ConstructorInfo constructor = typeof(LegacyRecoverySession).GetConstructor(
                BindingFlags.Instance | BindingFlags.NonPublic, null,
                new Type[] { typeof(RootBinding), typeof(PinnedProgramCatalog) }, null);
            Require(constructor != null, "private_session_constructor");
            var session = (LegacyRecoverySession)constructor.Invoke(new object[] { binding, catalog });
            using (var form = new LegacyRecoveryForm(session)) Application.Run(form);
            cleanupAttempted = session.CleanupAttempted;
            cleanupCompleted = session.CleanupCompleted;
            sentinelUnchanged = ByteArraysEqual(before, File.ReadAllBytes(sentinel));
            Require(!cleanupAttempted && !cleanupCompleted && sentinelUnchanged, "postconditions");
            Console.WriteLine("{\"ok\":true,\"cleanupAttempted\":false,\"cleanupCompleted\":false,\"sentinelUnchanged\":true}");
            return 1;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"cleanupAttempted\":" + cleanupAttempted.ToString().ToLowerInvariant()
                + ",\"cleanupCompleted\":" + cleanupCompleted.ToString().ToLowerInvariant()
                + ",\"sentinelUnchanged\":" + sentinelUnchanged.ToString().ToLowerInvariant() + "}");
            return 2;
        }
    }

    static bool ByteArraysEqual(byte[] left, byte[] right)
    {
        if (left == null || right == null || left.Length != right.Length) return false;
        for (int index = 0; index < left.Length; index++) if (left[index] != right[index]) return false;
        return true;
    }
}
