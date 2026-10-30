# Owner creation E2E diagnostics

Source6e5 push40985821707 failed in packaged Workspace acceptance before Host-ready polling: the setup page's `Runtime.evaluate` call for the Create Server button did not answer within its existing ten-second RPC limit. The same tuple's PR passed that Workspace-surfaces step. The call did not await the server-creation promise, so its timeout alone does not identify slow Core startup. The original failure lacked evidence distinguishing DOM lookup, synchronous scrolling, event dispatch and execution-context destruction.

The harness now retains the latest forty fixed diagnostic records per CDP connection: request IDs/method names, elapsed milliseconds, response/failure status, selected runtime/context lifecycle event names and six allowed click phases. Setup enables the Runtime event stream, and the existing click expression emits those fixed phases around lookup/scroll/dispatch. Failure reporting reads this retained snapshot before trying a page query against a possibly closed socket.

It does not retain evaluated expressions, URLs, arbitrary console arguments, exception payloads or response values. Snapshot copies cannot mutate its internal records. Invalid JSON message shapes fail closed. The original ten-second RPC limit, Host-ready budget, click/Host/Workspace assertions, socket/listener cleanup and whole-Job shutdown qualification are unchanged. No retry or pass-on-timeout path was added.

Selected CDP and Workspace harness contract tests passed11/11 without skips. An additional disposable Node inspector exercised the actual Runtime console event stream, then intentionally stalled evaluation: the original ten-second rejection closed the socket, retained the last click phase and excluded expression/private-console canaries. Its owned Windows Job was terminated and confirmed empty. This verifies diagnostics and unchanged failure behavior; it does not reproduce or fix the original Electron click stall. Exact candidate CI remains required.

Reference: [official CDP Runtime schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json). No upstream implementation or dependency was added.
