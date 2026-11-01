// Main-owned Preview lifecycle exclusion; not filesystem authority or an OS lock.
export function createSpsPluginPreviewOperationGate() {
  let active = null;
  return Object.freeze({
    isBusy: () => active !== null,
    async run(action) {
      if (active) throw new Error("Another Plugin Preview operation is still in progress. Wait and retry.");
      if (typeof action !== "function") throw new TypeError("A Preview lifecycle action is required.");
      let settle;
      const owner = { finished: new Promise(resolve => { settle = resolve; }) };
      active = owner;
      try { return await action(); }
      finally {
        if (active === owner) active = null;
        settle();
      }
    },
    async waitForIdle() {
      const owner = active;
      if (owner) await owner.finished;
    },
  });
}
