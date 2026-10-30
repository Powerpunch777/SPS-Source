using System;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

internal static class InstallerRegistryReader
{
    private const int MaxJsonCharacters = 1024 * 1024;
    private static readonly Regex SpsDisplayName = new Regex(
        @"^SPS(?:\s|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private sealed class RegistryRoot
    {
        public readonly RegistryHive Hive;
        public readonly string Path;
        public readonly bool PerUser;

        public RegistryRoot(RegistryHive hive, string path, bool perUser)
        {
            Hive = hive;
            Path = path;
            PerUser = perUser;
        }
    }

    public static string ReadJson()
    {
        RegistryRoot[] roots = new RegistryRoot[]
        {
            new RegistryRoot(RegistryHive.CurrentUser,
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall", true),
            new RegistryRoot(RegistryHive.LocalMachine,
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall", false),
            new RegistryRoot(RegistryHive.LocalMachine,
                @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", false)
        };

        StringBuilder json = new StringBuilder("[");
        bool hasItem = false;

        foreach (RegistryRoot spec in roots)
        {
            using (RegistryKey baseKey = RegistryKey.OpenBaseKey(spec.Hive, RegistryView.Default))
            {
                using (RegistryKey root = baseKey.OpenSubKey(spec.Path, false))
                {
                    // A missing uninstall root means there are no registrations in that hive.
                    if (root == null) continue;

                    string[] subKeyNames = root.GetSubKeyNames();
                    foreach (string subKeyName in subKeyNames)
                    {
                        using (RegistryKey item = root.OpenSubKey(subKeyName, false))
                        {
                            // A key disappearing during enumeration is an incomplete query.
                            if (item == null)
                                throw new InvalidOperationException("An uninstall registration changed during inspection.");

                            object rawName = item.GetValue("DisplayName", null);
                            string name = rawName as string;
                            if (name == null || !SpsDisplayName.IsMatch(name)) continue;

                            object rawVersion = item.GetValue("DisplayVersion", null);
                            object rawUninstall = item.GetValue("UninstallString", null);
                            string version = rawVersion as string;
                            string uninstall = rawUninstall as string;
                            if ((rawVersion != null && version == null)
                                || (rawUninstall != null && uninstall == null))
                                throw new InvalidOperationException("An uninstall registration has an unsupported value type.");

                            if (hasItem) json.Append(',');
                            json.Append("{\"name\":");
                            AppendJsonString(json, name);
                            json.Append(",\"version\":");
                            AppendJsonStringOrNull(json, version);
                            json.Append(",\"uninstall\":");
                            AppendJsonStringOrNull(json, uninstall);
                            json.Append(",\"perUser\":");
                            json.Append(spec.PerUser ? "true" : "false");
                            json.Append('}');
                            hasItem = true;

                            if (json.Length > MaxJsonCharacters)
                                throw new InvalidOperationException("Installer registration output exceeded its fixed limit.");
                        }
                    }
                }
            }
        }

        json.Append(']');
        if (json.Length > MaxJsonCharacters)
            throw new InvalidOperationException("Installer registration output exceeded its fixed limit.");
        return json.ToString();
    }

    private static void AppendJsonStringOrNull(StringBuilder output, string value)
    {
        if (value == null)
        {
            output.Append("null");
            return;
        }
        AppendJsonString(output, value);
    }

    private static void AppendJsonString(StringBuilder output, string value)
    {
        output.Append('"');
        for (int index = 0; index < value.Length; index++)
        {
            char character = value[index];
            switch (character)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\b': output.Append("\\b"); break;
                case '\f': output.Append("\\f"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (character < 0x20 || Char.IsSurrogate(character))
                    {
                        output.Append("\\u");
                        output.Append(((int)character).ToString("x4"));
                    }
                    else
                    {
                        output.Append(character);
                    }
                    break;
            }
            if (output.Length > MaxJsonCharacters)
                throw new InvalidOperationException("Installer registration output exceeded its fixed limit.");
        }
        output.Append('"');
    }
}
