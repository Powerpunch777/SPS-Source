# Agent Session Recovery and Durable Submission

> **설계 정렬 2026-11-02:** [단일 기준](DESIGN-BASELINE-2026-11-02.md)과
> [사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)이 제품 목표에 우선한다.
> 범용 세션/요청 복구는 선택형 Core 기술 계약이며 Lead/CTO/Worker·메모리 의미는 Plugin 소유다. 공개 Marketplace/OS 보호 목표는 원문에서 보존하며 이하 과거 실행 범위의 제외 문구는 목표 철회가 아니다. 실제 미구현 durable submit과 AI 전송 상태를 유지한다.
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
provider readiness, a long-lived authority lease or actual AI acceptance. Builder
send remains disabled while the next section is unfinished.

## Durable Submission: Planned, Not Implemented

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
