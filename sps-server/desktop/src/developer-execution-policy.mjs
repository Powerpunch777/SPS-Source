const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Separate Preview data is not an OS sandbox. This legacy path is available
// only as explicit trusted local code; no caller can claim protected support.
export function requireTrustedDeveloperExecution(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new TypeError("Choose an explicit development execution mode.");
  }
  const fields = Object.getOwnPropertyDescriptors(input);
  const keys = ["projectId", "executionMode"];
  if (Reflect.ownKeys(fields).length !== keys.length
    || keys.some(key => !fields[key]?.enumerable || !("value" in fields[key]))) {
    throw new TypeError("Development execution requires only a project and explicit execution mode.");
  }
  if (fields.executionMode.value !== "trusted-local") {
    throw new Error("Protected development execution is unavailable: OS file, Vault and child-process containment is not verified. Only explicitly trusted local code can use this legacy Preview.");
  }
  const projectId = fields.projectId.value;
  if (typeof projectId !== "string" || !PROJECT.test(projectId)) throw new TypeError("A saved development project is required.");
  return projectId;
}
