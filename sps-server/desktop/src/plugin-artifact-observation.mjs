import { createHash } from "node:crypto";
import { types } from "node:util";
import { requireSpsSourceArtifactInventory } from "./source-artifact-inventory.mjs";

const failure = () => new Error("SPS Plugin artifact references are incomplete or changed; keep all package files.");

function requireReconciliation(value, inventory) {
  if (types.isPromise(value)) {
    Promise.prototype.then.call(value, () => {}, () => {});
    throw failure();
  }
  if (!value || typeof value !== "object" || !Object.isFrozen(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const fields = Object.getOwnPropertyDescriptors(value);
  const keys = ["sourceCount", "grantCount", "fingerprint"];
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key]?.enumerable || !("value" in fields[key]))) throw failure();
  if (fields.sourceCount.value !== inventory.sources.length || fields.grantCount.value !== inventory.grants.length
    || fields.fingerprint.value !== inventory.fingerprint) throw failure();
  return Object.freeze({ sourceCount: fields.sourceCount.value, grantCount: fields.grantCount.value, fingerprint: fields.fingerprint.value });
}

/** Private composition only. The supplied Host context owns authorization and
 * complete participant discovery; this does not grant review or deletion. */
export function createSpsPluginArtifactObservation({ activity, capture } = {}) {
  if (typeof activity?.withMaintenance !== "function" || typeof capture !== "function") throw new TypeError("Invalid artifact observation composition.");
  return Object.freeze({
    withSnapshot(action) {
      if (typeof action !== "function") throw new TypeError("Artifact observation requires an action.");
      return activity.withMaintenance(async () => {
        const context = capture();
        if (!context || typeof context.assertCurrent !== "function" || typeof context.readInputs !== "function"
          || !Array.isArray(context.participants) || context.participants.length < 1 || context.participants.length > 2) throw failure();
        if (context.includeSourceInventory !== undefined && context.includeSourceInventory !== true) throw failure();
        const includeSources = context.includeSourceInventory === true;
        if (context.requireSourceReconciliation !== undefined && context.requireSourceReconciliation !== true) throw failure();
        const reconcileSources = context.requireSourceReconciliation === true;
        if (reconcileSources && !includeSources) throw failure();
        const participants = context.participants.map(value => {
          if (!value || typeof value.id !== "string" || !/^(?:host|preview)$/.test(value.id)
            || typeof value.manager?.withPluginArtifactReferences !== "function") throw failure();
          return Object.freeze({ id: value.id, manager: value.manager });
        });
        if (participants[0].id !== "host" || participants[1] && (participants[1].id !== "preview"
          || participants[1].manager === participants[0].manager)) throw failure();
        const requireCheck = async action => {
          const result = await action();
          if (result !== undefined && result !== true) throw failure();
        };
        const assertOwner = () => requireCheck(() => context.assertCurrent());
        await assertOwner();
        const inputs = await context.readInputs();
        if (!inputs || !Array.isArray(inputs.references) || typeof inputs.assertCurrent !== "function") throw failure();
        await assertOwner();
        const scopes = [];
        let active = false;
        const assertCurrent = async () => {
          if (!active) throw failure();
          await assertOwner();
          await requireCheck(() => inputs.assertCurrent());
          for (const { scope } of scopes) await scope.assertCurrent();
          await assertOwner();
          if (!active) throw failure();
        };
        async function enter(index) {
          if (index < participants.length) {
            const participant = participants[index];
            return participant.manager.withPluginArtifactReferences(async scope => {
              if (scope.coverage !== (index === 0 ? "core-and-parent-paths" : "core-only")
                || typeof scope.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(scope.fingerprint)
                || !Array.isArray(scope.references) || typeof scope.assertCurrent !== "function"
                || index === 0 && !Array.isArray(scope.parentPaths)) throw failure();
              await assertOwner();
              const inventory = includeSources ? requireSpsSourceArtifactInventory(scope.sourceInventory) : null;
              scopes.push({ id: participant.id, scope, inventory });
              try { return await enter(index + 1); }
              finally { scopes.pop(); }
            }, index === 0 ? { parentPaths: inputs.references, ...(includeSources ? { sourceInventory: true } : {}) }
              : includeSources ? { sourceInventory: true } : undefined);
          }
          const references = scopes.flatMap(({ id, scope }) => [
            ...scope.references.map(reference => Object.freeze({ ...reference, processOwner: id })),
            ...(scope.parentPaths ?? []).map(reference => Object.freeze({ ...reference, processOwner: "desktop" })),
          ]);
          const fingerprint = createHash("sha256").update(JSON.stringify(scopes.map(({ id, scope }) => [id, scope.fingerprint]))).digest("hex");
          active = true;
          try {
            await assertCurrent();
            let sourceReconciliation;
            if (reconcileSources) {
              if (typeof inputs.reconcileSourceInventory !== "function"
                || scopes.some(({ id, inventory }) => id !== "host" && (inventory.sources.length !== 0 || inventory.grants.length !== 0))) throw failure();
              sourceReconciliation = requireReconciliation(inputs.reconcileSourceInventory(scopes[0].inventory), scopes[0].inventory);
              await assertCurrent();
            }
            const result = await action(Object.freeze({ coverage: "desktop-and-owned-cores", fingerprint,
              references: Object.freeze(references),
              ...(reconcileSources ? { sourceReconciliation } : {}),
              ...(includeSources ? { sourceInventories: Object.freeze(scopes.map(({ id, inventory }) =>
                Object.freeze({ processOwner: id, inventory }))) } : {}), assertCurrent }));
            await assertCurrent();
            return result;
          } finally { active = false; }
        }
        return enter(0);
      });
    },
  });
}
