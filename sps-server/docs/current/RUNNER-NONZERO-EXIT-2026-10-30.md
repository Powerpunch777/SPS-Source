# Runner nonzero CLI exit reporting

A disposable real Core/Runner qualification successfully registered and verified a Node key, approved it, granted an Agent, claimed work through the signed protocol, executed the installed CLI under Windows Job ownership, persisted an encrypted completion through Desktop's outbox and obtained Core's durable receipt. A separate real model request then exited unsuccessfully. Core reported a generic missing-error message because Desktop's normal completion recorded `failed` and the real exit code but left `error` null.

The Runner now gives a confirmed nonzero exit a fixed, bounded explanation such as `Local command exited with code 7.`. Unavailable exit status has a fixed fallback. Cancellation/lease and timeout errors retain precedence; successful zero exits still have no error. The message does not copy arbitrary stderr or provider output. Output streaming remains available separately.

Result persistence and delivery still happen only after the existing owned-process termination checks. No replay, retry, runtime selection, permission, environment, credential or SDK payload field changed.

Selected Runner limits tests passed6/6, including a real Node subprocess exiting7 and matching persisted/delivered completion after confirmed termination. Existing completion-outbox and connection-lifetime selections passed8/8. Desktop's local Node copy was synchronized and its consistency check passed. These checks do not establish that a provider request succeeded.

The observed provider failure was a model configuration incompatibility: installed Codex CLI0.141.0 rejected the selected `gpt-6.1-terra` model with ChatGPT authentication. Login status under the Runner's actual environment succeeded. No global configuration, credential content or CLI installation was changed. Model discovery and an explicitly selected model require their own real invocation result; login or a catalog entry alone is not qualification.
