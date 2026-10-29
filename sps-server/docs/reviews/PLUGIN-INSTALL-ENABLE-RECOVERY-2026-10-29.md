# Explicit retry after interrupted plugin installation — 2026-10-29

An install can commit its registry row and package path, then stop before
`lifecycle.load`. The row remains `installed`; startup deliberately only loads
`ready` packages. The existing plugin manager displayed Enable for `installed`,
but the server accepted only `disabled` or `error`. Repeating install also
conflicted with the existing row, leaving the normal UI recovery action broken.

Core enable now accepts `installed` through the same explicit Host action,
Workspace coordination, pending-operation guard and normal loader validation.
It does not automatically start all installed packages, change SDK/API payloads
or bypass `upgrade_pending` review. No package is replaced by this correction.

Selected lifecycle tests passed8/8: installed/disabled/error activation;
ready/uninstalled/update-review rejection; pending package denial before status
or activation changes; and unconfirmed Workspace cleanup blocking execution.
No new full local suite was run. The previous server typecheck passed for the
durable-upgrade increment; this correction changes a status condition/docs, not
its types. Current build/CI and packaged qualification remain required.

Code inspection also corrected an earlier gap description: the approval-pending
upgrade branch stops the runtime and retains the old pointer/manifest. It never
commits its staged candidate. Existing safety tests cover this behavior; this
is not a missing package-replacement journal. Preparations interrupted by a crash
may retain unreferenced UUID staging trees; automatic retirement remains absent.

Installed-app launch, process closure, data-preserving installer/update/restore
and physical Host/Member/Runner evidence are still required before Core release.
Stop before new solution-plugin or Builder development.
