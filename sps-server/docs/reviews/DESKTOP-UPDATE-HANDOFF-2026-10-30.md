# Desktop updater handoff failure recovery

The pinned `electron-updater` is 6.8.9. Its NSIS `quitAndInstall()` returns void.
Some failure paths emit `error` rather than throwing; some scheduled paths
emit Electron's native `before-quit-for-update` before calling `app.quit()`.
The original Desktop controller only recovered thrown handoff failures.

## Correction

The controller keeps attempt-scoped ownership through runtime drain and updater
handoff. It observes error events before the update service publishes retry
status, restores only its own shutdown flags, and suppresses repeated automatic
prompts. Errors during an awaited drain do not release the singleflight guard
or revive its old installer continuation.

Main supplies the native updater's quit events. The quit coordinator can cancel
one quit specifically identified as belonging to a failed update attempt, before
starting ordinary quit work. It does not cancel unrelated ordinary quits or a
later successful update. A failed asynchronous handoff remains fenced against a
new attempt until its queued native update quit is consumed. Source/isolated
E2E still disables update-service initialization, imports and installers.

## Verification

- The regression failed before the fix: synchronous error events left status
  `error` and shutdown ownership stranded instead of returning to retry.
- Controller/service/quit coordinator and the real pinned NSIS missing-cache
  handoff path passed 23 tests. The latter simulates cached readiness but leaves
  `quitAndInstall()` and its event-only failure path untouched; it executes no
  installer and performs no network or file access.
- A real isolated Electron Core Settings launch and its Quit button passed;
  the spawned Main exited naturally through the existing drain/coordinator.
- Three additional tests use real NSIS provider/checksum classes with a Node
  test transport against a loopback-only feed: exact bytes download, wrong
  SHA-512 rejection, and stale version rejection before payload download. The
  payload is inert text, never an executable installer. Cache and config are
  inside an identity-checked temporary fixture. The Node transport adapter's
  upstream MIT notice is preserved in the test fixtures.
- Full Desktop regression: 1,549 tests, 1,547 passed, 2 environment-dependent
  skips, 0 failed. These counts include the updater and delegated-cleanup changes.

These are not installed-byte E2E, actual NSIS execution, Authenticode signature,
normal-profile migration, previous-Stable update, rollback, or physical-device
qualification. Failures that occur after the application has already exited are
outside this in-process recovery boundary; installer-level recovery must be
qualified separately. A missing cache can require a new update check after
restart; this fixture does not prove that a lost artifact still exists.

References: [electron-builder update documentation](https://www.electron.build/v26/docs/features/auto-update/),
[upstream BaseUpdater](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/BaseUpdater.ts).
