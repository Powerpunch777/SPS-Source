import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desktopRoot = new URL("../", import.meta.url);
const readDesktopFile = relativePath => readFile(new URL(relativePath, desktopRoot), "utf8");

test("production NSIS hooks fail closed on old-uninstaller errors without changing uninstall policy", async () => {
  const [packageJson, customInclude, installUtil, installSection] = await Promise.all([
    readDesktopFile("package.json").then(JSON.parse),
    readDesktopFile("build/installer.nsh"),
    readDesktopFile("node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh"),
    readDesktopFile("node_modules/app-builder-lib/templates/nsis/installSection.nsh"),
  ]);
  const nsis = packageJson.build.nsis;

  assert.equal(nsis.include, "build/installer.nsh");
  assert.equal(nsis.perMachine, false);
  assert.equal(nsis.deleteAppDataOnUninstall, false);

  const shellHook = installUtil.indexOf("!insertmacro customUnInstallCheck\n");
  const currentUserHook = installUtil.indexOf("!insertmacro customUnInstallCheckCurrentUser\n");
  const vendorFallback = installUtil.indexOf("MessageBox MB_OK|MB_ICONEXCLAMATION \"$(uninstallFailed): $R0\"");
  assert.ok(shellHook >= 0 && shellHook < vendorFallback, "shell-context hook must run before vendor fallback");
  assert.ok(currentUserHook > shellHook && currentUserHook < vendorFallback, "current-user hook must run before vendor fallback");
  assert.match(installSection, /!insertmacro uninstallOldVersion SHELL_CONTEXT\s+!insertmacro handleUninstallResult SHELL_CONTEXT/);
  assert.match(installSection, /!insertmacro uninstallOldVersion HKEY_CURRENT_USER\s+!insertmacro handleUninstallResult HKEY_CURRENT_USER/);

  assert.match(customInclude, /!macro customUnInstallCheck\s+!insertmacro spsHandleUninstallResult SHELL_CONTEXT/);
  assert.match(customInclude, /!macro customUnInstallCheckCurrentUser\s+!insertmacro spsHandleUninstallResult HKEY_CURRENT_USER/);
  assert.match(customInclude, /IfErrors spsUninstallLaunchFailed_\$\{TAG\}[\s\S]*?SetErrorLevel 2\s+Quit/);
  assert.match(customInclude, /MessageBox MB_OK\|MB_ICONEXCLAMATION "\$\(uninstallFailed\): \$R0"/);
  assert.match(customInclude, /IfSilent spsUninstallSilentFailure_\$\{TAG\}/);
  assert.match(customInclude, /ReadRegStr \$R1 \$\{TAG\} "\$\{UNINSTALL_REGISTRY_KEY\}" "DisplayVersion"[\s\S]*?StrCmp \$R1 "0\.4\.86" spsLegacyUninstallRecovery_\$\{TAG\}/);
  assert.match(customInclude, /spsLegacyUninstallRecovery_\$\{TAG\}:[\s\S]*?Automatic replacement failed; no recovery was started\.[\s\S]*?Back up your SPS data\.[\s\S]*?Windows Installed Apps without deleting app data[\s\S]*?latest Setup\.[\s\S]*?Do not delete SPS AppData or project folders\.[\s\S]*?back up or move projects saved inside the program installation folder\./);
  assert.match(customInclude, /SetErrorLevel \$R0\s+Quit/);

  const silentFailure = customInclude.match(/spsUninstallSilentFailure_\$\{TAG\}:([\s\S]*?)spsUninstallFailed_\$\{TAG\}:/);
  assert.ok(silentFailure, "silent failures must have a dedicated path");
  assert.doesNotMatch(silentFailure[1], /MessageBox/);
  assert.doesNotMatch(customInclude, /^\s*(?:Delete|RMDir|Exec|ExecWait|nsExec|WriteReg|DeleteReg|taskkill|Retry|Sleep)\b/im);
});
