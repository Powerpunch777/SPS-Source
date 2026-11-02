const diagnostic = /^(restricted_e2e_(?:child_exit|helper_exit|native_error|invalid_context|wrapper_error|compile_exit)):(?:phase|stage)=([a-z_]{1,64})(?:,mode=([a-z-]{1,64}))?(?:,code=(-?[0-9]{1,10}),hex=0x([A-F0-9]{8}))?(?:,type=([A-Za-z]{1,64}))?$/;

/** Fixed owned-fixture observations only; never forward raw PowerShell errors. */
export function summarizeWindowsProbeFailure(value) {
  const result = { code: Number.isInteger(value?.code) ? value.code : null, diagnostics: [], observations: [] };
  for (const line of String(value?.stderr ?? "").slice(0, 32_768).split(/\r?\n/)) {
    const match = diagnostic.exec(line);
    if (match) result.diagnostics.push({ kind: match[1], phase: match[2],
      ...(match[3] ? { mode: match[3] } : {}), ...(match[4] ? { code: Number(match[4]) } : {}),
      ...(match[6] ? { type: match[6] } : {}) });
    if (result.diagnostics.length === 16) break;
  }
  for (const line of String(value?.stdout ?? "").slice(0, 32_768).split(/\r?\n/)) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const observation = {};
    for (const key of ["restrictedE2eDesktop", "privateWindowStation", "restrictedE2eChild", "ownedDescendantCreated", "ownedJobEmpty", "accepted"])
      if (typeof record[key] === "boolean") observation[key] = record[key];
    if (["natural", "forced"].includes(record.ownedJobCleanup)) observation.ownedJobCleanup = record.ownedJobCleanup;
    for (const key of ["ownedDesktopClose", "ownedWindowStationClose"])
      if (["closed", "not_owned", "failed"].includes(record[key])) observation[key] = record[key];
    if (Object.keys(observation).length) result.observations.push(observation);
    if (result.observations.length === 16) break;
  }
  result.wrapperCleanupErrorObserved = /(?:Remove-Item|Invalid E2E helper cleanup|Unexpected E2E helper cleanup|E2E helper cleanup identity)/.test(String(value?.stderr ?? "").slice(0, 32_768));
  return result;
}
