# Source Desktop runtime selection

Source Desktop already selects the checked-out Core for Owner Host and plugin-preview execution. It nevertheless materialized the local packaged runtime first, even though that runtime was not selected. A real source Desktop restore qualification spent its creation budget copying a prior ignored release artifact into the isolated profile, before the current Core started.

Owner Host and preview resolution now materialize a packaged runtime only when `app.isPackaged` is true. Source mode goes directly to the existing checked-out Core resolver. Packaged runtime selection, stable Node materialization and error propagation remain unchanged; a packaged failure cannot fall back to the source checkout. Existing packaged artifacts are preserved, not deleted or relabeled.

The new source-preview regression failed before this change. The selected activation, Main restore-flow and Owner Host tests pass after it; packaged preview uses its materialized runtime/stable Node and propagates materialization failure without a source fallback. Real source Main export/restore qualification remains separate and must reach its own terminal result before being described as passing. This source startup fix is not installed-byte or external Identity qualification.

## Source restore executable

Actual Main export subsequently completed, but fresh-profile restore exposed another source-mode mismatch: the Core CLI resolver returns PATH's `node`, while Windows-owned restore supervision requires an absolute executable. Restore failed closed with staged data retained. Source restore now invokes the current Electron executable in Node mode (`ELECTRON_RUN_AS_NODE=1`) for the helper, preserving the selected Core directory and other runtime environment. Packaged restore retains its materialized runtime command and environment. The strict Windows supervisor contract is unchanged.

The new source-command regression failed before the fix; its packaged counterpart passed. After the correction,30selected Main-flow/restore-runner tests passed, including three actual Windows helper/descendant/pipe-closure/cancellation cases. No timeout or process-ownership requirement was relaxed. A source Main transfer probe must still complete import, promotion, activation and restart to qualify the entire flow.
