export const BUILDER_UI_AUTHORING_CONTRACT = [
  "Builder browser UI compatibility:",
  "- Import React APIs from `react`; the host resolves external React, JSX runtime, and SDK bridge dependencies.",
  "- Do not assume `globalThis.React` or `window.React` exists.",
  "- Export the named component declared by the plugin manifest.",
  "- Do not use Node-only APIs in browser UI code.",
].join("\n");
