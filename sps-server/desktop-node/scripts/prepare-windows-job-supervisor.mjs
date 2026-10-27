// Only build-time tooling invokes the compiler; installed applications use the
// bundled helper and fail closed when it is unavailable.
if (process.platform === "win32") await import("./build-windows-job-supervisor.mjs");
