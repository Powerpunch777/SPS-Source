using System;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;

namespace Sps.LegacyRecovery
{
    internal sealed class LegacyRecoveryForm : Form
    {
        readonly LegacyRecoverySession session;
        readonly CheckBox backup, inside;
        readonly Button inspect, cancel;
        readonly Label status;
        public LegacyRecoveryForm(LegacyRecoverySession session)
        {
            this.session = session;
            Text = "SPS 0.4.86 Recovery";
            Font = new Font("Segoe UI", 10);
            ClientSize = new Size(680, 450);
            MinimumSize = new Size(696, 489);
            StartPosition = FormStartPosition.CenterScreen;
            var panel = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 8 };
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Controls.Add(panel);
            panel.Controls.Add(new Label { Text = "Data-preserving recovery", AutoSize = true,
                Font = new Font("Segoe UI", 16, FontStyle.Bold) });
            panel.Controls.Add(new Label { Text = "Automatic replacement did not complete. This recovery never starts an old SPS app or deletes your SPS data folders.",
                AutoSize = true, MaximumSize = new Size(620, 0), Margin = new Padding(0, 12, 0, 12) });
            panel.Controls.Add(new TextBox { Text = session.TargetPath, ReadOnly = true, Dock = DockStyle.Top, Name = "legacy-recovery-target" });
            panel.Controls.Add(new Label { Text = "Keep this recovery window open.\n1. Back up SPS data and move any work saved inside the program folder above.\n2. Uninstall SPS Desktop in Windows Installed Apps without deleting app data.\n3. Return here to check the remaining program files.",
                AutoSize = true, MaximumSize = new Size(620, 0), Margin = new Padding(0, 12, 0, 12) });
            backup = new CheckBox { Text = "I have backed up my SPS data.", AutoSize = true, Name = "legacy-recovery-backup" };
            inside = new CheckBox { Text = "Work inside this program folder has been backed up or moved.", AutoSize = true, Name = "legacy-recovery-inside-work" };
            panel.Controls.Add(backup);
            panel.Controls.Add(inside);
            status = new Label { AutoSize = true, MaximumSize = new Size(620, 0), Text = "AppData, Host Vault and external project folders are not cleanup targets.",
                Margin = new Padding(0, 12, 0, 12), Name = "legacy-recovery-status" };
            panel.Controls.Add(status);
            var buttons = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill };
            inspect = new Button { Text = "Check remaining files", AutoSize = true, Enabled = false, Name = "legacy-recovery-check" };
            cancel = new Button { Text = "Cancel", AutoSize = true, Name = "legacy-recovery-cancel" };
            buttons.Controls.Add(inspect);
            buttons.Controls.Add(cancel);
            panel.Controls.Add(buttons);
            backup.CheckedChanged += delegate { inspect.Enabled = !session.CleanupAttempted && backup.Checked && inside.Checked; };
            inside.CheckedChanged += delegate { inspect.Enabled = !session.CleanupAttempted && backup.Checked && inside.Checked; };
            cancel.Click += delegate { Close(); };
            CancelButton = cancel;
            inspect.Click += CheckRemaining;
        }
        void CheckRemaining(object sender, EventArgs args)
        {
            inspect.Enabled = false;
            cancel.Enabled = false;
            try
            {
                bool removed = session.CleanAfterUserUninstalled(backup.Checked, inside.Checked, delegate(int files, int directories) {
                    return MessageBox.Show(this,
                        "Clean " + files + " verified original program files in this folder?\n\n" + session.TargetPath
                        + "\n\nAppData, Host Vault and external projects will not be deleted. Unknown, changed or linked files stop cleanup.",
                        "Confirm program residue cleanup", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
                });
                status.Text = removed ? "Verified program residue was removed. Close this window and run the latest SPS Setup again."
                    : "Cleanup cancelled. No program files were deleted.";
                if (removed) { backup.Enabled = false; inside.Enabled = false; inspect.Visible = false; cancel.Text = "Close"; }
            }
            catch
            {
                status.Text = session.CleanupAttempted
                    ? "Recovery stopped before it could confirm complete removal. Some verified program files may have been removed. Keep your backup and do not delete SPS data folders."
                    : "Cannot safely clean this folder. Make sure Windows uninstall finished and SPS is closed. Unknown, changed or linked files require manual review. No cleanup was started.";
            }
            finally
            {
                cancel.Enabled = true;
                inspect.Enabled = !session.CleanupAttempted && backup.Checked && inside.Checked;
            }
        }
    }

    internal static class LegacyRecoveryApp
    {
        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                if (args.Length != 2 || args[0] != "--recover") throw new InvalidOperationException();
                var catalog = PinnedProgramCatalog.LoadEmbedded(Assembly.GetExecutingAssembly());
                var session = LegacyRecoverySession.OpenRegisteredTarget(args[1], catalog);
                Application.Run(new LegacyRecoveryForm(session));
                return session.CleanupCompleted ? 0 : session.CleanupAttempted ? 2 : 1;
            }
            catch
            {
                MessageBox.Show("SPS could not verify an original per-user 0.4.86 installation for this recovery. No cleanup was started. Keep your backup. Recovery must be opened from the failed Setup while the original installation is still registered, before using Windows Installed Apps to uninstall it.",
                    "SPS Recovery unavailable", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 2;
            }
        }
    }
}
