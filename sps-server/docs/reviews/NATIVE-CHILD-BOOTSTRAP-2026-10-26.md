# Native interoperability child bootstrap

The latest local Main/Core integration attempt failed before any signer request:
the isolated Core child did not become ready within 30 seconds. Ordered fixture
database cleanup then also failed with pg_ctl exit code 1, outside the current
allowlisted diagnostic categories. Both failures are preserved as an AggregateError.
A separate real database setup, migration and ordered-cleanup probe passed, so
the cleanup failure is not yet attributed to a specific PostgreSQL condition.

The isolated child now installs its configuration listener before advertising a
fixed configure-ready message. The parent waits for that handshake before sending
the existing configuration, preventing bootstrap configuration from being sent
before the child is ready to receive it. Startup progress exposes only fixed
import/initialization stage names; a timeout reports the last recognized stage.
Duplicate configuration handshakes fail. The 30-second readiness deadline,
actual service readiness, signing checks and natural process-exit requirements
are unchanged. No product configuration or startup protocol changes.

The focused interoperability contract tests passed 3/3, both scripts passed
syntax checks and the diff check passed. After the full Core typecheck/build
completed, the actual Main/Core integration rerun exited 0: fresh Main TLS,
direct-child IPC, real Identity/DB/enrollment and Main signing, lost-response
recovery from persisted Member state, wrong-account denial and natural child,
outer-process and database cleanup. No forced termination counted as success.
The previous timeout's specific cause is still not established: the handshake
and resource load both changed before this rerun. This is source/loopback test
infrastructure using an AES storage substitute; it does not qualify actual
DPAPI, Desktop enrollment UI, physical Native LAN or deployment.
