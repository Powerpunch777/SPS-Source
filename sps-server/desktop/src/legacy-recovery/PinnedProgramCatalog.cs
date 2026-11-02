using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Sps.LegacyRecovery
{
    public sealed class PinnedProgramCatalog
    {
        const int CompressedLength = 1313545;
        const int RawLength = 5909697;
        const int ExpectedFiles = 29314;
        const int ExpectedDirectories = 3051;
        const string CompressedSha256 = "35834b4d078b72938ea9b2149933cd05356c6398c2ae8b873b927a781a52dfd7";
        const string RawSha256 = "dc41392de7ff7390a396a898f352cbc6883072d5a8b5203c780294720a872322";
        const string PinnedInstallerSha256 = "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56";
        const string PinnedContentSha256 = "659b8fa1d418bfa3b8b1756506121e80ff699d56b4ce9fbf988721121d6d75d3";
        const string FailureMessage = "Pinned legacy program catalog verification failed.";
        static readonly Regex Digest = new Regex("^[a-f0-9]{64}$", RegexOptions.CultureInvariant);
        static readonly Regex Reserved = new Regex("^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        [DataContract]
        sealed class Inventory
        {
            [DataMember(Name = "schemaVersion", Order = 0, IsRequired = true)] public int SchemaVersion;
            [DataMember(Name = "sourceVersion", Order = 1, IsRequired = true)] public string SourceVersion;
            [DataMember(Name = "installerSha256", Order = 2, IsRequired = true)] public string InstallerSha256;
            [DataMember(Name = "contentSha256", Order = 3, IsRequired = true)] public string ContentSha256;
            [DataMember(Name = "bytes", Order = 4, IsRequired = true)] public long Bytes;
            [DataMember(Name = "files", Order = 5, IsRequired = true)] public List<FileRecord> Files;
            [DataMember(Name = "directories", Order = 6, IsRequired = true)] public List<string> Directories;
        }

        [DataContract]
        sealed class FileRecord
        {
            [DataMember(Name = "path", Order = 0, IsRequired = true)] public string Path;
            [DataMember(Name = "size", Order = 1, IsRequired = true)] public long Size;
            [DataMember(Name = "sha256", Order = 2, IsRequired = true)] public string Sha256;
        }

        public readonly string SourceVersion;
        public readonly string InstallerSha256;
        public readonly string ContentSha256;
        public readonly long Bytes;
        public readonly System.Collections.ObjectModel.ReadOnlyCollection<CatalogFile> Files;
        public readonly System.Collections.ObjectModel.ReadOnlyCollection<string> Directories;

        PinnedProgramCatalog(Inventory inventory)
        {
            SourceVersion = inventory.SourceVersion;
            InstallerSha256 = inventory.InstallerSha256;
            ContentSha256 = inventory.ContentSha256;
            Bytes = inventory.Bytes;
            var files = new List<CatalogFile>(inventory.Files.Count);
            foreach (FileRecord file in inventory.Files)
                files.Add(new CatalogFile(file.Path, file.Size, file.Sha256));
            Files = files.AsReadOnly();
            Directories = inventory.Directories.AsReadOnly();
        }

        static Exception Failure() { return new InvalidOperationException(FailureMessage); }

        static string Hash(byte[] bytes)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(bytes);
                var result = new StringBuilder(hash.Length * 2);
                foreach (byte value in hash) result.Append(value.ToString("x2"));
                return result.ToString();
            }
        }

        static byte[] ReadBounded(Stream stream, int maximum)
        {
            using (var output = new MemoryStream(maximum))
            {
                byte[] buffer = new byte[65536];
                int total = 0;
                for (;;)
                {
                    int read = stream.Read(buffer, 0, Math.Min(buffer.Length, maximum + 1 - total));
                    if (read == 0) break;
                    total += read;
                    if (total > maximum) throw Failure();
                    output.Write(buffer, 0, read);
                }
                return output.ToArray();
            }
        }

        static void ValidateRelative(string value, bool directory)
        {
            if (String.IsNullOrEmpty(value) || value.Length > 32760 || (directory && value == "."))
            {
                if (directory && value == ".") return;
                throw Failure();
            }
            string[] parts = value.Split('/');
            if (parts.Length > 65) throw Failure();
            foreach (string part in parts)
            {
                if (part.Length == 0 || part.Length > 255 || part == "." || part == ".."
                    || part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal)
                    || Reserved.IsMatch(part)) throw Failure();
                foreach (char c in part)
                    if (c < 32 || "<>:\\\"|?*".IndexOf(c) >= 0) throw Failure();
            }
        }

        static PinnedProgramCatalog Decode(byte[] packed)
        {
            try
            {
                if (packed == null || packed.Length != CompressedLength || Hash(packed) != CompressedSha256) throw Failure();
                byte[] raw;
                using (var input = new MemoryStream(packed, false))
                using (var gzip = new GZipStream(input, CompressionMode.Decompress, false))
                    raw = ReadBounded(gzip, RawLength);
                if (raw.Length != RawLength || Hash(raw) != RawSha256) throw Failure();

                string json = new UTF8Encoding(false, true).GetString(raw);
                Inventory inventory;
                var serializer = new DataContractJsonSerializer(typeof(Inventory), new DataContractJsonSerializerSettings
                { MaxItemsInObjectGraph = 250000, IgnoreExtensionDataObject = true });
                using (var input = new MemoryStream(Encoding.UTF8.GetBytes(json), false))
                    inventory = (Inventory)serializer.ReadObject(input);

                if (inventory == null || inventory.SchemaVersion != 1 || inventory.SourceVersion != "0.4.86"
                    || inventory.InstallerSha256 != PinnedInstallerSha256 || inventory.ContentSha256 != PinnedContentSha256
                    || inventory.Files == null || inventory.Directories == null
                    || inventory.Files.Count != ExpectedFiles || inventory.Directories.Count != ExpectedDirectories
                    || inventory.Files.Count + inventory.Directories.Count > 100000) throw Failure();

                var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var directories = new HashSet<string>(StringComparer.Ordinal);
                long totalBytes = 0;
                foreach (string directory in inventory.Directories)
                {
                    ValidateRelative(directory, true);
                    if (!names.Add(directory) || !directories.Add(directory)) throw Failure();
                }
                if (!directories.Contains(".")) throw Failure();
                foreach (FileRecord file in inventory.Files)
                {
                    if (file == null) throw Failure();
                    ValidateRelative(file.Path, false);
                    if (file.Size < 0 || file.Sha256 == null || !Digest.IsMatch(file.Sha256) || !names.Add(file.Path)) throw Failure();
                    totalBytes = checked(totalBytes + file.Size);
                    if (totalBytes > 4L * 1024 * 1024 * 1024) throw Failure();
                    int slash = file.Path.LastIndexOf('/');
                    string parent = slash < 0 ? "." : file.Path.Substring(0, slash);
                    if (!directories.Contains(parent)) throw Failure();
                }
                foreach (string directory in inventory.Directories)
                {
                    if (directory == ".") continue;
                    int slash = directory.LastIndexOf('/');
                    string parent = slash < 0 ? "." : directory.Substring(0, slash);
                    if (!directories.Contains(parent)) throw Failure();
                }
                if (totalBytes != inventory.Bytes) throw Failure();
                return new PinnedProgramCatalog(inventory);
            }
            catch { throw Failure(); }
        }

        public static PinnedProgramCatalog FromCompressedBytes(byte[] packed)
        {
            return Decode(packed);
        }

        public static PinnedProgramCatalog LoadEmbedded(Assembly assembly)
        {
            try
            {
                if (assembly == null) throw Failure();
                using (Stream resource = assembly.GetManifestResourceStream("Sps.LegacyProgramInventory"))
                {
                    if (resource == null) throw Failure();
                    byte[] packed = ReadBounded(resource, CompressedLength);
                    return Decode(packed);
                }
            }
            catch { throw Failure(); }
        }
    }
}
