const readline = require("node:readline");
let next = 1;
const pending = new Map();
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
function call(method, params, invocation) {
  const id = `fixture-${next++}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params, paperclipInvocationId: invocation });
  });
}
async function handle(message) {
  if (!message.method) {
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
    return;
  }
  if (message.method === "initialize") return { ok: true, supportedMethods: ["getData", "performAction"] };
  if (message.method === "shutdown") { setTimeout(() => process.exit(0), 10); return {}; }
  if (!["getData", "performAction"].includes(message.method)) throw new Error("unsupported fixture operation");
  const { key, companyId } = message.params;
  if (key !== (message.method === "getData" ? "fixture.count" : "fixture.increment")) throw new Error("unknown fixture action");
  const scope = { scopeKind: "company", scopeId: companyId, stateKey: "count" };
  const count = Number(await call("state.get", scope, message.paperclipInvocation.id) ?? 0);
  if (message.method === "performAction") {
    await call("state.set", { ...scope, value: count + 1 }, message.paperclipInvocation.id);
    return { count: count + 1 };
  }
  return { count };
}
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  void handle(message).then(result => {
    if (message.method) send({ jsonrpc: "2.0", id: message.id, result });
  }, error => send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Fixture operation failed" } }));
});
