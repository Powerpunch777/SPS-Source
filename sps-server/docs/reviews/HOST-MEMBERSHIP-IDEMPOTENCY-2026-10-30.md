# Host Membership Recovery Idempotency

Date: 2026-10-30. Development source verification, not Stable qualification.

## Observed Failure

Source `0fe51588b539809395166165b65507e84aefb973`, PR run `41046346885`,
Windows job `124031265717`, failed interrupted-promotion recovery at
`desktop:use-owner-host`. Core returned HTTP 409, `You already belong to this
company`, from the recovery invitation acceptance. The owned Job then emptied
naturally. That was an application recovery failure, not a cleanup failure.

An initial Host membership decision also used `refreshOwnerHostCompanies`.
That UI reader intentionally returns an empty sentinel for a superseded or
stale read. Such an empty result is not authoritative evidence that the signed-in
Identity lacks membership. The observed conflict does not establish which
concurrent caller won or that this is the only possible timing cause.

## Correction And Boundaries

- Initial Host decisions now read the actual Identity session directly, without
  the supersedable UI cache or optional legacy board bearer.
- Local and private-team technical membership recovery share one small helper.
  It checks exact Workspace membership before creating a recovery invitation.
- Invitation creation still needs the local Host bootstrap proof. Acceptance
  and membership verification use the real signed-in Identity, not bootstrap
  authority. Core authorization and workflow roles are unchanged.
- Approved acceptance must be followed by verified access to the exact target.
  On HTTP 409, that same verification is required; a conflict alone never means
  success. Other HTTP failures, pending responses and failed verification remain
  failures. HTTP status is retained by the Identity invite client.
- If another recovery granted the missing access, the result requests the same
  UI refresh as a direct recovery. It does not claim that this caller's invite
  was accepted.
- The actual Main scope fences account/session epoch, Host owner and instance,
  connection generation/profile and private-team context around awaits. Its own
  company selector change is allowed; a replacement account/Host/connection is
  not. The final state persistence uses the same fence.

The helper does not add automatic task retries, create plugin workflow roles,
ignore arbitrary conflicts, change Core/SDK contracts, or touch installed data.
HTTP conflict semantics are described by
[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.10).

## Verification

Focused actual-Main extraction, Identity client and helper tests:

```powershell
node --test test/owner-membership-recovery.test.mjs test/initial-host-membership-recovery.test.mjs test/owner-membership-recovery-contract.test.mjs test/desktop-account-controller.test.mjs test/owner-host-activation-contract.test.mjs test/owner-team-invite-ui.test.mjs test/workspace-read-lifecycle.test.mjs test/host-share-grant-lifetime.test.mjs
```

The focused command passed 88/88. The parent reviewed the delegated helper tests and added failed 409 verification
coverage. Tests cover concurrent acceptance, exact target IDs, 403 propagation,
pending/invalid responses, stale account and Host/connection lifetimes, retained
technical invitation constraints and an initial decision independent of UI reads.

The parent also ran the actual isolated Windows source Desktop:

```powershell
node scripts/smoke-owner-vault-transfer-desktop.mjs --crash-after-promotion
```

The caller independently recorded `source_crash_recovery_exit=0`. The fixture
observed the intentional post-promotion Main exit, original-account receipt and
file, explicit Host reopening, authenticated project/file access and a later
restart. All owned Main/output cleanup and the standalone fixture command-line
scan passed before removing its owned temporary data.

A preceding pending-cleanup invocation completed its scenario but did not have
an external Job observer, so it is not counted as a whole-Job pass. The successful
standalone command likewise is not independent whole-descendant attestation,
installed-byte migration, production Identity, signing or two-device evidence.
Exact committed-HEAD hosted CI must still verify the changed implementation.
