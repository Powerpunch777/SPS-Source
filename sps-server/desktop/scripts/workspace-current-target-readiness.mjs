import assert from "node:assert/strict";

const readinessExpression = `(async () => {
  if (document.readyState !== 'complete' || document.visibilityState !== 'visible'
      || !document.body || document.body.childElementCount === 0
      || typeof window.spsDesktopWorkspace?.getDesktopAccount !== 'function') return { ready: false };
  const account = await window.spsDesktopWorkspace.getDesktopAccount();
  return { ready: true, signedIn: account?.signedIn === true, email: account?.email ?? null };
})()`;

export async function waitForCurrentWorkspaceTarget({ expectedOrigin, expectedAccountEmail, listTargets, openCdp,
  mainIsRunning, timeoutMs = 45_000, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const origin = new URL(expectedOrigin);
  assert.ok(origin.protocol === "http:" && origin.hostname === "127.0.0.1" && origin.origin === expectedOrigin
    && !origin.username && !origin.password, "Invalid fixed Workspace readiness origin.");
  assert.ok(typeof expectedAccountEmail === "string" && expectedAccountEmail.length > 0 && expectedAccountEmail.length <= 320,
    "Missing fixed Workspace readiness account.");
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 45_000, "Invalid Workspace document readiness bound.");
  const deadline = now() + timeoutMs;
  const sessions = new Map();
  const retired = new Set();
  let retained = null;
  const close = async session => { try { await session.cdp.close(); } catch { /* Cleanup cannot qualify a failed read. */ } };
  const isClosed = session => session.cdp.snapshotDiagnostics().socketClosed === true;
  const retire = async session => {
    retired.add(session.target.id);
    await close(session);
    sessions.delete(session.target.id);
    assert.ok(retired.size <= 3, "Too many unqualified Workspace targets were retired.");
  };
  try {
    while (now() < deadline) {
      assert.equal(mainIsRunning(), true, "Desktop exited before its authorized Workspace document was ready.");
      const targets = await listTargets();
      assert.ok(Array.isArray(targets) && targets.length <= 16, "Invalid Workspace target list.");
      const ids = new Set();
      for (const target of targets) {
        assert.ok(target && typeof target.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(target.id)
          && !ids.has(target.id), "Invalid or duplicate Workspace target identity.");
        ids.add(target.id);
      }
      for (const target of targets) {
        if (target.type !== "page" || retired.has(target.id)) continue;
        let targetUrl;
        try { targetUrl = new URL(target.url); } catch { continue; }
        if (targetUrl.origin !== expectedOrigin || targetUrl.username || targetUrl.password) continue;
        let endpoint;
        try { endpoint = new URL(target.webSocketDebuggerUrl); }
        catch { throw new Error("Workspace debugger endpoint is not local."); }
        assert.ok(endpoint.protocol === "ws:" && endpoint.hostname === "127.0.0.1" && endpoint.port
          && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
          && endpoint.pathname === `/devtools/page/${target.id}`,
          "Workspace debugger endpoint is not local.");
        let session = sessions.get(target.id);
        if (!session) {
          assert.ok(sessions.size + retired.size < 4, "Too many unqualified Workspace targets.");
          session = { target, cdp: await openCdp(target) };
          sessions.set(target.id, session);
        }
        if (isClosed(session)) { await retire(session); continue; }
        let result;
        try { result = await session.cdp.evaluate(readinessExpression, true); }
        catch (error) {
          if (isClosed(session)) { await retire(session); continue; }
          throw new Error("The live Workspace document readiness request failed.");
        }
        if (isClosed(session)) { await retire(session); continue; }
        assert.ok(result && typeof result === "object" && !Array.isArray(result)
          && (result.ready === false || result.ready === true), "Invalid Workspace document readiness result.");
        if (result.ready === false) {
          assert.deepEqual(Object.keys(result), ["ready"], "Invalid pending Workspace document readiness result.");
          continue;
        }
        assert.deepEqual(Object.keys(result).sort(), ["email", "ready", "signedIn"], "Invalid ready Workspace document result.");
        assert.ok(result.signedIn === true && result.email === expectedAccountEmail,
          "The current Workspace document belongs to an unexpected Desktop account.");
        assert.equal(mainIsRunning(), true, "Desktop exited before its authorized Workspace document was ready.");
        assert.ok(now() < deadline, "Timed out waiting for the current authorized Workspace document.");
        retained = session;
        return { target: session.target, cdp: session.cdp, retiredTargets: retired.size };
      }
      await delay(Math.min(100, Math.max(1, deadline - now())));
    }
    throw new Error("Timed out waiting for the current authorized Workspace document.");
  } finally {
    for (const session of sessions.values()) if (session !== retained) await close(session);
  }
}
