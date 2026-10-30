import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Owner Host creation succeeds only after activation is ready", async () => {
  const [main, renderer] = await Promise.all([
    readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(
    main,
    /if \(activate\) \{\s*if \(!ownerHostIsReady\(\)\) \{\s*throw new Error\(ownerHostStatus\.lastError \|\| "SPS Owner Host did not become ready\."\);\s*\}\s*await activateOwnerHostProfile\(expectedSubject, expectedRestoreGeneration\);\s*await ensureInitialOwnerHostCompany\(\);[\s\S]*?await synchronizeReadyTeamWorkplane\(\);\s*\}/,
  );
  assert.match(
    renderer,
    /\$\("#create-owner-server"\)\.addEventListener\("click", \(\) => run\(async \(\) => \{[\s\S]*?button\.disabled = true;[\s\S]*?await window\.spsDesktop\.createOwnerServer\(\);\s*setNotice\("SPS Server 준비가 완료되었습니다\."\);\s*\} finally \{\s*button\.disabled = false;/,
  );
  assert.doesNotMatch(
    renderer,
    /\$\("#create-owner-server"\)[\s\S]*?createOwnerServer\(\);\s*await window\.spsDesktop\.openWorkspace\(\);/,
  );
});

test("local Owner Host transport proof does not depend on profile activation order", async () => {
  const [main, accountController] = await Promise.all([
    readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop-account-controller.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(
    accountController,
    /if \(\s*ownerHostStatus\.url\s*&& new URL\(hubOrigin\)\.origin === requireOwnerHostOrigin\(ownerHostStatus\.url\)\s*\) \{\s*headers\[desktopAccessHeader\] = getOwnerHostDesktopAccessToken\(\);/,
  );
  assert.doesNotMatch(
    accountController,
    /isOwnerHostProfile\(\)\s*&& ownerHostStatus\.url\s*&& new URL\(hubOrigin\)/,
  );
  assert.match(
    main,
    /headers\[SPS_DESKTOP_ACCESS_HEADER\] = ownerHostDesktopAccessToken;\s*if \(ownerBootstrap\)/,
  );
  assert.match(main, /import \{ spsRequestError, spsRequestTimeoutSignal \} from "\.\/desktop-request\.mjs";/);
  assert.match(main, /signal: spsRequestTimeoutSignal\(\)[\s\S]*?throw spsRequestError\(error, "SPS Owner Host request timed out\./);
});
