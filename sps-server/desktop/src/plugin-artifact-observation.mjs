import { createHash } from "node:crypto";

const failure = () => new Error("SPS Plugin artifact references are incomplete or changed; keep all package files.");

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
              scopes.push({ id: participant.id, scope });
              try { return await enter(index + 1); }
              finally { scopes.pop(); }
            }, index === 0 ? { parentPaths: inputs.references } : undefined);
          }
          const references = scopes.flatMap(({ id, scope }) => [
            ...scope.references.map(reference => Object.freeze({ ...reference, processOwner: id })),
            ...(scope.parentPaths ?? []).map(reference => Object.freeze({ ...reference, processOwner: "desktop" })),
          ]);
          const fingerprint = createHash("sha256").update(JSON.stringify(scopes.map(({ id, scope }) => [id, scope.fingerprint]))).digest("hex");
          active = true;
          try {
            await assertCurrent();
            const result = await action(Object.freeze({ coverage: "desktop-and-owned-cores", fingerprint,
              references: Object.freeze(references), assertCurrent }));
            await assertCurrent();
            return result;
          } finally { active = false; }
        }
        return enter(0);
      });
    },
  });
}
