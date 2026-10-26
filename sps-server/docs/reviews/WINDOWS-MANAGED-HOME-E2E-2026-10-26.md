# Windows managed Agent home E2E containment

Run `40298947605` passed the Core Linux build and all Linux test shards, but
the Desktop Host lifecycle harness stopped at its managed Codex home check.
The log did not include the paths, so the underlying path mismatch is not yet
confirmed. A separate Core compatibility job still fails the Zod security audit.

The harness now compares filesystem targets instead of raw path spellings.
It canonicalizes the isolated userData directory and the existing ancestor of
the managed home, allowing only genuinely absent leaf directories to be created
later. An existing unresolved link, non-directory ancestor, or target outside
userData fails. The independent Workspace/Agent-specific suffix assertion stays
in place. This changes test path handling, not credential placement or Core
permission rules.

Verification: the focused managed-home and lifecycle contract suites passed
6/6, including an outside junction, a dangling junction, a regular file, an
absent in-root home and a missing userData root. Syntax and diff checks passed.
The full hosted Host lifecycle run must still pass with this change before the
original failure can be considered resolved. No process-exit requirement is
relaxed and no result is counted as physical LAN or provider qualification.
