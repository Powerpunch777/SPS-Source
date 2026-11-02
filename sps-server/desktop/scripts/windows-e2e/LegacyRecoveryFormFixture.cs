using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing.Imaging;
using Sps.LegacyRecovery;

internal static class LegacyRecoveryFormFixture
{
    sealed class FixtureFailure : InvalidOperationException
    {
        public readonly string Code;
        public FixtureFailure(string code) : base(code) { Code = code; }
    }

    static void Require(bool condition, string name)
    {
        if (!condition) throw new FixtureFailure(name);
    }

    static Control Find(Control root, string name)
    {
        foreach (Control control in root.Controls)
        {
            if (control.Name == name) return control;
            Control nested = Find(control, name);
            if (nested != null) return nested;
        }
        return null;
    }

    static void CheckLayout(Control parent)
    {
        foreach (Control control in parent.Controls)
        {
            if (!control.Visible) continue;
            Require(parent.ClientRectangle.Contains(control.Bounds), "control_bounds");
            CheckLayout(control);
        }
        for (int left = 0; left < parent.Controls.Count; left++)
        {
            Control a = parent.Controls[left];
            if (!a.Visible || a.Controls.Count != 0 || a.Width == 0 || a.Height == 0) continue;
            for (int right = left + 1; right < parent.Controls.Count; right++)
            {
                Control b = parent.Controls[right];
                if (!b.Visible || b.Controls.Count != 0 || b.Width == 0 || b.Height == 0) continue;
                Require(!a.Bounds.IntersectsWith(b.Bounds), "control_overlap");
            }
        }
    }

    [STAThread]
    public static int Main(string[] args)
    {
        bool controlsPresent = false, initialDisabled = false, singleDisabled = false;
        bool bothEnabled = false, uncheckedDisabled = false, recheckedEnabled = false;
        bool cancelClosed = false, cleanupUntouched = false, sentinelUnchanged = false;
        bool layoutValid = false, interactionsCompleted = false;
        bool previewGenerated = false;
        string failurePhase = "setup", failureCode = null;
        try
        {
            Require(args.Length == 2 || args.Length == 3, "arguments");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string root = Path.GetFullPath(args[0]);
            string sentinel = Path.GetFullPath(args[1]);
            Require(Path.GetDirectoryName(sentinel) == root, "sentinel_location");
            string previewPath = null;
            if (args.Length == 3)
            {
                previewPath = Path.GetFullPath(args[2]);
                Require(String.Equals(Path.GetDirectoryName(previewPath), root, StringComparison.OrdinalIgnoreCase)
                    && String.Equals(Path.GetFileName(previewPath), "preview.png", StringComparison.OrdinalIgnoreCase), "preview_path");
            }
            byte[] sentinelBefore = File.ReadAllBytes(sentinel);
            PinnedProgramCatalog catalog = PinnedProgramCatalog.LoadEmbedded(typeof(LegacyRecoveryFormFixture).Assembly);
            RootBinding binding = VerifiedResidue.InspectRoot(root);
            ConstructorInfo constructor = typeof(LegacyRecoverySession).GetConstructor(
                BindingFlags.Instance | BindingFlags.NonPublic, null,
                new Type[] { typeof(RootBinding), typeof(PinnedProgramCatalog) }, null);
            Require(constructor != null, "private_session_constructor");
            var session = (LegacyRecoverySession)constructor.Invoke(new object[] { binding, catalog });
            var form = new LegacyRecoveryForm(session);
            Button cancel = (Button)Find(form, "legacy-recovery-cancel");
            Button inspect = (Button)Find(form, "legacy-recovery-check");
            CheckBox backup = (CheckBox)Find(form, "legacy-recovery-backup");
            CheckBox inside = (CheckBox)Find(form, "legacy-recovery-inside-work");
            TextBox target = (TextBox)Find(form, "legacy-recovery-target");
            Label status = (Label)Find(form, "legacy-recovery-status");
            controlsPresent = cancel != null && inspect != null && backup != null && inside != null && target != null && status != null;
            Require(controlsPresent, "named_controls");

            form.Shown += delegate
            {
                form.BeginInvoke((MethodInvoker)delegate
                {
                    try
                    {
                        if (previewPath != null)
                        {
                            failurePhase = "preview_capture";
                            Require(!File.Exists(previewPath), "preview_exists");
                            using (var bitmap = new Bitmap(form.Width, form.Height))
                            {
                                form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                                bitmap.Save(previewPath, ImageFormat.Png);
                            }
                            previewGenerated = true;
                        }
                        failurePhase = "layout";
                        form.PerformLayout();
                        CheckLayout(form);
                        Require(form.ClientSize == new Size(680, 450), "default_client_size");
                        layoutValid = true;
                        failurePhase = "checkbox_initial";
                        initialDisabled = !inspect.Enabled;
                        Require(initialDisabled, "initial_disabled");
                        failurePhase = "checkbox_single";
                        backup.Checked = true;
                        singleDisabled = !inspect.Enabled;
                        Require(singleDisabled, "single_checkbox_disabled");
                        failurePhase = "checkbox_both";
                        inside.Checked = true;
                        bothEnabled = inspect.Enabled;
                        Require(bothEnabled, "both_checkboxes_enabled");
                        failurePhase = "checkbox_unchecked";
                        backup.Checked = false;
                        uncheckedDisabled = !inspect.Enabled;
                        Require(uncheckedDisabled, "uncheck_disables");
                        failurePhase = "checkbox_rechecked";
                        backup.Checked = true;
                        recheckedEnabled = inspect.Enabled;
                        Require(recheckedEnabled, "recheck_enables");
                        interactionsCompleted = true;
                        failurePhase = "cancel";
                        cancel.PerformClick();
                    }
                    catch (Exception error)
                    {
                        failureCode = error is FixtureFailure ? ((FixtureFailure)error).Code : "fixture_exception";
                        form.Close();
                    }
                });
            };
            failurePhase = "message_loop";
            form.Show();
            Application.Run(form);
            cancelClosed = form.IsDisposed;
            cleanupUntouched = !session.CleanupAttempted && !session.CleanupCompleted;
            sentinelUnchanged = ByteArraysEqual(sentinelBefore, File.ReadAllBytes(sentinel));
            if (failureCode != null) throw new FixtureFailure(failureCode);
            failurePhase = "postconditions";
            Require(layoutValid && interactionsCompleted && cancelClosed && cleanupUntouched && sentinelUnchanged, "postconditions");
            Console.WriteLine("{\"ok\":true,\"controlsPresent\":true,\"initialDisabled\":true,\"singleCheckboxDisabled\":true,\"bothEnabled\":true,\"uncheckDisabled\":true,\"recheckEnabled\":true,\"cancelClosed\":true,\"cleanupUntouched\":true,\"sentinelUnchanged\":true,\"layoutValid\":true,\"previewGenerated\":" + previewGenerated.ToString().ToLowerInvariant() + "}");
            return 0;
        }
        catch (Exception error)
        {
            if (failureCode == null) failureCode = error is FixtureFailure ? ((FixtureFailure)error).Code : "fixture_exception";
            Console.WriteLine("{\"ok\":false,\"controlsPresent\":" + controlsPresent.ToString().ToLowerInvariant()
                + ",\"initialDisabled\":" + initialDisabled.ToString().ToLowerInvariant()
                + ",\"singleCheckboxDisabled\":" + singleDisabled.ToString().ToLowerInvariant()
                + ",\"bothEnabled\":" + bothEnabled.ToString().ToLowerInvariant()
                + ",\"uncheckDisabled\":" + uncheckedDisabled.ToString().ToLowerInvariant()
                + ",\"recheckEnabled\":" + recheckedEnabled.ToString().ToLowerInvariant()
                + ",\"cancelClosed\":" + cancelClosed.ToString().ToLowerInvariant()
                + ",\"cleanupUntouched\":" + cleanupUntouched.ToString().ToLowerInvariant()
                + ",\"sentinelUnchanged\":" + sentinelUnchanged.ToString().ToLowerInvariant()
                + ",\"layoutValid\":" + layoutValid.ToString().ToLowerInvariant()
                + ",\"previewGenerated\":" + previewGenerated.ToString().ToLowerInvariant()
                + ",\"failureCode\":\"" + failureCode + "\",\"failurePhase\":\"" + failurePhase + "\"}");
            return 1;
        }
    }

    static bool ByteArraysEqual(byte[] left, byte[] right)
    {
        if (left == null || right == null || left.Length != right.Length) return false;
        for (int index = 0; index < left.Length; index++) if (left[index] != right[index]) return false;
        return true;
    }
}
