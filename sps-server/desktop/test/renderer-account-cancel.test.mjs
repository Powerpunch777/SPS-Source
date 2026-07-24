import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);
const stylesPath = new URL("../renderer/styles.css", import.meta.url);

test("keeps the visible SPS sign-in cancel control interactive while sign-in is pending", async () => {
  const [renderer, styles] = await Promise.all([
    readFile(rendererPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(renderer, /#cancel-sps-account.*signOutSpsAccount/s);
  assert.match(styles, /body\.pending \.account-screen > :not\(#cancel-sps-account\) \{ pointer-events: none; \}/);
  assert.doesNotMatch(styles, /cancel-google-account/);
});
