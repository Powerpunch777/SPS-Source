# Legacy Recovery UI Driver Follow-Up

Status as of 2026-10-31. This records a test-only Windows UI-driver correction
and the current hosted evidence. It does not qualify complete legacy recovery,
enable automatic cleanup, or change production recovery behavior.

## Source and UI-driver change

Before this test-driver patch, the local source HEAD was `021ad5e`; the remote
source was `d8a6c69`. The successful
Windows build used the actual unsigned-installer merge `a689e4bc44637212ceb1004ec9920c75f90a89e6`,
whose tree `2928a5cff57d17c42b54b6147c13985ff9e9318a` matches the `d8a6c69` tree.
Its installer SHA256 is
`9e2bfed1892d7f4903fd21dbd00a44e5539f3ca07fed1427ed2c40785995fd8f`.

The local initial-form test exposed that WinForms' owner-drawn Checkbox did not
provide a usable state through `BM_GETCHECK`; the driver consequently failed at
its initial-backup check. The driver now reads the real control's accessibility
state with UI Automation `TogglePattern`, checks that the element belongs to the
expected process, and accepts only `On` or `Off`. It does not set the state
through UI Automation. User actions remain `PostMessage(BM_CLICK)`. This matches
the distinction between the documented button-message state interface and the
WinForms owner-drawn control implementation; it is a test-driver correction,
not a product change.

The actual Form component fixture then completed its initial workflow in 718ms:
all check/uncheck interlocks, disabled/enabled state, and Cancel were exercised.
This is local component evidence only. It did not register or install a
historical product, invoke cleanup, or establish hosted recovery.

The test-only stderr trace is limited to an ordered allowlist of fixed phase
labels, with a fixed failure label. The parser rejects arbitrary text and bounds
each line; it does not record paths, account names, window titles, or exception
details. The parent's assertions still require the full ordered phase trace,
`READY`/`DECLINED`/`PASSED` protocol, clean child exit, and unchanged helper
identity. Trace diagnostics do not relax any recovery assertion.

References: [BM_GETCHECK](https://learn.microsoft.com/en-us/windows/win32/controls/bm-getcheck),
[UI Automation Toggle control pattern](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/implementing-the-ui-automation-toggle-control-pattern),
and [WinForms ButtonBase source](https://raw.githubusercontent.com/dotnet/winforms/main/src/System.Windows.Forms/System/Windows/Forms/Controls/Buttons/ButtonBase.cs).
The latter shows owner-drawn defaults and the `BM_CLICK` path reaching `OnClick`.

## Hosted evidence

Verify run `41176116088`, Windows job `124463917330`, completed **SUCCESS** for
the source/build stated above. This identifies the actual unsigned installer
artifact and its digest; it does not by itself mean the legacy recovery job
passed.

Legacy recovery job `124474167470` did **not** complete the recovery flow. The
original historical install succeeded in 7m46s. The operator's
automatic-upgrade-failure and preservation stages succeeded. The explicit
residue GUI stage failed, so ordinary uninstall did not start. One helper
remained when the outer Job performed forced cleanup; its report was
`accepted:false`. Reinstall was skipped. Therefore this run proves neither
residue cleanup nor ordinary uninstall, same-candidate reinstall, or complete
legacy recovery. Forced cleanup rejection is not natural process closure.

Push run `41176105464` also failed: after Workspace restore restart and
`workspace-load-start`, its Main-window wait failed. The cause is not yet
known. Do not infer that it has the same cause as the earlier checkbox-state
failure or as the explicit residue GUI failure above.

## Validation and limits

The focused local selection is **6/6**. Full `npm run test:ci` exited 0:
serial stage 2/2 and remaining stage 1810 total/1807 pass/three unavailable
8.3-alias skips; aggregate 1812 total/1809 pass/three skips, zero failures.
The existing native 8/18-minute bounds and 45-second probe / 15-second UI
bounds are unchanged; this work does not extend any timeout. No production
Main/Core code, installed app, user profile, or production data was modified.

Next required evidence is hosted validation at the exact new HEAD. The Windows UI stage must complete
with the helper closing naturally, then the hosted recovery must show the
ordinary uninstall, residue outcome, same-candidate reinstall, artifact/hash
checks, retained-data checks, and required UI/process assertions. Until those
gates pass, report the hosted GUI/recovery as failed or pending, not as a
successful full cleanup. This does not qualify signed installers,
previous-Stable/default-profile upgrades, data migration, physical devices, or
production recovery.
