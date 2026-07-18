param(
  [string]$AdapterUtilsPath = (Join-Path $env:USERPROFILE ".sps\adapter-plugins\node_modules\@paperclipai\adapter-utils\dist\server-utils.js"),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$marker = "local-paperclip-utf8-stream-compatibility"

if (-not (Test-Path -LiteralPath $AdapterUtilsPath -PathType Leaf)) {
  return [pscustomobject]@{ status = "not_found"; path = $AdapterUtilsPath; changed = $false }
}

$source = [System.IO.File]::ReadAllText($AdapterUtilsPath, [System.Text.UTF8Encoding]::new($false, $true)).Replace("`r`n", "`n")
if ($source.Contains($marker)) {
  return [pscustomobject]@{ status = "already_applied"; path = $AdapterUtilsPath; changed = $false }
}

$stateAnchor = @'
            let timedOut = false;
            let stdout = "";
            let stderr = "";
            let logChain = Promise.resolve();
'@.TrimEnd().Replace("`r`n", "`n")
$stateReplacement = @'
            let timedOut = false;
            let stdout = "";
            let stderr = "";
            // local-paperclip-utf8-stream-compatibility: preserve multibyte text split across stream chunks.
            const stdoutDecoder = new TextDecoder("utf-8", { fatal: true });
            const stderrDecoder = new TextDecoder("utf-8", { fatal: true });
            let utf8DecodeError = null;
            const decodeUtf8Chunk = (decoder, chunk, streamName) => {
                if (utf8DecodeError)
                    return "";
                try {
                    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
                    return decoder.decode(bytes, { stream: true });
                }
                catch {
                    utf8DecodeError = `Invalid UTF-8 emitted on ${streamName}; SPS refused to save corrupted agent output.`;
                    return "";
                }
            };
            let logChain = Promise.resolve();
'@.TrimEnd().Replace("`r`n", "`n")

$stdoutAnchor = @'
            child.stdout?.on("data", (chunk) => {
                const readable = child.stdout;
                if (!readable)
                    return;
                readable.pause();
                const text = String(chunk);
'@.TrimEnd().Replace("`r`n", "`n")
$stdoutReplacement = @'
            child.stdout?.on("data", (chunk) => {
                const readable = child.stdout;
                if (!readable)
                    return;
                readable.pause();
                const text = decodeUtf8Chunk(stdoutDecoder, chunk, "stdout");
'@.TrimEnd().Replace("`r`n", "`n")

$stderrAnchor = @'
            child.stderr?.on("data", (chunk) => {
                const readable = child.stderr;
                if (!readable)
                    return;
                readable.pause();
                const text = String(chunk);
'@.TrimEnd().Replace("`r`n", "`n")
$stderrReplacement = @'
            child.stderr?.on("data", (chunk) => {
                const readable = child.stderr;
                if (!readable)
                    return;
                readable.pause();
                const text = decodeUtf8Chunk(stderrDecoder, chunk, "stderr");
'@.TrimEnd().Replace("`r`n", "`n")

$closeAnchor = @'
            child.on("close", (code, signal) => {
                if (timeout)
                    clearTimeout(timeout);
                clearTerminalCleanupTimers();
                runningProcesses.delete(runId);
                void logChain.finally(() => {
                    void Promise.resolve()
                        .then(() => target.cleanup?.())
                        .finally(() => {
                        resolve({
'@.TrimEnd().Replace("`r`n", "`n")
$closeReplacement = @'
            child.on("close", (code, signal) => {
                if (timeout)
                    clearTimeout(timeout);
                clearTerminalCleanupTimers();
                runningProcesses.delete(runId);
                if (!utf8DecodeError) {
                    try {
                        const stdoutTail = stdoutDecoder.decode();
                        const stderrTail = stderrDecoder.decode();
                        if (stdoutTail) {
                            stdout = appendWithCap(stdout, stdoutTail);
                            logChain = logChain
                                .then(() => opts.onLog("stdout", stdoutTail))
                                .catch((err) => onLogError(err, runId, "failed to append stdout log tail"));
                        }
                        if (stderrTail) {
                            stderr = appendWithCap(stderr, stderrTail);
                            logChain = logChain
                                .then(() => opts.onLog("stderr", stderrTail))
                                .catch((err) => onLogError(err, runId, "failed to append stderr log tail"));
                        }
                    }
                    catch {
                        utf8DecodeError = "Invalid UTF-8 emitted at process close; SPS refused to save corrupted agent output.";
                    }
                }
                void logChain.finally(() => {
                    void Promise.resolve()
                        .then(() => target.cleanup?.())
                        .finally(() => {
                        if (utf8DecodeError) {
                            reject(new Error(utf8DecodeError));
                            return;
                        }
                        resolve({
'@.TrimEnd().Replace("`r`n", "`n")

foreach ($pair in @(
  @($stateAnchor, $stateReplacement),
  @($stdoutAnchor, $stdoutReplacement),
  @($stderrAnchor, $stderrReplacement),
  @($closeAnchor, $closeReplacement)
)) {
  if (-not $source.Contains($pair[0])) {
    return [pscustomobject]@{ status = "not_applicable"; path = $AdapterUtilsPath; changed = $false; reason = "expected upstream anchor was not found" }
  }
  $source = $source.Replace($pair[0], $pair[1])
}

if ($DryRun) {
  return [pscustomobject]@{ status = "would_apply"; path = $AdapterUtilsPath; changed = $true }
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
[System.IO.File]::WriteAllText($AdapterUtilsPath, $source, $utf8NoBom)
return [pscustomobject]@{ status = "applied"; path = $AdapterUtilsPath; changed = $true }
