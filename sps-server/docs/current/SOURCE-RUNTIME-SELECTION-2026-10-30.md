# Source Desktop runtime selection

Source Desktop already selects the checked-out Core for Owner Host and plugin-preview execution. It nevertheless materialized the local packaged runtime first, even though that runtime was not selected. A real source Desktop restore qualification spent its creation budget copying a prior ignored release artifact into the isolated profile, before the current Core started.

Owner Host and preview resolution now materialize a packaged runtime only when `app.isPackaged` is true. Source mode goes directly to the existing checked-out Core resolver. Packaged runtime selection, stable Node materialization and error propagation remain unchanged; a packaged failure cannot fall back to the source checkout. Existing packaged artifacts are preserved, not deleted or relabeled.

The new source-preview regression failed before this change. The selected activation, Main restore-flow and Owner Host tests pass after it; packaged preview uses its materialized runtime/stable Node and propagates materialization failure without a source fallback. Real source Main export/restore qualification remains separate and must reach its own terminal result before being described as passing. This source startup fix is not installed-byte or external Identity qualification.
