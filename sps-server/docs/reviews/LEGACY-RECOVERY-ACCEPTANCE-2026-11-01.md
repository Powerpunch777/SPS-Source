# Explicit Legacy Recovery Acceptance

2026-11-01 KST. A scoped, unsigned hosted Windows acceptance result. This is
not Core completion, a historical automatic-upgrade pass or Stable release.

## Exact Inputs

- Source:`b36107b3ed12f8a51b98c04f1dcfcab7430c6846`
- Core:`b17fb830138b4acde96aa7b5c911f7e8cccfa698`
- SDK:`61a929f6c783f78e5af603682de1543c7e24abc0`
- Desktop0.4.137 installer SHA256:
  `c3eb2eb6e9d36bff9b14a92af33483535937fdb2a05a7da330ef34acb8fd70ce`
- Recovery helper SHA256:
  `05bdff12fc307bbc81b662418e89f1bc93fa263b8ead476d701ec02a52636112`
- Withdrawn0.4.86 input:225049104bytes, SHA256
  `d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56`.
  Its historically dirty provenance and missing signing trust remain explicit;
  pinning bytes does not rehabilitate that withdrawn release.
- [Workflow41272650851, job124756513295](https://github.com/Powerpunch777/SPS-Source/actions/runs/41272650851/job/124756513295):
  terminal `success` at2026-11-01T05:33:47Z (job API is authoritative).

## Observed Sequence

1. Real original installer and same-VM retained-data fixture were prepared.
2. Actual operator upgrade-recovery UI ran without accepting a failed automatic
   upgrade as success.
3. Ordinary uninstall returned0 but left46original files/61directories,
   26804bytes; all46files exceeded259characters. Full standalone uninstall
   therefore remained unqualified.
4. The independent original-content allowlist/root identity check passed before
   GUI confirmation, with `cleanupAuthorized:false`.
5. The actual recovery UI/driver verified initial Cancel, default No and
   declined residue confirmation. The complete remaining program snapshot and
   all9user records/1project record stayed unchanged after decline.
6. A fresh explicit Yes used the real owner-HWND native confirmation and original
   safeguards. The installation disappeared, registration count was0, and the
   retained data again matched. No forced consent or shortened target path.
7. The exact candidate installer reinstalled into the same accepted path. All
  5checked package artifacts matched expected bytes;9user/1project records and
   first-frame checks passed.
8. Both destructive recovery and reinstall returned pending qualification to
   their owned native parent. It observed zero owned processes and natural Job
   cleanup, not forced termination. All required job steps completed successfully.

## Limits And Remaining Requirements

The child results correctly keep historical automatic upgrade, previous-Stable
upgrade, signed installer, normal user-profile startup and physical two-device
qualification false. Data-fixture preservation is not actual app DB migration:
that same Source's separate installed historical-profile gate failed its
unchanged300second deadline. The entire workflow therefore remains failed even
though this mandatory recovery job passed.

This result proves the recovery mechanism for the exact recorded artifact and
helper, not newer Core4917948 or Source2ef/follow-up artifacts. Final installed
migration/recovery and two-PC evidence must still name the final candidate.
The experiment changed only the disposable hosted VM; original local user
installation, profiles, AppData/Vault/projects and Production were untouched.
