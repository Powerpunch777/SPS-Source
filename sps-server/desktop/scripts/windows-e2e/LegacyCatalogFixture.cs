using System;
using System.IO;
using System.Reflection;
using Sps.LegacyRecovery;

internal static class LegacyCatalogFixture
{
    const string FailureMessage = "Pinned legacy program catalog verification failed.";

    static void Require(bool condition)
    {
        if (!condition) throw new InvalidOperationException(FailureMessage);
    }

    static bool Rejected(Action action, bool fixedMessage)
    {
        try { action(); return false; }
        catch (Exception error) { if (fixedMessage) Require(error.Message == FailureMessage); return true; }
    }

    public static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 1);
            PinnedProgramCatalog catalog = PinnedProgramCatalog.LoadEmbedded(typeof(LegacyCatalogFixture).Assembly);
            Require(catalog.SourceVersion == "0.4.86");
            Require(catalog.InstallerSha256 == "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56");
            Require(catalog.Files.Count == 29314 && catalog.Directories.Count == 3051);
            Require(catalog.Bytes > 0 && catalog.ContentSha256.Length == 64);
            Require(catalog.Files[0].RelativePath != null && catalog.Files[0].Size >= 0 && catalog.Files[0].Sha256.Length == 64);
            Require(Rejected(() => ((System.Collections.Generic.IList<CatalogFile>)catalog.Files).Add(catalog.Files[0]), false));
            Require(Rejected(() => ((System.Collections.Generic.IList<string>)catalog.Directories).Add("external"), false));

            byte[] packed = File.ReadAllBytes(args[0]);
            Require(PinnedProgramCatalog.FromCompressedBytes(packed).Files.Count == 29314);
            Require(Rejected(() => PinnedProgramCatalog.FromCompressedBytes(null), true));
            Require(Rejected(() => PinnedProgramCatalog.FromCompressedBytes(new byte[packed.Length - 1]), true));
            byte[] corrupt = (byte[])packed.Clone();
            corrupt[corrupt.Length / 2] ^= 1;
            Require(Rejected(() => PinnedProgramCatalog.FromCompressedBytes(corrupt), true));
            byte[] concatenated = new byte[packed.Length * 2];
            Buffer.BlockCopy(packed, 0, concatenated, 0, packed.Length);
            Buffer.BlockCopy(packed, 0, concatenated, packed.Length, packed.Length);
            Require(Rejected(() => PinnedProgramCatalog.FromCompressedBytes(concatenated), true));
            Console.WriteLine("{\"ok\":true,\"files\":29314,\"directories\":3051}");
            return 0;
        }
        catch
        {
            Console.WriteLine("{\"ok\":false,\"message\":\"" + FailureMessage + "\"}");
            return 1;
        }
    }
}
