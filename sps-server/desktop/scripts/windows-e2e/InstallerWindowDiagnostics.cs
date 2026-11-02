using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

// Read-only diagnostics for a desktop and Job owned by the test launcher.
// Never log window text: installer messages can contain account names or paths.
public static class InstallerWindowDiagnostics
{
    const int WindowLimit = 32;
    const int ControlLimit = 64;
    delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll", SetLastError = true)] static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll", SetLastError = true)] static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr window, StringBuilder name, int count);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr count, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int MessageBoxW(IntPtr parent, string text, string caption, uint flags);

    public static void ShowProbeDialog()
    {
        MessageBoxW(IntPtr.Zero, "Owned SPS installer diagnostic probe. private@example.invalid C:\\private\\fixture", "SPS diagnostic fixture", 0);
    }

    static bool OwnedWindow(IntPtr window, IntPtr job, ref bool readOK)
    {
        uint processId;
        if (GetWindowThreadProcessId(window, out processId) == 0 || processId == 0) { readOK = false; return false; }
        IntPtr process = OpenProcess(0x1000, false, processId);
        if (process == IntPtr.Zero) { readOK = false; return false; }
        try
        {
            bool member;
            if (!IsProcessInJob(process, job, out member)) { readOK = false; return false; }
            return member;
        }
        finally { CloseHandle(process); }
    }

    static string Kind(IntPtr window, ref bool readOK)
    {
        var name = new StringBuilder(128);
        if (GetClassNameW(window, name, name.Capacity) == 0) { readOK = false; return "unavailable"; }
        string value = name.ToString();
        if (value == "#32770") return "dialog";
        if (String.Equals(value, "Button", StringComparison.OrdinalIgnoreCase)) return "button";
        if (String.Equals(value, "Static", StringComparison.OrdinalIgnoreCase)) return "static";
        if (String.Equals(value, "msctls_progress32", StringComparison.OrdinalIgnoreCase)) return "progress";
        return "other";
    }

    static string MessageKind(IntPtr window, ref bool readOK)
    {
        var text = new StringBuilder(2048);
        UIntPtr result;
        // WM_GETTEXT only, with a bounded wait even if the installer is hung.
        if (SendMessageTimeoutW(window, 0x000D, new UIntPtr((uint)text.Capacity), text, 0x0003, 100, out result) == IntPtr.Zero)
        { readOK = false; return "unavailable"; }
        string value = text.ToString();
        if (value.IndexOf("Owned SPS installer diagnostic probe.", StringComparison.Ordinal) == 0) return "fixture_prompt";
        if (value.IndexOf("Failed to uninstall old application files.", StringComparison.OrdinalIgnoreCase) >= 0) return "old_uninstall_failed";
        if (value.IndexOf("cannot be closed.", StringComparison.OrdinalIgnoreCase) >= 0) return "app_cannot_close";
        if (value.IndexOf("Failed to decompress", StringComparison.OrdinalIgnoreCase) >= 0) return "decompression_failed";
        if (value.IndexOf("Unable to elevate", StringComparison.OrdinalIgnoreCase) >= 0) return "elevation_failed";
        return "other";
    }

    public static void Write(IntPtr job, IntPtr desktop)
    {
        bool readOK = job != IntPtr.Zero && desktop != IntPtr.Zero;
        bool truncated = false;
        int visited = 0, controlsVisited = 0;
        var windows = new List<string>();
        var elapsed = Stopwatch.StartNew();
        if (readOK)
        {
            try
            {
                bool enumerated = EnumDesktopWindows(desktop, delegate(IntPtr window, IntPtr unused)
                {
                    if (++visited > WindowLimit || elapsed.ElapsedMilliseconds >= 2500) { truncated = true; return false; }
                    if (!OwnedWindow(window, job, ref readOK)) return true;
                    string kind = Kind(window, ref readOK);
                    var messages = new SortedSet<string>(StringComparer.Ordinal);
                    var controls = new List<string>();
                    if (kind == "dialog")
                    {
                        EnumChildWindows(window, delegate(IntPtr control, IntPtr unusedControl)
                        {
                            if (++controlsVisited > ControlLimit || elapsed.ElapsedMilliseconds >= 2500) { truncated = true; return false; }
                            if (!OwnedWindow(control, job, ref readOK)) return true;
                            string controlKind = Kind(control, ref readOK);
                            if (controlKind == "static") messages.Add(MessageKind(control, ref readOK));
                            controls.Add("{\"kind\":\"" + controlKind + "\",\"id\":" + GetDlgCtrlID(control)
                                + ",\"enabled\":" + (IsWindowEnabled(control) ? "true" : "false") + "}");
                            return true;
                        }, IntPtr.Zero);
                    }
                    windows.Add("{\"kind\":\"" + kind + "\",\"visible\":" + (IsWindowVisible(window) ? "true" : "false")
                        + ",\"enabled\":" + (IsWindowEnabled(window) ? "true" : "false")
                        + ",\"messages\":[" + (messages.Count == 0 ? "" : "\"" + String.Join("\",\"", messages) + "\"")
                        + "],\"controls\":[" + String.Join(",", controls) + "]}");
                    return !truncated;
                }, IntPtr.Zero);
                if (!enumerated && !truncated) readOK = false;
            }
            catch { readOK = false; }
        }
        Console.WriteLine("{\"ownedInstallerWindowDiagnostics\":true,\"readOK\":" + (readOK ? "true" : "false")
            + ",\"truncated\":" + (truncated ? "true" : "false") + ",\"windows\":[" + String.Join(",", windows) + "]}");
    }
}
