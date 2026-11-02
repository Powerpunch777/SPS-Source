# Agent Session Recovery and Durable Submission

> **설계 정렬 2026-11-02:** [단일 기준](DESIGN-BASELINE-2026-11-02.md)과
> [사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)이 제품 목표에 우선한다.
> 범용 세션/요청 복구는 선택형 Core 기술 계약이며 Lead/CTO/Worker·메모리 의미는 Plugin 소유다. 공개 Marketplace/OS 보호 목표는 원문에서 보존하며 이하 과거 실행 범위의 제외 문구는 목표 철회가 아니다. 아래 현행 절은 구현 및 기록된 증거를 요약하고, 뒤의 초기 계획은 역사 기록이다.
> 이후의 과거 정책/계획/시험은 해당 날짜·리비전의 기록이며 충돌 시 목표를 축소하지 않는다.
> 문서 수정만 수행하며 구현·API 변경·장기목표 재개를 뜻하지 않는다.

Date: 2026-11-02. Generic Core/SDK plan, not a Builder workflow or completion claim.

## Boundary

Reuse the current Agent adapter, Workspace execution admission, budgets,
concurrency, cancellation and result ownership. Core owns technical session/run
identity and request recovery. Builder owns Lead3, shared structured memory,
project CTO, independent Dev/QA and GitHub Actions/Self-hosted Runner behavior.
Do not route an Agent request through a different model API, issue or AI server
to conceal an unsupported session contract. Marketplace is a separate architecture
phase, not part of this session increment; its product goal is not retired.
The prior Native LAN implementation pause does not remove independent Core
management or OS-protection targets. Preserve user data and original installs.

## Session Ensure Increment

The explicit development RPC `agents.sessions.ensure` reuses the existing
`agent.sessions.create` capability. Input is the exact company/Agent/plugin-owned
stable task key; the retained internal context option is still optional. Public
SDK uses `ensure(agentId, companyId, { taskKey, expectedSessionId? })` and cannot override invocation
authority. Older Hosts must reject the unknown RPC, never emulate it by calling
create/list.

The service returns only `{ sessionId, created }`. Workspace/plugin/Agent/key
ownership and the current invocation are mandatory. It takes the Agent row lock,
looks across retained adapter variants of the exact caller-owned key, and returns
only an active, compatible session with matching normalized context. Multiple
matches, closed state, changed adapter or conflicting context require explicit
review; no automatic replacement or reopening. A new row and its return decision
share the transaction. Existing unique indexes and tables are reused: no migration.

If the plugin already knows the prior ID, it must send `expectedSessionId` for
strict recovery: a missing or different ID is rejected before creating anything.
The optional UUID is canonicalized; malformed values fail. This is a scoped
identity comparison, not a permanent key tombstone or a session lease. Existing
legacy close/reset may physically delete a row and release its key; without an
expected ID, a later ensure can then create a new row. Retained closed rows are
still rejected. Send must recheck the exact ID at use, since concurrent close can
retire it after lookup. The memory-only SDK harness retains closed rows and must
not be used to prove physical deletion or cross-process behavior.

Legacy create remains create-new, with its current custom-key conflict behavior.
Both creation operations select the current adapter under the same Agent row
lock. This prevents a delayed pre-lock legacy read from inserting an old-adapter
twin after ensure. Retained optional project/workspace/issue context normalization
stays behind the compatibility facade; none becomes a mandatory Core workflow.

Rejection before commit rolls back the new row. If commit succeeded but the
response or invocation was lost, a new authorized ensure with the same key
returns the existing ID. This is session recovery only, not message deduplication,
provider readiness, a long-lived authority lease or actual AI acceptance. In this
initial session-ensure draft, Builder send remained disabled pending the next
increment; the current dispatch state is recorded below.

## Current Implementation: Durable Session Dispatch Admission

The implementation and evidence below are recorded for the exact 2026-11-02
runtime tuple: private Core `3abf1f50b9cf69e23397e9b2cc1a0d1a01a2365d`, public SDK
source pin `0111d291a99c032760a391693aa879bb099b5034`, consuming Desktop Source
`c8c6b46f977afac12299d0c9dd33b02bb257f312`, and Builder
`b874181c86a6f96fa0ae2922739df172905fb860`. The SDK pin is an unreleased source
API, not a published package release. This section records existing evidence; no
tests or app runs were repeated for this document update.

### Core and SDK contract

- Private Core service `services/sps-session-dispatches.ts` persists the
  Workspace/Plugin/requestId dispatch receipt separately from Plugin KV and
  associates it with the session and run. The
  `server/src/services/plugin-host-services.ts` facade supplies the caller-scoped
  Workspace/Plugin authority. The `sps-session-dispatch-context.ts` helper keeps
  keyed requests from losing their identity through legacy coalescing. Request
  lookup and dispatch remain subject to the current invocation/ownership boundary.
- Migration `0178_elite_banshee` adds the receipt storage. A request ID is unique
  for its Workspace and Plugin regardless of session, so changing sessions does
  not create a second admission for that Plugin request ID. Session close/delete
  retains the exact request tombstone; Workspace deletion removes its receipts
  with the Workspace lifecycle.
- The SDK worker exposes `getRequest` and the request-ID send option. The send
  option is optional for compatibility, but durable dispatch requires the
  `getRequest` feature probe and request ID. An older Host without that feature
  must fail before dispatch; it must not silently fall back to legacy send.
- A repeated request ID with the same payload observes the existing receipt/run;
  a conflicting payload is rejected. If admission is uncertain, do not resend
  automatically. This is a technical at-most-once admission fence, not an
  exactly-once guarantee for provider execution or response delivery.
- Builder turn storage and the Core receipt are distinct. A Builder turn records
  its immutable request ID and dispatch state; Core owns the admission receipt.
  The three Lead transcripts remain separate, and no Core Lead/CTO/Worker role,
  shared-memory meaning, or workflow authority is introduced.

### Recorded verification and limits

These are records from [Core progress](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)
and the public Builder's
[`LEAD-DURABLE-CHAT-2026-11-02.md`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/5ab214ab3c7fb32becc4741e381773196c9c0ec9/docs/implementation/LEAD-DURABLE-CHAT-2026-11-02.md),
not new verification in this documentation-only change:

- Core focused session/receipt/context tests: 3 files, 89/89; 30 workspace
  typechecks and internal SDK build passed. Public SDK: 191/191. Builder check:
  87/87, plus SDK validate/test. The Core progress record also reports a source
  Desktop run of 2,236 total / 2,233 passed / 3 Windows 8.3-alias skips / 0
  failed. These counts qualify only their recorded source revisions.
- The final source-app operator used the exact Core/SDK/Builder tuple above.
  It observed UI send through Core receipt/run and the existing CLI/provider to
  a saved assistant answer; repeating the same request ID and text kept the
  actual Agent run count at one. The same turn, run, session binding and answer
  survived Main/Host restart. The final recorded run exited 0 with five owned
  Main exits, ten ended output streams, zero output failures and exact temporary
  data cleanup. This was an explicitly authorized short live operator, not a
  general provider guarantee.
- The public Builder follow-up operator `9fdb553c9d8d296391cd789153c34ae3c4703f57`
  exercised the actual cancellation control against a running managed CLI,
  observed confirmed process termination, and retained the cancelled turn as
  terminal after restart; exactly the two explicitly requested runs remained.
  Its recorded run exited 0 with six Main exits, twelve ended streams, zero
  output failures and exact temporary-data cleanup. This is an application-level
  managed-process observation, not proof of every descendant or OS containment.
- Earlier failed or narrowed attempts remain failures and are not promoted to
  passing evidence. The progress record separately documents a Windows CI
  historical-migration-count failure and its correction; that history is not a
  claim that every Windows packaging/installer qualification passed.
- Still outside this evidence: exactly-once provider execution, automatic resend
  after uncertainty, all descendant/OS protection, packaged/signed/physical
  device acceptance, Stable qualification, shared Lead memory, and full v15
  Builder acceptance. Native LAN implementation remains paused, as does further
  expansion of Core management. Those pauses do not authorize new Core workflow
  roles or cancel broader product goals.

Official Node.js reference checked for this documentation update: the
[Node.js HTTP API](https://nodejs.org/api/http.html) describes request/response
stream behavior; it does not prove the Core receipt or provider guarantees above.

## Historical Plan (2026-11-02 Initial Draft): Durable Submission Planned, Not Implemented

The following section is preserved as the initial plan as it stood before the
implementation and evidence recorded above. Its status label is historical and
does not describe the current source tuple.

1. Introduce an explicit request-keyed operation rather than adding an option to
   old sendMessage that older Hosts could silently ignore. Reuse the send
   capability and reject unsupported Hosts; never fall back to legacy send.
2. Atomically reserve `(Workspace, plugin, session, requestId)` in durable storage
   with a bounded input digest. Identical replay returns the existing admission;
   changed content under the same key fails. Every lookup still verifies current
   authority and exact session ownership.
3. Persist dispatch entry before calling wakeup. A prior entered/uncertain request
   must never call wakeup again merely because a timeout elapsed, the Host
   restarted or a process-local map is empty. No external exactly-once execution
   guarantee follows from a DB receipt.
4. Bind the receipt and run in the actual wakeup/run-creation transaction, before
   scheduling the adapter. A response lost after that commit must recover the
   same run ID without a second wakeup. Distinct request IDs must not silently
   overwrite or merge different prompts.
5. Preserve Workspace epoch locks, Agent/Source authorization, budgets, daily
   limits and concurrency. Existing wakeup idempotencyKey has no DB uniqueness
   and is not sufficient. Reusing an unbound wakeup row as the receipt is unsafe:
   inherited budget/company/Agent cleanup can change its scheduling state.
6. Retained issue-bound sessions need their issue lock and deferred-drain safety.
   The non-issue coalescing branch alone is not complete coverage. Do not bypass
   that lock, rewrite a legacy issue into a neutral request, or claim distinct-run
   support until individual deferred requests/receipts are designed and tested.
7. Get/cancel/output use the same exact owned run. A cancellation request or a
   receipt state is not proof of local/provider/remote process exit. Restore and
   shutdown must retain uncertain effects and may not automatically resubmit them.

The final storage shape and wakeup integration must be verified before adding a
migration. Generate any migration through the normal DB tool, keep old rows
unmodified and document upgrade/rollback/backup/empty-Host restore behavior. Do
not weaken the existing restore review/approval boundary.

## Required Evidence

- Capability denial; missing/foreign/stale invocation; exact plugin and Agent
  ownership; invalid keys and context; active/closed/adapter mismatch behavior.
- Real isolated PostgreSQL concurrent ensure, service reconstruction, rollback,
  committed-response loss and delayed legacy-create/adapter-update races.
- Request-key concurrency and conflicting-content replay; crash before/after
  reservation, dispatch entry, run/receipt commit and returned response.
- Separate request IDs and retained issue/deferred behavior; no duplicate wakeup;
  current permission/budget/Source/epoch checks; no unknown effects replay.
- SDK packed consumers, old-Host fail-closed behavior and truthful test-harness
  limitations. A memory-only fake is not DB/process crash proof.
- Actual isolated app session/send/restart/cancel/results and approved real AI,
  followed by exact installed and physical acceptance as required by the overall
  completion goal. Synthetic provider results cannot substitute for these.

References: PostgreSQL [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
and [INSERT/unique conflicts](https://www.postgresql.org/docs/current/sql-insert.html).
