using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Sps.LegacyRecovery;

internal static class LegacyRecoverySessionFixture
{
    static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException();
    }

    static LegacyRegistration Registration(string name, string version, string uninstall, bool perUser)
    {
        return new LegacyRegistration(name, version, uninstall, perUser);
    }

    static bool Matches(LegacyRegistration record, string target)
    {
        return LegacyRecoverySession.MatchesRegisteredTarget(new List<LegacyRegistration> { record }, target);
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 1 && Directory.Exists(args[0]));
            const string target = @"C:\Users\fixture\AppData\Local\Programs\SPS";
            const string uninstall = "\"C:\\Users\\fixture\\AppData\\Local\\Programs\\SPS\\Uninstall SPS Desktop.exe\" /currentuser";
            int accepted = 0;
            int rejected = 0;

            Require(Matches(Registration("SPS Desktop 0.4.86", "0.4.86", uninstall, true), target));
            accepted++;
            Require(Matches(Registration("SPS Desktop 0.4.86", "0.4.86",
                "\"c:\\users\\fixture\\appdata\\local\\programs\\sps\\UNINSTALL SPS DESKTOP.EXE\" /CURRENTUSER", true), target));
            accepted++;
            Require(LegacyRecoverySession.MatchesRegisteredTarget(new List<LegacyRegistration> {
                Registration("SPS Desktop 0.4.86", "0.4.86", "\"" + target + "\\Uninstall SPS Desktop.exe\" /currentuser", true)
            }, target + "\\"));
            accepted++;

            Reject(Registration("SPS Desktop 0.4.86", "0.4.86", "\"%LOCALAPPDATA%\\Programs\\SPS\\Uninstall SPS Desktop.exe\" /currentuser", true), target, ref rejected);
            Reject(Registration("SPS Desktop 0.4.86", "0.4.86", uninstall + " /silent", true), target, ref rejected);
            Reject(Registration("SPS Desktop 0.4.86", "0.4.86", "C:\\Users\\fixture\\AppData\\Local\\Programs\\SPS\\Uninstall SPS Desktop.exe /currentuser", true), target, ref rejected);
            Reject(Registration("SPS Desktop 0.4.86", "0.4.86", "\"C:\\Users\\fixture\\AppData\\Local\\Programs\\SPS-old\\Uninstall SPS Desktop.exe\" /currentuser", true), target, ref rejected);
            Reject(Registration("SPS Desktop", "0.4.86", uninstall, true), target, ref rejected);
            Reject(Registration("SPS Desktop 0.4.86", "0.4.85", uninstall, true), target, ref rejected);
            Reject(Registration("SPS Desktop 0.4.86", "0.4.86", uninstall, false), target, ref rejected);
            Require(!LegacyRecoverySession.MatchesRegisteredTarget(new List<LegacyRegistration> {
                Registration("SPS Desktop 0.4.86", "0.4.86", uninstall, true),
                Registration("SPS Desktop 0.4.86", "0.4.86", uninstall, true)
            }, target));
            rejected++;
            Require(!LegacyRecoverySession.MatchesRegisteredTarget(new List<LegacyRegistration> { null }, target));
            rejected++;
            Require(!LegacyRecoverySession.MatchesRegisteredTarget(null, target));
            rejected++;
            Require(!LegacyRecoverySession.MatchesRegisteredTarget(new List<LegacyRegistration> {
                Registration("SPS Desktop 0.4.86", "0.4.86", uninstall, true)
            }, "relative\\SPS"));
            rejected++;
            Require(accepted == 3 && rejected == 11);
            VerifyDiagnostics(args[0]);
            Console.WriteLine("{\"ok\":true,\"accepted\":3,\"rejected\":11,\"fixedStagesVerified\":true,\"nativeRangeVerified\":true,\"realNativeFailureVerified\":true,\"safeStatusPreserved\":true}");
            return 0;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"accepted\":0,\"rejected\":0}");
            return 1;
        }
    }

    static void VerifyDiagnostics(string root)
    {
        var stages = new[] { LegacyRecoveryStage.Unknown, LegacyRecoveryStage.Preconditions,
            LegacyRecoveryStage.ProcessCheck, LegacyRecoveryStage.RegistrationCheck, LegacyRecoveryStage.ResidueValidation,
            LegacyRecoveryStage.Confirmation, LegacyRecoveryStage.Removal, (LegacyRecoveryStage)(-1) };
        var codes = new[] { "unknown", "preconditions", "process-check", "registration-check", "residue-validation", "confirmation", "removal", "unknown" };
        const string privateText = "C:\\private-fixture\\private@example.invalid";
        var cause = new InvalidOperationException(privateText);
        for (int index = 0; index < stages.Length; index++)
        {
            var failure = new LegacyRecoveryException(stages[index], cause);
            Require(failure.Code == codes[index] && failure.NativeResidueError == 0);
            Require(failure.Diagnostic == "[code:" + codes[index] + "; native:0]");
            Require(failure.Message == "The old SPS installation cannot be safely recovered.");
            Require(Object.ReferenceEquals(failure.InnerException, cause));
            Require(failure.Diagnostic.IndexOf(privateText, StringComparison.Ordinal) < 0);
        }
        // Constructor boundary checks are separate from the real native API failure below.
        foreach (int code in new[] { Int32.MinValue, -1, 0, 1, 65535, 65536, Int32.MaxValue })
        {
            var residue = new ResidueVerificationException(code);
            var failure = new LegacyRecoveryException(LegacyRecoveryStage.ResidueValidation, residue);
            int expected = code >= 0 && code <= 65535 ? code : 0;
            Require(failure.NativeResidueError == expected);
            Require(failure.Diagnostic == "[code:residue-validation; native:" + expected.ToString(System.Globalization.CultureInfo.InvariantCulture) + "]");
            Require(Object.ReferenceEquals(failure.InnerException, residue));
        }

        RootBinding binding = VerifiedResidue.InspectRoot(root);
        string missing = Path.Combine(root, "missing-program-root");
        Require(!Directory.Exists(missing) && !File.Exists(missing));
        ResidueVerificationException nativeFailure = null;
        try
        {
            using (VerifiedResidue residue = VerifiedResidue.Open(missing, binding.Identity,
                new[] { new CatalogFile("resources/sps-owner-host-runtime/fixture.bin", 0, new string('0', 64)) },
                new[] { ".", "resources", "resources/sps-owner-host-runtime" }))
                Require(false);
        }
        catch (ResidueVerificationException error) { nativeFailure = error; }
        Require(nativeFailure != null && (nativeFailure.NativeError == 2 || nativeFailure.NativeError == 3));
        var wrapped = new LegacyRecoveryException(LegacyRecoveryStage.ResidueValidation, nativeFailure);
        Require(wrapped.NativeResidueError == nativeFailure.NativeError);
        Require(Object.ReferenceEquals(wrapped.InnerException, nativeFailure));

        PinnedProgramCatalog catalog = PinnedProgramCatalog.LoadEmbedded(typeof(LegacyRecoverySessionFixture).Assembly);
        ConstructorInfo constructor = typeof(LegacyRecoverySession).GetConstructor(BindingFlags.Instance | BindingFlags.NonPublic,
            null, new[] { typeof(RootBinding), typeof(PinnedProgramCatalog) }, null);
        Require(constructor != null);
        var session = (LegacyRecoverySession)constructor.Invoke(new object[] { binding, catalog });
        bool confirmCalled = false, rejected = false;
        try { session.CleanAfterUserUninstalled(false, false, delegate(int files, int directories) { confirmCalled = true; return true; }); }
        catch (LegacyRecoveryException error)
        {
            rejected = error.Stage == LegacyRecoveryStage.Preconditions && error.NativeResidueError == 0;
        }
        Require(rejected && !confirmCalled && !session.CleanupAttempted && !session.CleanupCompleted);
        using (var form = new LegacyRecoveryForm(session))
        {
            MethodInfo check = typeof(LegacyRecoveryForm).GetMethod("CheckRemaining", BindingFlags.Instance | BindingFlags.NonPublic);
            Require(check != null);
            check.Invoke(form, new object[] { null, EventArgs.Empty });
            Control[] status = form.Controls.Find("legacy-recovery-status", true);
            Control[] diagnostic = form.Controls.Find("legacy-recovery-diagnostic", true);
            Require(status.Length == 1 && diagnostic.Length == 1);
            Require(status[0].Text == "Cannot safely clean this folder. Make sure Windows uninstall finished and SPS is closed. Unknown, changed or linked files require manual review. No cleanup was started.");
            Require(diagnostic[0].Text == "[code:preconditions; native:0]");
            Require(!session.CleanupAttempted && !session.CleanupCompleted);
        }
    }

    static void Reject(LegacyRegistration record, string target, ref int count)
    {
        Require(!Matches(record, target));
        count++;
    }
}
