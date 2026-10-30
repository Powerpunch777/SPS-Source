# Owner restore process ownership and quit coordination

The restore helper previously used a raw child process, outside Desktop's
owned runtime drain. A closed CLI alone could not prove its PostgreSQL
descendants had closed, and quitting could leave an old restore continuation
able to promote staging after a failed quit reset the closing flag.

The new restore runner reuses the existing Windows Job supervisor, exposed
through the existing internal Desktop Node barrel. Suspended child creation,
Job assignment, authenticated zero-active-process terminal frames and matching
helper closure are supplied by that supervisor. The runner retains the exact
owner until those checks succeed. Nonzero restore exits stay failures;
startup/closure uncertainty blocks replacement and Host activation. Cleanup
retry joins that same owner and never resolves ownership from a PID snapshot or
a cancellation request alone. Restore stderr remains bounded to8000 characters.

Main now joins restore cleanup in its existing Desktop/update quit drain.
Quitting or an unconfirmed earlier restore denies new restore/Host activation.
Every cleanup invalidates a monotonically increasing generation, even with no
active helper. A captured restore generation is checked before promotion and
restored-Host activation, so resetting a failed quit's flag does not revive
old asynchronous work. Existing account/fresh-vault/restore-permit checks,
error preservation and retained staging remain in place.

## Validation

- Selected runner, actual CLI fault, Main VM flow, drain and quit-coordinator
  tests:34/34passed, zero skips. This includes dual failures, uncertain startup,
  cleanup retry, concurrent cancel/success, retained ownership, failed-quit
  invalidation and cancellation during restored Host startup.
- Two actual Windows process tests passed, zero skips, with the real restore
  CLI and real supervisor. Inert DB modules start a real long-lived Node
  descendant: helper success must close its Job, and an explicit cancellation
  must close the blocked helper and descendant before ownership is released.
  No real database or user Vault is touched in these process tests.
- The first success fixture incorrectly retained its descendant's Node handle
  and timed out at the unchanged45second limit. Its exact owned helper was
  stopped through kill-on-close fallback and its fixture preserved. The fixture
  now unreferences its inert descendant; teardown attempts owned cleanup and
  preserves uncertain ownership. This was a corrected test setup, not a timeout
  increase or passing result substituted for the failed run.
- Existing preload/Main contract selection also passed. The real two-case
  PostgreSQL backup/restore evidence from the preceding f10a502 work remains
  independent and does not turn these inert-module process tests into a real
  Owner Vault export/import end-to-end.

Exact-current CI and installed-data qualification are still required. Final
packaging must refresh Desktop Node's copied sources and include the updated
restore helper; the old107installer/archive is not current evidence. Retained
staging across Desktop crashes still needs durable recovery inventory and a
complete export/restore workflow. This change adds no new Native, Builder,
Marketplace or solution-plugin feature and makes no OS sandbox claim.
