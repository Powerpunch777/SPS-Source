using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

namespace Sps.LegacyRecovery
{
    public sealed class CatalogFile
    {
        public readonly string RelativePath;
        public readonly long Size;
        public readonly string Sha256;
        public CatalogFile(string relativePath, long size, string sha256)
        { RelativePath = relativePath; Size = size; Sha256 = sha256; }
    }

    public sealed class RootIdentity
    {
        public readonly uint VolumeSerialNumber;
        public readonly ulong FileIndex;
        public readonly long CreationTime;
        internal RootIdentity(uint volume, ulong index, long created)
        { VolumeSerialNumber = volume; FileIndex = index; CreationTime = created; }
    }

    public sealed class RootBinding
    {
        public readonly string CanonicalPath;
        public readonly RootIdentity Identity;
        internal RootBinding(string path, RootIdentity identity) { CanonicalPath = path; Identity = identity; }
    }

    public sealed class ResidueVerificationException : InvalidOperationException
    {
        public int NativeError { get; private set; }
        internal ResidueVerificationException(int code) : base("Legacy program residue verification failed.")
        { NativeError = code; }
    }

    // This library is not an authorization or catalog-trust boundary. The
    // installer must verify the pinned inventory, registry/process state and
    // target before opening it, and supply its real confirmation callback.
    public sealed class VerifiedResidue : IDisposable
    {
        const uint GenericRead = 0x80000000, DeleteAccess = 0x10000, ReadAttributes = 0x80;
        const uint ShareRead = 1, ShareWrite = 2, OpenExisting = 3;
        const uint BackupSemantics = 0x02000000, OpenReparsePoint = 0x00200000;
        const uint DirectoryAttribute = 0x10, ReparseAttribute = 0x400, ReadOnlyAttribute = 1;
        const string Runtime = "resources/sps-owner-host-runtime";
        const int MaximumResidueEntries = 4096;
        const long MaximumBytes = 4L * 1024 * 1024 * 1024;
        static readonly IntPtr Invalid = new IntPtr(-1);
        static readonly Regex Digest = new Regex("^[a-f0-9]{64}$", RegexOptions.CultureInvariant);
        static readonly Regex Reserved = new Regex("^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint Low, High; }
        [StructLayout(LayoutKind.Sequential)] struct Information
        {
            public uint Attributes;
            public FileTime Created, Accessed, Written;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct FindData
        {
            public uint Attributes;
            public FileTime Created, Accessed, Written;
            public uint SizeHigh, SizeLow, Reserved0, Reserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string Alternate;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StreamData
        {
            public long Size;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 296)] public string Name;
        }
        [StructLayout(LayoutKind.Sequential)] struct Disposition { public int DeleteFile; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetFileInformationByHandle(IntPtr handle, out Information value);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern uint GetFinalPathNameByHandleW(IntPtr handle, StringBuilder name, uint length, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern uint GetFullPathNameW(string name, uint length, StringBuilder result, IntPtr unused);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr FindFirstFileW(string pattern, out FindData value);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool FindNextFileW(IntPtr search, out FindData value);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr FindFirstStreamW(string name, int level, out StreamData value, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool FindNextStreamW(IntPtr search, out StreamData value);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool FindClose(IntPtr search);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetFileInformationByHandle(IntPtr handle, int kind, ref Disposition value, uint length);

        sealed class Entry : IDisposable
        {
            public readonly string Relative, Full;
            public readonly bool Directory;
            public readonly Information Original;
            public IntPtr Handle;
            public Entry(string relative, string full, bool directory, IntPtr handle, Information info)
            { Relative = relative; Full = full; Directory = directory; Handle = handle; Original = info; }
            public void Dispose()
            {
                if (Handle != IntPtr.Zero) { CloseHandle(Handle); Handle = IntPtr.Zero; }
            }
        }

        readonly List<Entry> ancestors = new List<Entry>();
        readonly List<Entry> entries = new List<Entry>();
        readonly Dictionary<string, CatalogFile> catalog = new Dictionary<string, CatalogFile>(StringComparer.OrdinalIgnoreCase);
        readonly HashSet<string> catalogDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        readonly Dictionary<string, HashSet<string>> children = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        readonly HashSet<string> observedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string root;
        bool disposed, consumed;
        long totalBytes;
        public int FileCount { get; private set; }
        public int DirectoryCount { get; private set; }
        public string TargetPath { get { return root == null ? null : root.Substring(4); } }
        VerifiedResidue() { }
        static Exception Failure() { return new ResidueVerificationException(0); }
        static Exception NativeFailure() { return new ResidueVerificationException(Marshal.GetLastWin32Error()); }
        static bool Valid(IntPtr value) { return value != IntPtr.Zero && value != Invalid; }
        static ulong Index(Information value) { return ((ulong)value.IndexHigh << 32) | value.IndexLow; }
        static long Stamp(FileTime value) { return unchecked((long)(((ulong)value.High << 32) | value.Low)); }
        static long Length(Information value) { return checked((long)(((ulong)value.SizeHigh << 32) | value.SizeLow)); }
        static RootIdentity Identity(Information value) { return new RootIdentity(value.Volume, Index(value), Stamp(value.Created)); }
        static bool SameIdentity(Information a, Information b)
        { return a.Volume == b.Volume && Index(a) == Index(b) && Stamp(a.Created) == Stamp(b.Created); }
        static Information Info(IntPtr handle)
        {
            Information value;
            if (!GetFileInformationByHandle(handle, out value)) throw NativeFailure();
            if ((value.Attributes & ReparseAttribute) != 0 || Index(value) == 0) throw Failure();
            return value;
        }
        static string FinalName(IntPtr handle)
        {
            var result = new StringBuilder(32768);
            uint size = GetFinalPathNameByHandleW(handle, result, (uint)result.Capacity, 0);
            if (size == 0 || size >= result.Capacity) throw NativeFailure();
            string value = result.ToString();
            if (!value.StartsWith("\\\\?\\", StringComparison.Ordinal) || value.Length < 8
                || !((value[4] >= 'A' && value[4] <= 'Z') || (value[4] >= 'a' && value[4] <= 'z'))
                || value[5] != ':' || value[6] != '\\') throw Failure();
            return value.TrimEnd('\\');
        }
        static string Normalize(string value)
        {
            if (String.IsNullOrEmpty(value) || value.Length > 32760 || !Regex.IsMatch(value, "^[A-Za-z]:[\\\\/]", RegexOptions.CultureInvariant)
                || value.IndexOf('\0') >= 0 || value.IndexOf('\r') >= 0 || value.IndexOf('\n') >= 0) throw Failure();
            value = value.Replace('/', '\\').TrimEnd('\\');
            if (value.Length <= 3) throw Failure();
            foreach (string part in value.Substring(3).Split('\\')) ValidateSegment(part);
            var result = new StringBuilder(32768);
            uint size = GetFullPathNameW(value, (uint)result.Capacity, result, IntPtr.Zero);
            if (size == 0 || size >= result.Capacity || !String.Equals(value, result.ToString().TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw Failure();
            return value;
        }
        static void ValidateSegment(string value)
        {
            if (String.IsNullOrEmpty(value) || value.Length > 255 || value == "." || value == ".."
                || value.EndsWith(".", StringComparison.Ordinal) || value.EndsWith(" ", StringComparison.Ordinal)
                || value.IndexOfAny(new[] { '<', '>', ':', '"', '\\', '/', '|', '?', '*' }) >= 0 || Reserved.IsMatch(value)) throw Failure();
            foreach (char character in value) if (character < 32) throw Failure();
        }
        static string Relative(string value, bool directory)
        {
            if (directory && value == ".") return value;
            if (String.IsNullOrEmpty(value) || value.Length > 32760 || value.Split('/').Length > 65) throw Failure();
            foreach (string segment in value.Split('/')) ValidateSegment(segment);
            return value;
        }
        static bool ManagedDirectory(string value)
        { return value == "." || value == "resources" || value == Runtime || value.StartsWith(Runtime + "/", StringComparison.Ordinal); }
        static Entry OpenEntry(string full, string relative, bool directory, bool deletable)
        {
            uint access = deletable ? GenericRead | DeleteAccess : ReadAttributes;
            IntPtr handle = CreateFileW(full, access, deletable ? ShareRead : ShareRead | ShareWrite,
                IntPtr.Zero, OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
            if (!Valid(handle)) throw NativeFailure();
            try
            {
                Information info = Info(handle);
                if (((info.Attributes & DirectoryAttribute) != 0) != directory) throw Failure();
                if (!directory && (info.Links != 1 || (info.Attributes & ReadOnlyAttribute) != 0)) throw Failure();
                return new Entry(relative, full, directory, handle, info);
            }
            catch { CloseHandle(handle); throw; }
        }
        static void ProtectRoot(string canonical)
        {
            string candidate = canonical.Substring(4).TrimEnd('\\');
            foreach (Environment.SpecialFolder folder in new[] { Environment.SpecialFolder.UserProfile,
                Environment.SpecialFolder.ApplicationData, Environment.SpecialFolder.LocalApplicationData,
                Environment.SpecialFolder.CommonApplicationData, Environment.SpecialFolder.Windows,
                Environment.SpecialFolder.System, Environment.SpecialFolder.ProgramFiles,
                Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.DesktopDirectory,
                Environment.SpecialFolder.MyDocuments })
            {
                string protectedPath = Environment.GetFolderPath(folder).TrimEnd('\\');
                if (protectedPath.Length > 0 && (String.Equals(candidate, protectedPath, StringComparison.OrdinalIgnoreCase)
                    || protectedPath.StartsWith(candidate + "\\", StringComparison.OrdinalIgnoreCase))) throw Failure();
            }
        }
        void OpenRoot(string directory, bool deletable)
        {
            string plain = Normalize(directory);
            string parent = plain.Substring(0, 3);
            string[] segments = plain.Substring(3).Split('\\');
            ancestors.Add(OpenEntry("\\\\?\\" + parent, "", true, false));
            for (int i = 0; i < segments.Length - 1; i++)
            {
                parent = parent.TrimEnd('\\') + "\\" + segments[i];
                ancestors.Add(OpenEntry("\\\\?\\" + parent, "", true, false));
            }
            var entry = OpenEntry("\\\\?\\" + plain, ".", true, deletable);
            entries.Add(entry);
            root = FinalName(entry.Handle);
            ProtectRoot(root);
        }
        public static RootIdentity Identify(string directory)
        { return InspectRoot(directory).Identity; }
        public static RootBinding InspectRoot(string directory)
        {
            using (var scope = new VerifiedResidue())
            {
                scope.OpenRoot(directory, false);
                return new RootBinding(scope.TargetPath, Identity(scope.entries[0].Original));
            }
        }
        public static void VerifyOriginalFile(RootBinding binding, CatalogFile expected)
        {
            if (binding == null || expected == null) throw Failure();
            Relative(expected.RelativePath, false);
            if (expected.Size < 0 || expected.Size > MaximumBytes || expected.Sha256 == null || !Digest.IsMatch(expected.Sha256)) throw Failure();
            using (var scope = new VerifiedResidue())
            {
                scope.OpenRoot(binding.CanonicalPath, false);
                Information rootInfo = scope.entries[0].Original;
                if (rootInfo.Volume != binding.Identity.VolumeSerialNumber || Index(rootInfo) != binding.Identity.FileIndex
                    || Stamp(rootInfo.Created) != binding.Identity.CreationTime) throw Failure();
                string[] parts = expected.RelativePath.Split('/');
                string full = scope.root;
                for (int index = 0; index < parts.Length - 1; index++)
                {
                    full += "\\" + parts[index];
                    scope.ancestors.Add(OpenEntry(full, "", true, false));
                }
                using (var entry = OpenEntry(full + "\\" + parts[parts.Length - 1], expected.RelativePath, false, true))
                {
                    if (Length(entry.Original) != expected.Size) throw Failure();
                    CheckStreams(entry);
                    using (var wrapper = new SafeFileHandle(entry.Handle, false))
                    using (var stream = new FileStream(wrapper, FileAccess.Read, 65536, false))
                    using (var sha = SHA256.Create())
                    {
                        string actual = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                        if (actual != expected.Sha256) throw Failure();
                    }
                }
            }
        }
        public static VerifiedResidue Open(string directory, RootIdentity expected, IEnumerable<CatalogFile> files, IEnumerable<string> directories)
        {
            var scope = new VerifiedResidue();
            try
            {
                if (expected == null || files == null || directories == null) throw Failure();
                long catalogBytes = 0;
                foreach (CatalogFile file in files)
                {
                    if (file == null || scope.catalog.Count >= 100000) throw Failure();
                    Relative(file.RelativePath, false);
                    if (file.Size < 0 || file.Size > MaximumBytes || file.Sha256 == null || !Digest.IsMatch(file.Sha256)
                        || scope.catalog.ContainsKey(file.RelativePath)) throw Failure();
                    catalogBytes = checked(catalogBytes + file.Size);
                    if (catalogBytes > MaximumBytes) throw Failure();
                    scope.catalog.Add(file.RelativePath, new CatalogFile(file.RelativePath, file.Size, file.Sha256));
                }
                foreach (string name in directories)
                {
                    Relative(name, true);
                    if (scope.catalogDirectories.Count >= 100000 || !scope.catalogDirectories.Add(name)) throw Failure();
                }
                if (!scope.catalogDirectories.Contains(".") || scope.catalog.Count == 0) throw Failure();
                scope.OpenRoot(directory, true);
                Information actual = scope.entries[0].Original;
                if (actual.Volume != expected.VolumeSerialNumber || Index(actual) != expected.FileIndex || Stamp(actual.Created) != expected.CreationTime) throw Failure();
                scope.observedNames.Add(".");
                scope.Walk(scope.entries[0], 0);
                if (scope.FileCount == 0) throw Failure();
                return scope;
            }
            catch (ResidueVerificationException) { scope.Dispose(); throw; }
            catch { scope.Dispose(); throw Failure(); }
        }
        static List<string> Names(string directory)
        {
            var result = new List<string>();
            FindData data;
            IntPtr search = FindFirstFileW(directory + "\\*", out data);
            if (!Valid(search))
            {
                if (Marshal.GetLastWin32Error() == 2) return result;
                throw NativeFailure();
            }
            try
            {
                for (;;)
                {
                    if (data.Name != "." && data.Name != "..")
                    {
                        ValidateSegment(data.Name);
                        if (result.Count >= MaximumResidueEntries) throw Failure();
                        result.Add(data.Name);
                    }
                    if (!FindNextFileW(search, out data))
                    {
                        if (Marshal.GetLastWin32Error() != 18) throw NativeFailure();
                        break;
                    }
                }
            }
            finally { FindClose(search); }
            result.Sort(StringComparer.Ordinal);
            return result;
        }
        static void CheckStreams(Entry entry)
        {
            StreamData data;
            IntPtr search = FindFirstStreamW(entry.Full, 0, out data, 0);
            if (!Valid(search))
            {
                if (entry.Directory && Marshal.GetLastWin32Error() == 38) return;
                throw NativeFailure();
            }
            try
            {
                int count = 0;
                for (;;)
                {
                    if (entry.Directory || data.Name != "::$DATA" || ++count != 1) throw Failure();
                    if (!FindNextStreamW(search, out data))
                    {
                        if (Marshal.GetLastWin32Error() != 38) throw NativeFailure();
                        break;
                    }
                }
            }
            finally { FindClose(search); }
        }
        void Walk(Entry directory, int depth)
        {
            if (depth > 64 || entries.Count > MaximumResidueEntries) throw Failure();
            CheckStreams(directory);
            DirectoryCount++;
            var direct = new HashSet<string>(StringComparer.Ordinal);
            children.Add(directory.Relative, direct);
            foreach (string name in Names(directory.Full))
            {
                string relative = directory.Relative == "." ? name : directory.Relative + "/" + name;
                Relative(relative, false);
                if (!observedNames.Add(relative) || entries.Count >= MaximumResidueEntries) throw Failure();
                direct.Add(name);
                string full = root + "\\" + relative.Replace('/', '\\');
                if (full.Length > 32760) throw Failure();
                Information preliminary;
                IntPtr probe = CreateFileW(full, ReadAttributes, ShareRead | ShareWrite, IntPtr.Zero, OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
                if (!Valid(probe)) throw NativeFailure();
                try { preliminary = Info(probe); }
                finally { CloseHandle(probe); }
                bool isDirectory = (preliminary.Attributes & DirectoryAttribute) != 0;
                if (isDirectory)
                {
                    if (!ManagedDirectory(relative) || !catalogDirectories.Contains(relative)) throw Failure();
                }
                else if (!relative.StartsWith(Runtime + "/", StringComparison.Ordinal) || !catalog.ContainsKey(relative)) throw Failure();
                Entry entry = OpenEntry(full, relative, isDirectory, true);
                entries.Add(entry);
                if (!String.Equals(FinalName(entry.Handle), full, StringComparison.OrdinalIgnoreCase)) throw Failure();
                if (isDirectory) Walk(entry, depth + 1);
                else
                {
                    CatalogFile expected = catalog[relative];
                    if (!String.Equals(expected.RelativePath, relative, StringComparison.Ordinal) || Length(entry.Original) != expected.Size) throw Failure();
                    totalBytes = checked(totalBytes + expected.Size);
                    if (totalBytes > MaximumBytes) throw Failure();
                    CheckStreams(entry);
                    using (var wrapper = new SafeFileHandle(entry.Handle, false))
                    using (var stream = new FileStream(wrapper, FileAccess.Read, 65536, false))
                    using (var sha = SHA256.Create())
                    {
                        string hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                        if (hash != expected.Sha256) throw Failure();
                    }
                    Information after = Info(entry.Handle);
                    if (!SameIdentity(after, entry.Original) || Length(after) != expected.Size
                        || Stamp(after.Written) != Stamp(entry.Original.Written)) throw Failure();
                    FileCount++;
                }
            }
        }
        void Recheck()
        {
            foreach (Entry entry in entries)
            {
                Information now = Info(entry.Handle);
                if (!SameIdentity(now, entry.Original) || now.Attributes != entry.Original.Attributes
                    || !String.Equals(FinalName(entry.Handle), entry.Full, StringComparison.OrdinalIgnoreCase)) throw Failure();
                CheckStreams(entry);
                if (!entry.Directory)
                {
                    if (now.Links != 1 || Length(now) != Length(entry.Original) || Stamp(now.Written) != Stamp(entry.Original.Written)) throw Failure();
                }
                else if (!children[entry.Relative].SetEquals(Names(entry.Full))) throw Failure();
            }
        }
        public bool Remove(Func<bool> confirm)
        {
            if (disposed || consumed || confirm == null) throw Failure();
            consumed = true;
            if (!confirm()) return false;
            Recheck();
            var ordered = new List<Entry>(entries);
            ordered.Sort(delegate(Entry a, Entry b)
            {
                if (a.Directory != b.Directory) return a.Directory ? 1 : -1;
                int depthA = a.Relative == "." ? 0 : a.Relative.Split('/').Length;
                int depthB = b.Relative == "." ? 0 : b.Relative.Split('/').Length;
                return depthB != depthA ? depthB.CompareTo(depthA) : StringComparer.Ordinal.Compare(a.Relative, b.Relative);
            });
            foreach (Entry entry in ordered)
            {
                // Delete the verified object through its still-open handle.
                // No recursive pathname deletion or following a replacement.
                var disposition = new Disposition { DeleteFile = 1 };
                if (!SetFileInformationByHandle(entry.Handle, 4, ref disposition, 4)) throw NativeFailure();
                entry.Dispose();
            }
            return true;
        }
        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            for (int i = entries.Count - 1; i >= 0; i--) entries[i].Dispose();
            for (int i = ancestors.Count - 1; i >= 0; i--) ancestors[i].Dispose();
        }
    }
}
