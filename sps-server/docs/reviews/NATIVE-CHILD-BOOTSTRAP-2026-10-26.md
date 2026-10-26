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
syntax checks and the diff check passed. Full local integration must still be
rerun after the active Core build completes; the handshake hypothesis is not
yet established as the cause of the previous timeout. This is source/loopback
test infrastructure and does not qualify DPAPI, Native LAN or deployment.
