# Packaged Owner Host verification gates — 2026-10-28

Desktop0.4.137 is a development candidate; Native remains off by default and
Tailscale remains the supported release transport. Core is pinned to
df7436dc87484370e9c9b81b91882a2626452f3c and SDK remains
607b48a4edaed1db7132a01719431ffce5852964. This increment changes packaging checks,
acceptance harnesses and a Core test barrier, not product authorization or APIs.

## Close the source-versus-package gap

The existing execution-control acceptance rejected packaged binaries even though
its actual UI/API/restart sequence was usable by both. It now accepts exactly
one source Electron or packaged Desktop, rejects ambiguous/mixed acceptance
modes, and reports the selected mode. It keeps actual windows_job ownership,
zero Agents, pause/stop, stale revision409, independent Workspace, stopped epoch/
revision after Main/Core restart, resume, orderly Main exit and output/data
cleanup assertions. The existing safe startup-state observation also covers
packaged execution-control.

Windows CI retains the source acceptance. After the unpacked build it now runs
the packaged runtime verifier, then packaged execution-control through the
existing reduced-token runner after update-provider fixture configuration.
No signing/publication/install step is added.

The verifier uses packaged helper/gate and bundled Node. It starts a real file
Worker in an owned temporary fixture and requires its response to show no private
Host Job environment names or inherited gate preload. It still verifies IPC,
the independent stop4 token, descendants/active0, helper and actual child close.
Confirmed disposal permits fixture removal; missing confirmation preserves the
fixture, including a retained preparation handle.

Preload checks inspect actual --import/--import= arguments rather than searching
all execArgv strings: a Node -e probe's source itself mentions the gate filename,
so a broad substring test would reject its own source.

## Dependency preparation

The first local prepare on clean Sourcec155d265/Core26a2d106 completed Core and UI
builds but failed at bundled plugin build because local esbuild was absent.
That attempt is failed, not package qualification. Its log is
packaged-host-prepare-c155d265-2026-10-27.log; no packaged app was produced.

Pinned local dependencies for discovery and Room were installed with npm ci.
The preparer now resolves bundled packages' declared build dependencies before
expensive Core/UI compilation and gives the package's npm ci action on failure.
It does not skip existing bundled checks.

The completed UI output can be reused only through the existing
PAPERCLIP_RELEASE_REUSE_UI_DIST option while UI sources remain unchanged. The
Core follow-up changes only its test and lifecycle contract wording; it does not
change UI or production runtime code. A successful package still needs a clean
baseline, exact pins, actual artifact checks and Windows acceptance.

## Core recovery acceptance race

Parentc155d265 CI40521667784 serialized4 failed at
heartbeat-process-recovery.test.ts:2667 (missing issue.updated audit).
resumeQueuedRuns dispatches executeRun without joining it. DB terminal-run/idle
observations and committed report state precede the two separately awaited audit
inserts, so those conditions are not a finalization barrier.

The named test now waits within its existing5s observation budget for both audit
actions before checking the final log and recovery wakeups. All existing
assertions remain. A permanently missing audit still fails. The comment/status
transaction remains the atomic operation; audit writes are not newly claimed
transactional.

The local selected run failed in beforeAll at the existing20s hook deadline,
before the selected assertions ran. It does not validate this correction and
cleanup success was not established. No hook/assertion deadline was increased;
Linux CI verification is pending. The old unknown-owner PG17364 was not killed.

Core's stop-only channel documentation also now distinguishes immediate Native
authority disposal from natural IPC EOF for a Windows job-owned Core.

## Verification boundary

- Existing Workspace harness contract file4/4 passed after the harness change.
- Selected Owner Host build/archive contracts2/2 passed.
- Changed scripts parsed and diff checks passed.
- One earlier broader runner selection returned21/22; its only failure was a
  subsequently removed new static regex test. It is not a final aggregate pass.
- Actual new local packaged verifier and packaged execution-control are still
  required; no result is inferred from these contracts.
- Parentc155d265 hosted Windows job122250127772 had passed its source execution
  control and packaged Workspace steps and was running preview at last read.
  It did not yet include these newly added gates.
- Parent Core serialized4 failure, unwaived Zod High1243066 and existing UI token
  debt remain separate until exact-head evidence supersedes them.

Normal development uses focused checks; no manual full local suite/CI rerun.
Required package build and bundled checks do not establish signed installation,
updates/rollback/restore, physical LAN/SMB or actual provider/Identity readiness.
Worker/CLI filesystem/Vault/network isolation remains incomplete. No Marketplace
policy, Builder structure, security waiver, major migration, OS trust/firewall,
installed app, customer data, merge, release or npm publication change.

OpenAI Codex coordinator and GPT-6 Luna high agents, as requested.
