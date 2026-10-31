using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Sps.LegacyRecovery;

internal static class LegacyResidueFixture
{
    private sealed class FixtureSkipException : Exception { }
    private const string Payload = "approved legacy residue fixture\n";
    private const string FailureMessage = "Legacy program residue verification failed.";
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint ShareRead = 1;
    private const uint OpenExisting = 3;
    private const uint OpenAlways = 4;
    private const uint BackupSemantics = 0x02000000;
    private const uint OpenReparsePoint = 0x00200000;
    private const uint FsctlSetReparsePoint = 0x000900A4;
    private const uint IoReparseTagMountPoint = 0xA0000003;
    private const uint ShareWrite = 2;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateHardLink(string fileName, string existingFileName, IntPtr securityAttributes);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security,
        uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DeviceIoControl(IntPtr handle, uint code, byte[] input, uint inputSize,
        IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteFile(IntPtr handle, byte[] buffer, uint bytesToWrite,
        out uint bytesWritten, IntPtr overlapped);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetFileAttributes(string name, uint attributes);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint bufferLength);

    private static string Hash(string value)
    {
        using (SHA256 sha = SHA256.Create())
        {
            byte[] digest = sha.ComputeHash(Encoding.ASCII.GetBytes(value));
            StringBuilder result = new StringBuilder(digest.Length * 2);
            foreach (byte item in digest) result.Append(item.ToString("x2"));
            return result.ToString();
        }
    }

    private static string LongRelativePath()
    {
        StringBuilder value = new StringBuilder("resources\\sps-owner-host-runtime");
        for (int i = 0; i < 4; i++) value.Append("\\segment-" + i + "-" + new string((char)('a' + i), 74));
        return value.Append("\\payload.bin").ToString();
    }

    private static void WritePayload(string file)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file));
        File.WriteAllText(file, Payload, new UTF8Encoding(false));
    }

    private static void WriteAlternateStream(string file)
    {
        IntPtr handle = CreateFile(file + ":fixture", GenericWrite, ShareRead | ShareWrite, IntPtr.Zero,
            OpenAlways, 0, IntPtr.Zero);
        if (handle == new IntPtr(-1))
        {
            int code = Marshal.GetLastWin32Error();
            if (code == 1 || code == 50) throw new FixtureSkipException();
            throw new InvalidOperationException(FailureMessage);
        }
        try
        {
            byte[] bytes = Encoding.ASCII.GetBytes("alternate stream");
            uint written;
            if (!WriteFile(handle, bytes, (uint)bytes.Length, out written, IntPtr.Zero) || written != (uint)bytes.Length)
                throw new InvalidOperationException(FailureMessage);
        }
        finally { CloseHandle(handle); }
    }

    private static bool TryOpenWrite(string file, out IntPtr handle)
    {
        handle = CreateFile(file, GenericWrite, ShareRead | ShareWrite, IntPtr.Zero,
            OpenExisting, 0, IntPtr.Zero);
        if (handle != new IntPtr(-1)) return true;
        handle = IntPtr.Zero;
        return false;
    }

    private static void RequireRejected(Action operation)
    {
        bool rejected = false;
        try
        {
            operation();
        }
        catch (Exception error)
        {
            if (error.Message != FailureMessage) throw new InvalidOperationException(FailureMessage);
            rejected = true;
        }
        Require(rejected);
    }

    private static void VerifyValidControl(string root, string relative)
    {
        string file = Path.Combine(root, relative);
        WritePayload(file);
        RootIdentity identity = VerifiedResidue.Identify(root);
        using (VerifiedResidue control = VerifiedResidue.Open(root, identity, Catalog(relative, false), Directories(relative)))
            Require(control.FileCount == 1);
    }

    private static CatalogFile[] Catalog(string relative, bool wrongDigest)
    {
        return new[] { new CatalogFile(relative.Replace('\\', '/'), Encoding.ASCII.GetByteCount(Payload),
            wrongDigest ? new string('0', 64) : Hash(Payload)) };
    }

    private static string[] Directories(string relative)
    {
        List<string> directories = new List<string> { ".", "resources", "resources/sps-owner-host-runtime" };
        string normalized = relative.Replace('\\', '/');
        int slash = normalized.LastIndexOf('/');
        string parent = normalized.Substring(0, slash);
        string current = "";
        foreach (string segment in parent.Split('/'))
        {
            current = current.Length == 0 ? segment : current + "/" + segment;
            if (!directories.Contains(current)) directories.Add(current);
        }
        return directories.ToArray();
    }

    private static bool OpenIsRejected(Func<VerifiedResidue> open)
    {
        try
        {
            using (VerifiedResidue residue = open()) { }
            return false;
        }
        catch (Exception error)
        {
            Require(error.Message == FailureMessage);
            return true;
        }
    }

    private static bool OperationIsRejected(Action operation)
    {
        try { operation(); return false; }
        catch (Exception error)
        {
            Require(error.Message == FailureMessage);
            return true;
        }
    }

    private static bool Fails(Action action)
    {
        try { action(); return false; }
        catch { return true; }
    }

    private static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException(FailureMessage);
    }

    private static string CanonicalTempPath()
    {
        string temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        StringBuilder result = new StringBuilder(32768);
        uint length = GetLongPathName(temp, result, (uint)result.Capacity);
        if (length == 0 || length >= result.Capacity) throw new InvalidOperationException(FailureMessage);
        return Path.GetFullPath(result.ToString()).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static void CreateJunction(string junction, string target)
    {
        Directory.CreateDirectory(junction);
        string substitute = "\\??\\" + Path.GetFullPath(target);
        string print = Path.GetFullPath(target);
        byte[] sub = Encoding.Unicode.GetBytes(substitute);
        byte[] shown = Encoding.Unicode.GetBytes(print);
        byte[] buffer = new byte[16 + sub.Length + 2 + shown.Length + 2];
        Buffer.BlockCopy(BitConverter.GetBytes(IoReparseTagMountPoint), 0, buffer, 0, 4);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)(8 + sub.Length + 2 + shown.Length + 2)), 0, buffer, 4, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)0), 0, buffer, 8, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)sub.Length), 0, buffer, 10, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)(sub.Length + 2)), 0, buffer, 12, 2);
        Buffer.BlockCopy(BitConverter.GetBytes((ushort)shown.Length), 0, buffer, 14, 2);
        Buffer.BlockCopy(sub, 0, buffer, 16, sub.Length);
        Buffer.BlockCopy(shown, 0, buffer, 16 + sub.Length + 2, shown.Length);

        IntPtr handle = CreateFile(junction, GenericRead | GenericWrite, ShareRead | ShareWrite, IntPtr.Zero, OpenExisting,
            BackupSemantics | OpenReparsePoint, IntPtr.Zero);
        if (handle == new IntPtr(-1)) throw new InvalidOperationException(FailureMessage);
        try
        {
            uint returned;
            if (!DeviceIoControl(handle, FsctlSetReparsePoint, buffer, (uint)buffer.Length,
                IntPtr.Zero, 0, out returned, IntPtr.Zero)) throw new InvalidOperationException(FailureMessage);
        }
        finally { CloseHandle(handle); }
    }

    private static void Run(string parent, string scenario)
    {
        string temp = CanonicalTempPath();
        string owned = Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!string.Equals(Path.GetDirectoryName(owned), temp, StringComparison.OrdinalIgnoreCase) ||
            !Path.GetFileName(owned).StartsWith("sps-legacy-native-", StringComparison.Ordinal))
            throw new InvalidOperationException(FailureMessage);

        string root = Path.Combine(owned, "root");
        if (scenario == "root-junction")
        {
            VerifyValidControl(Path.Combine(owned, "control-root"), "resources\\sps-owner-host-runtime\\payload.bin");
            string target = Path.Combine(owned, "outside-target");
            Directory.CreateDirectory(target);
            File.WriteAllText(Path.Combine(target, "target-sentinel"), "outside target remains unchanged");
            CreateJunction(root, target);
            RequireRejected(() => VerifiedResidue.Identify(root));
            Require(File.ReadAllText(Path.Combine(target, "target-sentinel")) == "outside target remains unchanged");
            return;
        }
        if (scenario == "protected-root")
        {
            VerifyValidControl(Path.Combine(owned, "control-root"), "resources\\sps-owner-host-runtime\\payload.bin");
            string protectedRoot = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (String.IsNullOrEmpty(protectedRoot) || !Directory.Exists(protectedRoot))
                throw new InvalidOperationException(FailureMessage);
            RequireRejected(() => VerifiedResidue.Identify(protectedRoot));
            return;
        }

        Directory.CreateDirectory(Path.Combine(root, "resources", "sps-owner-host-runtime"));
        string relative = scenario == "long-path" ? LongRelativePath() : "resources\\sps-owner-host-runtime\\payload.bin";
        string file = Path.Combine(root, relative);
        if (scenario != "long-path" && !File.Exists(file)) WritePayload(file);
        RootBinding binding = VerifiedResidue.InspectRoot(root);
        RootIdentity identity = binding.Identity;
        CatalogFile[] validCatalog = Catalog(relative, false);
        string[] directories = Directories(relative);
        VerifiedResidue.VerifyOriginalFile(binding, validCatalog[0]);
        using (VerifiedResidue control = VerifiedResidue.Open(root, identity, validCatalog, directories))
            Require(control.FileCount == 1);

        if (scenario == "unexpected") File.WriteAllText(Path.Combine(root, "unexpected.bin"), "unexpected");
        if (scenario == "changed") File.WriteAllText(file, "changed bytes\n");
        if (scenario == "root-replaced")
        {
            Directory.Move(root, Path.Combine(owned, "moved-root"));
            Directory.CreateDirectory(root);
            File.WriteAllText(Path.Combine(root, "replacement.bin"), "replacement");
        }
        if (scenario == "hardlink")
        {
            if (!CreateHardLink(Path.Combine(root, "hardlink.bin"), file, IntPtr.Zero))
                throw new InvalidOperationException(FailureMessage);
        }
        if (scenario == "ads")
        {
            WriteAlternateStream(file);
        }
        if (scenario == "junction") CreateJunction(Path.Combine(root, "resources", "linked"), owned);

        CatalogFile[] catalog = Catalog(relative, scenario == "wrong-digest");
        if (scenario == "unexpected" || scenario == "changed" || scenario == "root-replaced" ||
            scenario == "hardlink" || scenario == "ads" || scenario == "junction" || scenario == "wrong-digest" ||
            scenario == "root-ads" || scenario == "readonly")
        {
            if (scenario == "root-ads") WriteAlternateStream(root);
            if (scenario == "readonly")
            {
                FileAttributes oldAttributes = File.GetAttributes(file);
                if (!SetFileAttributes(file, (uint)(oldAttributes | FileAttributes.ReadOnly)))
                    throw new InvalidOperationException(FailureMessage);
            }
            Require(OpenIsRejected(() => VerifiedResidue.Open(root, identity, catalog, directories)));
            if (scenario == "changed" || scenario == "root-replaced" || scenario == "ads" || scenario == "hardlink" || scenario == "wrong-digest")
                Require(OperationIsRejected(() => VerifiedResidue.VerifyOriginalFile(binding, catalog[0])));
            if (scenario == "root-replaced")
            {
                Require(File.Exists(Path.Combine(owned, "moved-root", relative)));
                Require(File.Exists(Path.Combine(root, "replacement.bin")));
            }
            else
            {
                Require(File.Exists(file));
                if (scenario == "changed") Require(File.ReadAllText(file) == "changed bytes\n");
                if (scenario == "unexpected") Require(File.Exists(Path.Combine(root, "unexpected.bin")));
                if (scenario == "wrong-digest") Require(File.ReadAllText(file) == Payload);
                if (scenario == "hardlink") Require(File.Exists(Path.Combine(root, "hardlink.bin")));
                if (scenario == "junction")
                    Require((File.GetAttributes(Path.Combine(root, "resources", "linked")) & FileAttributes.ReparsePoint) != 0);
                if (scenario == "root-ads" || scenario == "readonly") Require(File.ReadAllText(file) == Payload);
            }
            if (scenario == "readonly" && !SetFileAttributes(file, (uint)File.GetAttributes(file) & ~(uint)FileAttributes.ReadOnly))
                throw new InvalidOperationException(FailureMessage);
            return;
        }

        if (scenario == "preexisting-writer")
        {
            IntPtr writer;
            if (!TryOpenWrite(file, out writer)) throw new InvalidOperationException(FailureMessage);
            try { RequireRejected(() => VerifiedResidue.Open(root, identity, catalog, directories)); }
            finally { CloseHandle(writer); }
            Require(File.ReadAllText(file) == Payload);
            return;
        }

        if (scenario == "confirm-write-denied")
        {
            using (VerifiedResidue residue = VerifiedResidue.Open(root, identity, catalog, directories))
            {
                bool denied = false;
                Require(!residue.Remove(() =>
                {
                    IntPtr writer;
                    if (TryOpenWrite(file, out writer))
                    {
                        CloseHandle(writer);
                        return false;
                    }
                    denied = true;
                    return false;
                }));
                Require(denied);
            }
            Require(File.ReadAllText(file) == Payload);
            string moved = Path.Combine(owned, "released-root");
            Directory.Move(root, moved);
            Directory.Move(moved, root);
            return;
        }

        if (scenario == "locks")
        {
            using (VerifiedResidue residue = VerifiedResidue.Open(root, identity, catalog, directories))
            {
                Require(Fails(() => Directory.Move(root, Path.Combine(owned, "rename-root"))));
                Require(Fails(() => File.Move(file, file + ".moved")));
            }
            Directory.Move(root, Path.Combine(owned, "rename-root"));
            Directory.Move(Path.Combine(owned, "rename-root"), root);
            File.Move(file, file + ".moved");
            File.Move(file + ".moved", file);
            return;
        }

        using (VerifiedResidue residue = VerifiedResidue.Open(root, identity, catalog, directories))
        {
            Require(residue.FileCount == 1);
            Require(residue.DirectoryCount >= 1);
            if (scenario == "decline")
            {
                Require(!residue.Remove(() => false));
            }
            else if (scenario == "throw-confirm")
            {
                bool threw = false;
                try { residue.Remove(() => { throw new InvalidOperationException("private fixture detail"); }); }
                catch { threw = true; }
                Require(threw);
            }
            else if (scenario == "insert-during-confirm")
            {
                bool rejected = OperationIsRejected(() => residue.Remove(() =>
                {
                    File.WriteAllText(Path.Combine(root, "inserted.bin"), "inserted");
                    return true;
                }));
                Require(rejected && File.Exists(file) && File.Exists(Path.Combine(root, "inserted.bin")));
                return;
            }
            else if (scenario == "valid" || scenario == "long-path")
            {
                Require(residue.Remove(() => true));
            }
            else throw new InvalidOperationException(FailureMessage);
        }
        if (scenario == "decline" || scenario == "throw-confirm")
        {
            Require(File.ReadAllText(file) == Payload);
            string moved = Path.Combine(owned, "released-root");
            Directory.Move(root, moved);
            Directory.Move(moved, root);
        }
        if (scenario == "valid" || scenario == "long-path") Require(!Directory.Exists(root));
    }

    public static int Main(string[] args)
    {
        string scenario = "invalid";
        try
        {
            if (args.Length != 2) throw new InvalidOperationException(FailureMessage);
            scenario = args[1];
            string[] allowed = { "valid", "decline", "throw-confirm", "unexpected", "changed", "wrong-digest",
                "root-replaced", "locks", "long-path", "hardlink", "ads", "junction", "insert-during-confirm",
                "preexisting-writer", "confirm-write-denied", "root-ads", "readonly", "root-junction", "protected-root" };
            if (Array.IndexOf(allowed, scenario) < 0) throw new InvalidOperationException(FailureMessage);
            Run(args[0], scenario);
            Console.WriteLine("{\"ok\":true,\"scenario\":\"" + scenario + "\"}");
            return 0;
        }
        catch (FixtureSkipException)
        {
            Console.WriteLine("{\"ok\":true,\"scenario\":\"" + scenario + "\",\"skipped\":\"filesystem-unsupported\"}");
            return 0;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"scenario\":\"" + scenario + "\",\"message\":\"" + FailureMessage + "\"}");
            return 1;
        }
    }
}
