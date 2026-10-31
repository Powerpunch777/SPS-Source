using System;
using System.Text.RegularExpressions;
using System.Threading;

internal static class HarmlessRunnerFixture
{
    private const string InvalidArguments = "Harmless runner fixture arguments are invalid.";
    private static readonly Regex NoncePattern = new Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        RegexOptions.CultureInvariant);

    public static int Main(string[] args)
    {
        if (args.Length != 3 || args[0] != "--sps-runner-fixture" ||
            (args[1] != "success" && args[1] != "failure" && args[1] != "hold") ||
            !NoncePattern.IsMatch(args[2]))
        {
            Console.Error.WriteLine(InvalidArguments);
            Console.Error.Flush();
            return 64;
        }

        string nonce = args[2];
        Console.Out.WriteLine("{\"fixture\":1,\"nonce\":\"" + nonce + "\",\"phase\":\"started\"}");
        Console.Out.Flush();

        if (args[1] == "hold") Thread.Sleep(30000);

        Console.Out.WriteLine("{\"fixture\":1,\"nonce\":\"" + nonce + "\",\"phase\":\"finished\"}");
        Console.Out.Flush();
        return args[1] == "success" ? 0 : (args[1] == "failure" ? 7 : 9);
    }
}
