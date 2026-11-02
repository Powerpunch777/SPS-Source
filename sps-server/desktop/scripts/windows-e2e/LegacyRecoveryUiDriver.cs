using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;

internal static class LegacyRecoveryUiDriver
{
    const int OverallTimeoutMs = 450000;
    const int UiWaitTimeoutMs = 15000;
    const int MessageTimeoutMs = 1000;
    const int PollIntervalMs = 100;
    const uint BmClick = 0x00F5;
    const uint WmGetText = 0x000D;
    const uint DmGetDefId = 0x0400;
    const uint SmtoAbortIfHung = 0x0002;
    const ushort HasDefaultId = 0x534B;
    const string RecoveryTitle = "SPS 0.4.86 Recovery";
    const string ConfirmTitle = "Confirm program residue cleanup";
    const string CancelledStatus = "Cleanup cancelled. No program files were deleted.";
    const string RemovedStatus = "Verified program residue was removed. Close this window and run the latest SPS Setup again.";
    const string UnsafeCleanupStatus = "Cannot safely clean this folder. Make sure Windows uninstall finished and SPS is closed. Unknown, changed or linked files require manual review. No cleanup was started.";

    delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    sealed class DriverFailure : Exception { }
    sealed class CheckObservationDeadlineFailure : Exception { }
    sealed class RecoveryUnavailableFailure : Exception { }
    sealed class RecoveryWindowDeadlineFailure : Exception { }
    sealed class CleanupSafetyRejectedFailure : Exception { }

    static class Native
    {
        [DllImport("user32.dll", SetLastError = true)]
        internal static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindowsProc callback, IntPtr parameter);

        [DllImport("kernel32.dll")]
        internal static extern uint GetCurrentThreadId();

        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern void SetLastError(uint code);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern IntPtr GetThreadDesktop(uint threadId);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern int GetClassName(IntPtr window, StringBuilder className, int maxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam,
            StringBuilder lParam, uint flags, uint timeout, out IntPtr result);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam,
            IntPtr lParam, uint flags, uint timeout, out IntPtr result);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindowEnabled(IntPtr window);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetWindowLongW", SetLastError = true)]
        internal static extern int GetWindowStyle(IntPtr window, int index);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern int GetDlgCtrlID(IntPtr window);
    }

    static Stopwatch clock;
    static string phase = "entry";
    static int windowEnumerationError = -1;

    static void EnterPhase(string value)
    {
        phase = value;
        Console.Error.WriteLine("LEGACY_UI_PHASE:" + value);
        Console.Error.Flush();
    }

    static void Require(bool condition)
    {
        if (!condition) throw new DriverFailure();
    }

    static int RemainingMilliseconds()
    {
        long remaining = OverallTimeoutMs - clock.ElapsedMilliseconds;
        Require(remaining > 0);
        return remaining > Int32.MaxValue ? Int32.MaxValue : (int)remaining;
    }

    static int UiWaitBudget()
    {
        return Math.Min(UiWaitTimeoutMs, RemainingMilliseconds());
    }

    static string QuoteArgument(string value)
    {
        Require(value != null && value.IndexOf('"') < 0);
        for (int index = 0; index < value.Length; index++) Require(!Char.IsControl(value[index]));
        return "\"" + value + "\"";
    }

    static string ValidateLocalAbsolutePath(string path, bool executable)
    {
        Require(!String.IsNullOrEmpty(path));
        Require(Path.IsPathRooted(path));
        Require(path.Length >= 3 && Char.IsLetter(path[0]) && path[1] == ':' &&
            (path[2] == '\\' || path[2] == '/'));
        Require(!path.StartsWith("\\\\", StringComparison.Ordinal));
        string full = Path.GetFullPath(path);
        Require(String.Equals(full, path, StringComparison.OrdinalIgnoreCase));
        if (executable) Require(File.Exists(full));
        else Require(Directory.Exists(full));
        QuoteArgument(full);
        return full;
    }

    static string WindowClass(IntPtr window, uint processId)
    {
        Require(OwnsWindow(window, processId));
        StringBuilder name = new StringBuilder(256);
        int length = Native.GetClassName(window, name, name.Capacity);
        Require(length > 0 && length < name.Capacity);
        return name.ToString();
    }

    static bool ClassMatches(string actual, string expected)
    {
        return String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase) ||
            actual.StartsWith("WindowsForms10." + expected + ".", StringComparison.OrdinalIgnoreCase);
    }

    static bool OwnsWindow(IntPtr window, uint processId)
    {
        uint actualProcessId;
        return window != IntPtr.Zero && Native.GetWindowThreadProcessId(window, out actualProcessId) != 0
            && actualProcessId == processId;
    }

    static string ReadWindowText(IntPtr window, uint processId)
    {
        Require(OwnsWindow(window, processId));
        StringBuilder text = new StringBuilder(4096);
        IntPtr result;
        IntPtr sent = Native.SendMessageTimeout(window, WmGetText, new IntPtr(text.Capacity), text,
            SmtoAbortIfHung, MessageTimeoutMs, out result);
        Require(sent != IntPtr.Zero && OwnsWindow(window, processId));
        return text.ToString();
    }

    static IntPtr[] FindTopWindows(uint processId)
    {
        var windows = new System.Collections.Generic.List<IntPtr>();
        EnumWindowsProc callback = delegate(IntPtr window, IntPtr parameter)
        {
            if (OwnsWindow(window, processId)) windows.Add(window);
            return true;
        };
        // Enumerate only this thread's desktop, including a non-interactive
        // owned test desktop. The handle is borrowed and must not be closed.
        IntPtr desktop = Native.GetThreadDesktop(Native.GetCurrentThreadId());
        Require(desktop != IntPtr.Zero && desktop != new IntPtr(-1));
        Native.SetLastError(0);
        bool enumerated = Native.EnumDesktopWindows(desktop, callback, IntPtr.Zero);
        windowEnumerationError = enumerated ? 0 : Marshal.GetLastWin32Error();
        Require(enumerated);
        return windows.ToArray();
    }

    static IntPtr[] FindChildren(IntPtr parent, uint processId)
    {
        var windows = new System.Collections.Generic.List<IntPtr>();
        EnumWindowsProc callback = delegate(IntPtr window, IntPtr parameter)
        {
            if (OwnsWindow(window, processId)) windows.Add(window);
            return true;
        };
        Require(OwnsWindow(parent, processId));
        Require(Native.EnumChildWindows(parent, callback, IntPtr.Zero));
        return windows.ToArray();
    }

    static IntPtr FindWindow(uint processId, string title, string className)
    {
        foreach (IntPtr window in FindTopWindows(processId))
        {
            if (OwnsWindow(window, processId) && WindowClass(window, processId) == className &&
                ReadWindowText(window, processId) == title) return window;
        }
        return IntPtr.Zero;
    }

    static IntPtr WaitForWindow(uint processId, string title, string className)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        while (clock.ElapsedMilliseconds < deadline)
        {
            IntPtr window = FindWindow(processId, title, className);
            if (window != IntPtr.Zero) return window;
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new DriverFailure();
    }

    static IntPtr WaitForConfirmDialog(IntPtr form, uint processId)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        while (clock.ElapsedMilliseconds < deadline)
        {
            Require(OwnsWindow(form, processId));
            IntPtr dialog = FindWindow(processId, ConfirmTitle, "#32770");
            if (dialog != IntPtr.Zero) return dialog;
            if (FindChildByText(form, processId, UnsafeCleanupStatus, "Static") != IntPtr.Zero)
            {
                WriteSafetyDiagnostic(form, processId);
                throw new CleanupSafetyRejectedFailure();
            }
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new DriverFailure();
    }

    static void WriteSafetyDiagnostic(IntPtr form, uint processId)
    {
        // Never serialize arbitrary window text, even when owned by this test.
        const string pattern = @"\A\[code:(unknown|preconditions|process-check|registration-check|residue-validation|confirmation|removal); native:(0|[1-9][0-9]{0,4})\]\z";
        string stage = "unknown";
        int native = 0;
        int matches = 0;
        foreach (IntPtr child in FindChildren(form, processId))
        {
            if (!ClassMatches(WindowClass(child, processId), "Static")) continue;
            Match match = Regex.Match(ReadWindowText(child, processId), pattern, RegexOptions.CultureInvariant);
            int code;
            if (!match.Success || !Int32.TryParse(match.Groups[2].Value, out code) || code > 65535) continue;
            stage = match.Groups[1].Value;
            native = code;
            matches++;
        }
        if (matches != 1) { stage = "unknown"; native = 0; }
        Console.Error.WriteLine("LEGACY_UI_SAFETY:" + stage + ":" + native.ToString(System.Globalization.CultureInfo.InvariantCulture));
        Console.Error.Flush();
    }

    static IntPtr FindChildByText(IntPtr parent, uint processId, string text, string requiredClass)
    {
        foreach (IntPtr child in FindChildren(parent, processId))
        {
            if (OwnsWindow(child, processId) && ClassMatches(WindowClass(child, processId), requiredClass) &&
                ReadWindowText(child, processId) == text) return child;
        }
        return IntPtr.Zero;
    }

    static IntPtr WaitForRecoveryWindow(Process helper)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        // Startup readiness consumes the same original window deadline; an
        // empty private desktop is not evidence that the child failed to start.
        if (!helper.WaitForInputIdle(budget)) throw new RecoveryWindowDeadlineFailure();
        while (clock.ElapsedMilliseconds < deadline)
        {
            Require(!helper.HasExited);
            foreach (IntPtr candidate in FindTopWindows((uint)helper.Id))
            {
                if (OwnsWindow(candidate, (uint)helper.Id) &&
                    WindowClass(candidate, (uint)helper.Id) == "#32770" &&
                    ReadWindowText(candidate, (uint)helper.Id) == "SPS Recovery unavailable")
                    throw new RecoveryUnavailableFailure();
                if (OwnsWindow(candidate, (uint)helper.Id) &&
                    ClassMatches(WindowClass(candidate, (uint)helper.Id), "Window") &&
                    ReadWindowText(candidate, (uint)helper.Id) == RecoveryTitle) return candidate;
            }
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new RecoveryWindowDeadlineFailure();
    }

    static IntPtr WaitForRecoveryChild(IntPtr form, uint processId, string text, string className)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        while (clock.ElapsedMilliseconds < deadline)
        {
            Require(OwnsWindow(form, processId));
            IntPtr child = FindChildByText(form, processId, text, className);
            if (child != IntPtr.Zero) return child;
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new DriverFailure();
    }

    static Task<bool> ReadCheck(IntPtr checkBox, uint processId)
    {
        Require(OwnsWindow(checkBox, processId));
        // WinForms owner-drawn checks do not expose a valid BM_GETCHECK state.
        // Read the real accessibility toggle state; never set it directly.
        return Task.Run(delegate
        {
            Require(OwnsWindow(checkBox, processId));
            AutomationElement element = AutomationElement.FromHandle(checkBox);
            Require(element != null && element.Current.ProcessId == processId);
            object pattern;
            Require(element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern));
            ToggleState state = ((TogglePattern)pattern).Current.ToggleState;
            Require(OwnsWindow(checkBox, processId) && (state == ToggleState.On || state == ToggleState.Off));
            return state == ToggleState.On;
        });
    }

    static bool ObserveCheck(Task<bool> read, long deadline)
    {
        while (clock.ElapsedMilliseconds < deadline)
        {
            int remaining = (int)Math.Min(deadline - clock.ElapsedMilliseconds, RemainingMilliseconds());
            if (remaining <= 0) throw new CheckObservationDeadlineFailure();
            bool completed;
            try { completed = read.Wait(Math.Min(MessageTimeoutMs, remaining)); }
            catch (AggregateException) { completed = true; }
            if (!completed) continue;
            if (clock.ElapsedMilliseconds >= deadline) throw new CheckObservationDeadlineFailure();
            // Unwrap a provider failure instead of treating it as a pending read.
            return read.GetAwaiter().GetResult();
        }
        throw new CheckObservationDeadlineFailure();
    }

    static bool ReadDefaultId(IntPtr dialog, uint processId, out int controlId)
    {
        Require(OwnsWindow(dialog, processId));
        IntPtr result;
        IntPtr sent = Native.SendMessageTimeout(dialog, DmGetDefId, IntPtr.Zero, IntPtr.Zero,
            SmtoAbortIfHung, MessageTimeoutMs, out result);
        Require(sent != IntPtr.Zero && OwnsWindow(dialog, processId));
        long packed = result.ToInt64();
        controlId = (int)(packed & 0xFFFF);
        return (ushort)((packed >> 16) & 0xFFFF) == HasDefaultId;
    }

    static void Click(IntPtr control, uint processId)
    {
        Require(IsEnabled(control, processId));
        Require(Native.PostMessage(control, BmClick, IntPtr.Zero, IntPtr.Zero));
    }

    static bool IsEnabled(IntPtr control, uint processId)
    {
        Require(OwnsWindow(control, processId));
        bool enabled = Native.IsWindowEnabled(control);
        Require(OwnsWindow(control, processId));
        return enabled;
    }

    static IntPtr FindEnabledButton(IntPtr parent, uint processId, string text)
    {
        IntPtr button = FindChildByText(parent, processId, text, "Button");
        Require(button != IntPtr.Zero && IsEnabled(button, processId));
        return button;
    }

    static IntPtr FindCheckBox(IntPtr form, uint processId, string text)
    {
        IntPtr checkBox = FindChildByText(form, processId, text, "Button");
        Require(checkBox != IntPtr.Zero && OwnsWindow(checkBox, processId));
        return checkBox;
    }

    static void WaitCheckState(IntPtr checkBox, uint processId, bool expected)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        while (clock.ElapsedMilliseconds < deadline)
        {
            if (ObserveCheck(ReadCheck(checkBox, processId), deadline) == expected) return;
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new DriverFailure();
    }

    static void WaitEnabled(IntPtr control, uint processId, bool expected)
    {
        int budget = UiWaitBudget();
        long deadline = clock.ElapsedMilliseconds + budget;
        while (clock.ElapsedMilliseconds < deadline)
        {
            Require(OwnsWindow(control, processId));
            if (IsEnabled(control, processId) == expected) return;
            Thread.Sleep(Math.Min(PollIntervalMs, Math.Max(1, RemainingMilliseconds())));
        }
        throw new DriverFailure();
    }

    static void VerifyTarget(IntPtr form, uint processId, string root)
    {
        IntPtr target = WaitForRecoveryChild(form, processId, root, "Edit");
        Require(ReadWindowText(target, processId) == root);
        Require((Native.GetWindowStyle(target, -16) & 0x0800) != 0);
    }

    static void WaitForHelperExit(Process helper, int expectedExitCode)
    {
        Require(helper.WaitForExit(Math.Min(UiWaitTimeoutMs, RemainingMilliseconds())));
        Require(helper.ExitCode == expectedExitCode);
    }

    static void ExerciseInitialForm(Process helper, string root)
    {
        uint processId = (uint)helper.Id;
        EnterPhase("initial-window");
        IntPtr form = WaitForRecoveryWindow(helper);
        Require(OwnsWindow(form, processId));
        EnterPhase("initial-target");
        VerifyTarget(form, processId, root);
        EnterPhase("initial-controls");
        IntPtr inspect = WaitForRecoveryChild(form, processId, "Check remaining files", "Button");
        IntPtr backup = FindCheckBox(form, processId, "I have backed up my SPS data.");
        IntPtr inside = FindCheckBox(form, processId, "Work inside this program folder has been backed up or moved.");
        Require(!IsEnabled(inspect, processId));
        EnterPhase("initial-backup");
        Click(backup, processId);
        WaitCheckState(backup, processId, true);
        WaitEnabled(inspect, processId, false);
        EnterPhase("initial-inside");
        Click(inside, processId);
        WaitCheckState(inside, processId, true);
        WaitEnabled(inspect, processId, true);
        EnterPhase("initial-uncheck");
        Click(inside, processId);
        WaitCheckState(inside, processId, false);
        WaitEnabled(inspect, processId, false);
        EnterPhase("initial-recheck");
        Click(inside, processId);
        WaitCheckState(inside, processId, true);
        WaitEnabled(inspect, processId, true);
        EnterPhase("initial-cancel");
        Click(FindEnabledButton(form, processId, "Cancel"), processId);
        EnterPhase("initial-exit");
        WaitForHelperExit(helper, 1);
    }

    static void RequireProtocolLine(string expected)
    {
        Task<string> read = Console.In.ReadLineAsync();
        Require(read.Wait(RemainingMilliseconds()));
        Require(read.Result == expected);
    }

    static Process Launch(string helperPath, string root)
    {
        var start = new ProcessStartInfo();
        start.FileName = helperPath;
        start.Arguments = "--recover " + QuoteArgument(root);
        start.UseShellExecute = false;
        start.CreateNoWindow = false;
        Process process = Process.Start(start);
        Require(process != null);
        return process;
    }

    static void ToggleOn(IntPtr form, uint processId, string firstText, string secondText)
    {
        IntPtr inspect = WaitForRecoveryChild(form, processId, "Check remaining files", "Button");
        IntPtr first = FindCheckBox(form, processId, firstText);
        IntPtr second = FindCheckBox(form, processId, secondText);
        Require(!IsEnabled(inspect, processId));
        Click(first, processId);
        WaitCheckState(first, processId, true);
        WaitEnabled(inspect, processId, false);
        Click(second, processId);
        WaitCheckState(second, processId, true);
        WaitEnabled(inspect, processId, true);
    }

    static void ConfirmDialog(IntPtr form, uint processId, string root, int expectedId)
    {
        Require(expectedId == 6 || expectedId == 7);
        IntPtr dialog = WaitForConfirmDialog(form, processId);
        Require(OwnsWindow(dialog, processId));
        var text = new StringBuilder();
        foreach (IntPtr child in FindChildren(dialog, processId))
        {
            string part = ReadWindowText(child, processId);
            if (part.Length != 0) text.Append(part).Append('\n');
        }
        Require(text.ToString().IndexOf(root, StringComparison.Ordinal) >= 0);
        int defaultId;
        Require(ReadDefaultId(dialog, processId, out defaultId) && defaultId == 7);
        IntPtr button = IntPtr.Zero;
        foreach (IntPtr child in FindChildren(dialog, processId))
        {
            if (!ClassMatches(WindowClass(child, processId), "Button")) continue;
            Require(OwnsWindow(child, processId));
            if (Native.GetDlgCtrlID(child) == expectedId) { button = child; break; }
        }
        Require(button != IntPtr.Zero);
        Click(button, processId);
        Require(OwnsWindow(form, processId));
    }

    static void WaitStatus(IntPtr form, uint processId, string expected)
    {
        IntPtr status = WaitForRecoveryChild(form, processId, expected, "Static");
        Require(ReadWindowText(status, processId) == expected);
    }

    static void ExerciseCleanup(Process helper, string root)
    {
        uint processId = (uint)helper.Id;
        EnterPhase("cleanup-window");
        IntPtr form = WaitForRecoveryWindow(helper);
        EnterPhase("cleanup-target");
        VerifyTarget(form, processId, root);
        EnterPhase("cleanup-controls");
        ToggleOn(form, processId, "I have backed up my SPS data.",
            "Work inside this program folder has been backed up or moved.");
        Console.Out.WriteLine("READY");
        Console.Out.Flush();
        EnterPhase("await-uninstalled");
        RequireProtocolLine("UNINSTALLED");

        EnterPhase("decline-check");
        Click(FindEnabledButton(form, processId, "Check remaining files"), processId);
        EnterPhase("decline-confirm");
        ConfirmDialog(form, processId, root, 7);
        EnterPhase("decline-status");
        WaitStatus(form, processId, CancelledStatus);
        Console.Out.WriteLine("DECLINED");
        Console.Out.Flush();
        EnterPhase("await-cleanup");
        RequireProtocolLine("CLEANUP");

        EnterPhase("cleanup-check");
        Click(FindEnabledButton(form, processId, "Check remaining files"), processId);
        EnterPhase("cleanup-confirm");
        ConfirmDialog(form, processId, root, 6);
        EnterPhase("cleanup-status");
        WaitStatus(form, processId, RemovedStatus);
        EnterPhase("cleanup-close");
        Click(FindEnabledButton(form, processId, "Close"), processId);
        EnterPhase("cleanup-exit");
        WaitForHelperExit(helper, 0);
    }

    public static int Main(string[] args)
    {
        Process helper = null;
        try
        {
            clock = Stopwatch.StartNew();
            Require(Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true");
            Require(Environment.GetEnvironmentVariable("RUNNER_OS") == "Windows");
            Require(Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") == "github-hosted");
            Require(args != null && args.Length == 2);
            string helperPath = ValidateLocalAbsolutePath(args[0], true);
            string root = ValidateLocalAbsolutePath(args[1], false);

            EnterPhase("initial-launch");
            helper = Launch(helperPath, root);
            ExerciseInitialForm(helper, root);
            helper.Dispose();
            helper = null;

            EnterPhase("cleanup-launch");
            helper = Launch(helperPath, root);
            ExerciseCleanup(helper, root);
            EnterPhase("done");
            Console.Out.WriteLine("PASSED");
            Console.Out.Flush();
            return 0;
        }
        catch (Exception error)
        {
            if (error is RecoveryUnavailableFailure) Console.Error.WriteLine("LEGACY_UI_REASON:recovery-unavailable");
            else if (error is RecoveryWindowDeadlineFailure) Console.Error.WriteLine("LEGACY_UI_REASON:recovery-window-deadline");
            else if (error is CheckObservationDeadlineFailure) Console.Error.WriteLine("LEGACY_UI_REASON:check-observation-deadline");
            else if (error is CleanupSafetyRejectedFailure) Console.Error.WriteLine("LEGACY_UI_REASON:cleanup-safety-rejected");
            Console.Error.WriteLine("LEGACY_UI_FAILURE:" + phase);
            Console.Error.Flush();
            return 2;
        }
        finally
        {
            if (helper != null) helper.Dispose();
        }
    }
}
