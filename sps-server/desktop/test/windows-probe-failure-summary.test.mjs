import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWindowsProbeFailure } from "../scripts/windows-e2e/probe-failure-summary.mjs";

test("owned probe failure summary retains fixed phase/exit/cleanup without raw output", () => {
  const summary = summarizeWindowsProbeFailure({ code: 1,
    stdout: '{"restrictedE2eDesktop":true,"privateWindowStation":true}\n'
      + '{"ownedDescendantCreated":true,"secret":"hide@example.test"}\n'
      + '{"ownedJobEmpty":true,"ownedJobCleanup":"forced","accepted":false}\n'
      + '{"ownedDesktopClose":"closed","ownedWindowStationClose":"closed"}\n',
    stderr: 'restricted_e2e_child_exit:phase=child_exit,mode=probe-preview-failure-descendant,code=7,hex=0x00000007\n'
      + 'restricted_e2e_helper_exit:phase=helper_exit,code=7,hex=0x00000007\n'
      + 'Remove-Item failed at C:\\private\\hide@example.test\\token.txt\n',
  });
  assert.deepEqual(summary, { code: 1, diagnostics: [
    { kind: "restricted_e2e_child_exit", phase: "child_exit", mode: "probe-preview-failure-descendant", code: 7 },
    { kind: "restricted_e2e_helper_exit", phase: "helper_exit", code: 7 },
  ], observations: [{ restrictedE2eDesktop: true, privateWindowStation: true }, { ownedDescendantCreated: true },
    { ownedJobEmpty: true, accepted: false, ownedJobCleanup: "forced" },
    { ownedDesktopClose: "closed", ownedWindowStationClose: "closed" }], wrapperCleanupErrorObserved: true });
  assert.doesNotMatch(JSON.stringify(summary), /hide@example|token\.txt|@|C:\\/);
});

test("probe summaries reject arbitrary labels, malformed frames and unbounded records", () => {
  const result = summarizeWindowsProbeFailure({ code: "C:\\secret",
    stderr: 'restricted_e2e_invalid_context:phase=probe_descendant_alive,type=InvalidOperationException\n'
      + 'restricted_e2e_native_error:phase=C:\\private,code=5,hex=0x00000005\n'
      + 'secret@example.test\n',
    stdout: 'not-json\n["secret"]\nnull\n'
      + Array(30).fill('{"ownedJobEmpty":true,"ownedJobCleanup":"secret"}').join('\n'),
  });
  assert.equal(result.code, null);
  assert.deepEqual(result.diagnostics, [{ kind: "restricted_e2e_invalid_context", phase: "probe_descendant_alive", type: "InvalidOperationException" }]);
  assert.equal(result.observations.length, 16);
  assert.equal(result.wrapperCleanupErrorObserved, false);
  assert.doesNotMatch(JSON.stringify(result), /secret|private|@|C:\\/);
});
