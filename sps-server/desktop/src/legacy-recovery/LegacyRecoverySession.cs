using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace Sps.LegacyRecovery
{
    public sealed class LegacyRegistration
    {
        public readonly string Name, Version, Uninstall;
        public readonly bool PerUser;
        public LegacyRegistration(string name, string version, string uninstall, bool perUser)
        { Name = name; Version = version; Uninstall = uninstall; PerUser = perUser; }
    }

    // Never writes registry, executes an old binary or deletes a profile.
    public sealed class LegacyRecoverySession
    {
        readonly RootBinding binding;
        readonly PinnedProgramCatalog catalog;
        public string TargetPath { get { return binding.CanonicalPath; } }
        public bool CleanupAttempted { get; private set; }
        public bool CleanupCompleted { get; private set; }
        LegacyRecoverySession(RootBinding binding, PinnedProgramCatalog catalog)
        { this.binding = binding; this.catalog = catalog; }
        static Exception Failure() { return new InvalidOperationException("The old SPS installation cannot be safely recovered."); }

        public static bool MatchesRegisteredTarget(IList<LegacyRegistration> records, string canonicalTarget)
        {
            if (records == null || records.Count != 1 || canonicalTarget == null) return false;
            LegacyRegistration record = records[0];
            return record != null && record.PerUser && record.Name == "SPS Desktop 0.4.86" && record.Version == "0.4.86"
                && String.Equals(record.Uninstall, "\"" + canonicalTarget.TrimEnd('\\') + "\\Uninstall SPS Desktop.exe\" /currentuser", StringComparison.OrdinalIgnoreCase);
        }

        static List<LegacyRegistration> Registrations()
        {
            var records = new List<LegacyRegistration>();
            var hives = new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine, RegistryHive.LocalMachine };
            var paths = new[] { @"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall", @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" };
            for (int index = 0; index < paths.Length; index++)
            using (RegistryKey hive = RegistryKey.OpenBaseKey(hives[index], RegistryView.Registry64))
            using (RegistryKey root = hive.OpenSubKey(paths[index], false))
            {
                if (root == null) continue;
                string[] keys = root.GetSubKeyNames();
                if (keys.Length > 100000) throw Failure();
                foreach (string key in keys)
                using (RegistryKey value = root.OpenSubKey(key, false))
                {
                    if (value == null) throw Failure();
                    string name = value.GetValue("DisplayName", null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
                    if (name == null || !(name.Equals("SPS", StringComparison.OrdinalIgnoreCase)
                        || name.StartsWith("SPS ", StringComparison.OrdinalIgnoreCase))) continue;
                    if (records.Count >= 64) throw Failure();
                    records.Add(new LegacyRegistration(name,
                        value.GetValue("DisplayVersion", null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string,
                        value.GetValue("UninstallString", null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string, index == 0));
                }
            }
            return records;
        }

        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref uint length);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
        static void NoDesktopProcess(string canonicalTarget = null)
        {
            Process[] processes = Process.GetProcessesByName("SPS Desktop");
            try { if (processes.Length != 0) throw Failure(); }
            finally { foreach (Process process in processes) process.Dispose(); }
            if (canonicalTarget == null) return;
            Process[] nodes = Process.GetProcessesByName("node");
            try
            {
                foreach (Process node in nodes)
                {
                    IntPtr handle = OpenProcess(0x1000, false, (uint)node.Id);
                    if (handle == IntPtr.Zero) { if (node.HasExited) continue; throw Failure(); }
                    try
                    {
                        var name = new StringBuilder(32768);
                        uint length = (uint)name.Capacity;
                        if (!QueryFullProcessImageNameW(handle, 0, name, ref length)) { if (node.HasExited) continue; throw Failure(); }
                        string executable = name.ToString();
                        if (executable.StartsWith(canonicalTarget.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) throw Failure();
                    }
                    finally { CloseHandle(handle); }
                }
            }
            finally { foreach (Process node in nodes) node.Dispose(); }
        }
        public static LegacyRecoverySession OpenRegisteredTarget(string target, PinnedProgramCatalog catalog)
        {
            try
            {
                if (catalog == null) throw Failure();
                NoDesktopProcess();
                RootBinding binding = VerifiedResidue.InspectRoot(target);
                NoDesktopProcess(binding.CanonicalPath);
                if (!MatchesRegisteredTarget(Registrations(), binding.CanonicalPath)) throw Failure();
                foreach (string name in new[] { "Uninstall SPS Desktop.exe", "SPS Desktop.exe", "resources/app.asar" })
                {
                    CatalogFile expected = null;
                    foreach (CatalogFile file in catalog.Files) if (file.RelativePath == name) { expected = file; break; }
                    if (expected == null) throw Failure();
                    VerifiedResidue.VerifyOriginalFile(binding, expected);
                }
                NoDesktopProcess(binding.CanonicalPath);
                if (!MatchesRegisteredTarget(Registrations(), binding.CanonicalPath)) throw Failure();
                return new LegacyRecoverySession(binding, catalog);
            }
            catch { throw Failure(); }
        }

        public bool CleanAfterUserUninstalled(bool backupConfirmed, bool insideWorkConfirmed, Func<int, int, bool> confirm)
        {
            try
            {
                if (CleanupAttempted || !backupConfirmed || !insideWorkConfirmed || confirm == null) throw Failure();
                NoDesktopProcess(binding.CanonicalPath);
                if (Registrations().Count != 0) throw Failure();
                using (VerifiedResidue residue = VerifiedResidue.Open(binding.CanonicalPath, binding.Identity, catalog.Files, catalog.Directories))
                {
                    bool removed = residue.Remove(delegate {
                        if (!confirm(residue.FileCount, residue.DirectoryCount)) return false;
                        NoDesktopProcess(binding.CanonicalPath);
                        if (Registrations().Count != 0) throw Failure();
                        CleanupAttempted = true;
                        return true;
                    });
                    CleanupCompleted = removed;
                    return removed;
                }
            }
            catch { throw Failure(); }
        }
    }
}
