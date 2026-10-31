using System;
using System.Collections.Generic;
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

    public static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 0);
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
            Console.WriteLine("{\"ok\":true,\"accepted\":3,\"rejected\":11}");
            return 0;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"accepted\":0,\"rejected\":0}");
            return 1;
        }
    }

    static void Reject(LegacyRegistration record, string target, ref int count)
    {
        Require(!Matches(record, target));
        count++;
    }
}
