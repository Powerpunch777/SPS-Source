# Installed Host Readiness And Legacy Safety Rejection

2026-11-01 KST. Development diagnosis only. Both required Windows gates remain
failed; this record is not Core completion, a startup performance fix, successful
legacy cleanup or Stable qualification.

## Authoritative Runs

Source branch `71cddad300b48c75410725e63b39e0fc988095d8`, Core
`b17fb830138b4acde96aa7b5c911f7e8cccfa698`, public SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`, Desktop0.4.137.

- [Push41215783644](https://github.com/Powerpunch777/SPS-Source/actions/runs/41215783644):
  all17 non-Windows jobs, all9 Core Linux shards and full Core typecheck/build
  succeeded. Windows124579889212 failed installed historical-profile acceptance.
- [PR41215788311](https://github.com/Powerpunch777/SPS-Source/actions/runs/41215788311):
  all17 non-Windows jobs succeeded. Windows124579903228 failed the same gate.
  The PR builds its merge checkout; the branch SHA above is not a claim that
  the installed baseline's Source SHA equals that branch SHA.
- Mandatory legacy jobs124593395320(push) and124593250438(PR) both failed.
  Their actual failed outcomes are not replaced by earlier candidate passes.

## Installed Historical Profile

The actual installed PR candidate reported migration-Main ready at12555ms,
Host ready at285548ms, DB verified at285611ms, authenticated Workspace ready
at286345ms, data verified at287380ms, Main normally closed at289168ms, and
restart-Main ready at289791ms. The unchanged300000ms parent bound expired
before complete restart/cleanup acceptance. The push only reached
migration-Main ready at13135ms before the same bound. Forced cleanup was
rejected on both, and neither complete installed migration qualifies.

This localizes the PR's long interval to Host preparation/readiness, not to
its successful migration assertions. It does not yet establish which runtime,
process-admission, Postgres, Core or disk operation consumed that interval.

An independent local measurement read the previously downloaded e35 runtime
archive without running its app or changing installed data. Its28771 files
expanded to575905190 bytes. Verified package/preflight took about1.36s;
extraction34.69s; total cold materialization37.94s, warm verification0.19s.
All31871 metadata lstat calls totaled1.51s. Only the newly created, identity-
checked temporary measurement tree was removed. This is a different machine
and older artifact, not evidence for the failing CI interval or a fix.

The follow-up emits fixed runtime preparation stages and owned-Host lifecycle
labels only under existing E2E diagnostics. The historical child forwards them
as bounded allowlisted progress while it is still running, so its300-second
parent timeout cannot erase the last observed stage. No raw app output, path,
account, token, user data or test privilege is added to release evidence.

## Original0.4.86 Recovery

Both actual legacy runs preserved the original29314-file installed tree and
all10 retained records after the expected failed automatic replacement. The
real initial Form/checkbox interlocks/Cancel passed. Ordinary Windows uninstall
returned0 but left46 files/61 directories, all46 file paths exceeding259chars.
The new independent content-plan check succeeded:26804 remaining file bytes,
original root identity, no unknown content; `cleanupAuthorized:false`.

At `decline-confirm`, both real helpers then displayed their exact safety-
rejection status in about0.3s. This is not a15-second dialog timeout, inactive
BM_CLICK diagnosis, or failed pre-GUI content plan. The previous catch merged
process, registration and native residue failures into the same status, so the
precise condition is still unknown. Forced helper cleanup was rejected and
reinstall was skipped. No deletion or complete recovery is qualified.

The follow-up preserves all existing checks, order, default-No consent, handles
and bounds. It wraps cleanup errors with a fixed stage and bounded Win32 residue
error code. The Form retains its exact original safety text and shows a separate
fixed diagnostic label. The owned test driver reads only an allowlisted label;
the protocol parser rejects unknown stages, extra fields and out-of-range codes.
The stage summary is also corrected after the successful content-plan check.

## Local Validation And Next Required Evidence

- Runtime/Host focused tests47/47; historical progress/entry tests13/13.
- Compiled actual Form/driver/session and protocol/runtime notice tests12/12.
- Full `npm run test:ci`: serial2/2 plus1873total/1870pass/3 unavailable8.3-alias
  skips, aggregate1875total/1872pass/3skip/0fail, exit0.
- Notice callback failures do not bypass archive/hash/preflight checks, promote
  failed extraction, or change cache/rollback acceptance. Actual small archives
  and native compiler/Form tests are used rather than only text inspection.

Next: run the exact revised candidate through unchanged Windows gates, inspect
the actual runtime/safety stage, fix the confirmed cause, then rerun complete
installed migration and consent-based legacy cleanup/reinstall. Approved
independent-PC Runner testing still awaits the required CI result. Existing
apps/profiles/AppData/Vault/projects, notebook Serve and Production are unchanged.

References: [node-tar implementation](https://github.com/isaacs/node-tar/blob/main/src/unpack.ts),
[Windows file identity](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle),
[BM_CLICK contract](https://learn.microsoft.com/en-us/windows/win32/controls/bm-click).
