# Desktop startup and optional certificate dependencies

## Problem and resulting behavior

Desktop's first sign-in window eagerly loaded the optional certificate tooling
through the Main module graph. On the local Windows machine, the unchanged
first-renderer smoke exceeded its original ten-second condition. An isolated
Electron-only control rendered a small page, while an instrumented SPS import
spent the observation window loading certificate/ASN.1 dependencies before Main
completed. The module-hook measurement adds profiling overhead and is not an
unmodified production benchmark.

Certificate helpers now load the existing package entries at the first actual
certificate operation. `createRequire(import.meta.url)` resolves the same
CommonJS entry/cache as the previous imports; reflection is initialized before
X.509. Bounded DER parsing loads ASN.1 separately. Synchronous validators remain
synchronous. Existing input bounds, purpose/key/signature/issuer/pin checks,
private-key zeroing, error mapping and SDK interfaces remain in place. A library
load failure cannot skip validation or accept credentials.

This is a Desktop startup correction. It adds no Native networking, enrollment,
Builder or plugin feature and does not change dependencies or their notices.

## Isolated smoke cleanup

The old smoke ignored `taskkill` errors and could remove its profile without
confirmed descendant termination. A cleanup `EBUSY` could then mask the original
renderer failure. The smoke now reuses the existing Windows Job supervisor:
suspended creation and Job assignment precede Electron execution, and profile
cleanup requires an authenticated empty-Job result plus the matching helper
process closure. Unconfirmed termination preserves the profile; concurrent functional/cleanup
errors are retained together. The resolved cleanup target must be a direct,
dedicated child of the OS temporary directory.

The first-renderer loop, fetch limits and login/body assertions are unchanged;
supervisor startup is included in that existing observation window. Success is
printed after cleanup. This check deliberately cancels its isolated Job and is
not evidence of graceful product shutdown, update safety or installed-app
qualification. Existing stricter supervisor termination guards are retained.

## Validation

- Fresh-process regression proves importing Host/Member/credential helpers does
  not load the PKI graph, then exercises real signed identity creation,
  synchronous validation and wrong-Host rejection.
- Selected Host certificate profile, Member request/issuance and credential
  suites plus the new regression: 29/29 passed, zero skips.
- Selected encrypted Host leaf-renewal/history/base-file preservation regression:
  1/1 passed, zero skips.
- The actual corrected source first-renderer smoke, observed by an external
  process/protocol event logger without altering results or deadlines, passed
  all existing assertions and cleanup. It recorded `activeProcesses: 0`, helper
  exit/close with code 125 and no signal. Its CLI exited 0.
- An earlier attempt of the stronger smoke failed the existing five-second
  helper-close guard. The failure remained visible and its profile was
  preserved. A later successful observation does not establish that the
  intermittent closure failure is resolved in every environment.

Current packaged-runtime and Windows CI evidence for the preceding f339abe
candidate remains historical evidence. The changed Desktop requires its own
current CI and packaged qualification; no Core rebuild is implied by this
Desktop-only fix. Signed installation/update/rollback and physical Runner
qualification remain separate requirements.

## References

The work used the existing dependencies and upstream API patterns, with no
copied upstream source or added library:

- [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron ESM lifecycle caveats](https://www.electronjs.org/docs/latest/tutorial/esm)
- [Electron v43.8.3 default loader](https://github.com/electron/electron/blob/v43.8.3/default_app/main.ts)
- [Electron MIT license](https://github.com/electron/electron/blob/v43.8.3/LICENSE)
- [Node child process lifecycle](https://nodejs.org/api/child_process.html)
