# Owner Vault CI cleanup boundary

Source `ea8608c890598cfea34dfaa15b63fc675f6f4d2d` push run `41034194665`
and PR run `41034204671` failed the new normal Owner Vault step. The hosted
Windows log shows successful export, fresh-profile restore, project/storage
preservation and restored Host restart. The final PowerShell WMI process scan
then exceeded its unchanged 20-second bound with no output under the restricted
same-user token. The outer native runner independently reported natural Job
emptiness, but correctly preserved the child's exit 1: these runs are failures,
not qualified passing transfer evidence. Other jobs passed 17/18.

## Correction

Choose the observation boundary before running the scenario:

- Standalone local mode keeps the command-line process scan. Timeout, failure,
  or remaining matching processes still fail. Its scope is weaker than a
  whole-descendant proof and remains documented that way.
- Delegated CI mode does not run WMI inside the restricted token. Process absence
  is recorded as `null`, not `true`; the child requires closed Main processes,
  expected crash accounting, output EOF, Identity closure and safe temporary
  cleanup, then exits 76. The native parent must independently observe natural
  owned-Job emptiness before translating 76 to success. Forced cleanup, child
  failure or zero-exit spoofing still fails. No timeout was increased and a
  failed WMI query is not caught and ignored.

The same preselected mode applies after the intentional promotion crash. That
fault occurs after Main's owned restore-helper join and before activation;
closed Main/output and retained ownership/data are checked before reopening.
This child does not certify whole-Job emptiness between launches. Full delegated
qualification occurs only after the parent observes its own Job naturally empty.

Five cleanup contract tests and the complete Windows runner contract/probe group
passed locally (24 tests together). The final delegated crash scenario also
completed and its caller observed exact exit 76. It explicitly reported the
process scan was not performed and external Job observation was pending. This is
not a remote hosted CI pass; a new exact-HEAD run remains necessary.

Older Source runs `41031678433`, `41031713155`, `41033503753`, `41033508916`
were superseded and explicitly cancelled to free runner resources. Their
partial job successes are not whole-run completion evidence.
