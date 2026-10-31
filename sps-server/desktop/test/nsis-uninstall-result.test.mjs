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
  assert.match(customInclude, /spsLegacyUninstallRecovery_\$\{TAG\}:\s+MessageBox MB_YESNO\|MB_ICONEXCLAMATION\|MB_DEFBUTTON2[\s\S]*?\/SD IDNO IDYES spsLegacyRecoveryOpen_\$\{TAG\}\s+Goto spsUninstallFailed_\$\{TAG\}/);
  assert.match(customInclude, /Back up your SPS data and move any work saved inside the program installation folder before cleanup\./);
  assert.match(customInclude, /AppData, Host Vault and external project folders are not cleanup targets\./);
  assert.match(customInclude, /Setup will still stop; run the latest Setup again after recovery\./);
  assert.match(customInclude, /spsLegacyRecoveryOpen_\$\{TAG\}:\s+Push \$R0\s+Push \$R2\s+Push \$R3/);
  assert.match(customInclude, /!insertmacro readReg \$R2 "\$\{TAG\}" "\$\{INSTALL_REGISTRY_KEY\}" InstallLocation/);
  assert.match(customInclude, /!insertmacro readReg \$R3 "\$\{TAG\}" "\$\{UNINSTALL_REGISTRY_KEY\}" UninstallString[\s\S]*?!insertmacro GetInQuotes \$R3 "\$R3"[\s\S]*?Call GetFileParent[\s\S]*?Pop \$R2/);
  assert.match(customInclude, /File \/oname=\$PLUGINSDIR\\SpsLegacyRecovery\.exe "\$\{PROJECT_DIR\}\\\.legacy-recovery\\SpsLegacyRecovery\.exe"\s+IfErrors spsLegacyRecoveryUnavailable_\$\{TAG\}\s+ExecWait '"\$PLUGINSDIR\\SpsLegacyRecovery\.exe" --recover "\$R2"' \$R1\s+IfErrors spsLegacyRecoveryUnavailable_\$\{TAG\}/);
  assert.match(customInclude, /spsLegacyRecoveryFinished_\$\{TAG\}:\s+Pop \$R3\s+Pop \$R2\s+Pop \$R0[\s\S]*?Goto spsUninstallFailed_\$\{TAG\}/);
  assert.doesNotMatch(customInclude, /\$installationDir/);
  assert.match(customInclude, /SetErrorLevel \$R0\s+Quit/);

  const silentFailure = customInclude.match(/spsUninstallSilentFailure_\$\{TAG\}:([\s\S]*?)spsUninstallFailed_\$\{TAG\}:/);
  assert.ok(silentFailure, "silent failures must have a dedicated path");
  assert.doesNotMatch(silentFailure[1], /MessageBox|Exec|File\s|spsLegacyRecoveryOpen/);
  const silentJump = customInclude.indexOf("IfSilent spsUninstallSilentFailure_${TAG}");
  assert.ok(silentJump < customInclude.indexOf('ReadRegStr $R1 ${TAG}'));
  assert.equal([...customInclude.matchAll(/^\s*ExecWait\b/gm)].length, 1);
  assert.doesNotMatch(customInclude, /^\s*(?:Delete|RMDir|Exec|ExecShell|nsExec|WriteReg|DeleteReg|taskkill|Retry|Sleep)\b/im);
});

test("every NSIS package path builds the recovery helper before the installer", async () => {
  const scripts = JSON.parse(await readDesktopFile("package.json")).scripts;
  for (const name of ["package:win", "release:win", "package:candidate:win"]) {
    const parts = scripts[name].split(" && ");
    assert.ok(parts.indexOf("npm run build:legacy-recovery") >= 0, name);
    assert.ok(parts.indexOf("npm run build:legacy-recovery") < parts.findIndex(part => part.startsWith("electron-builder ")), name);
  }
  assert.equal(scripts["build:legacy-recovery"], "node scripts/build-legacy-recovery-helper.mjs");
});
