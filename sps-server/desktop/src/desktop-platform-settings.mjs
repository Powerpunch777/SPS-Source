/** Keep an isolated test session from changing the person's Windows settings. */
export function createSpsDesktopPlatformSettings({
  app,
  isolatedE2e = false,
  startHiddenArgument = "--sps-start-hidden",
}) {
  return {
    registerProtocol() {
      if (isolatedE2e) return false;
      return app.setAsDefaultProtocolClient("sps");
    },
    readLaunchAtLogin() {
      if (isolatedE2e) return false;
      return Boolean(app.getLoginItemSettings().openAtLogin);
    },
    setLaunchAtLogin(enabled) {
      if (isolatedE2e) throw new Error("Windows startup settings are unavailable in this isolated session.");
      const value = Boolean(enabled);
      app.setLoginItemSettings({
        openAtLogin: value,
        openAsHidden: value,
        args: value ? [startHiddenArgument] : [],
      });
      return value;
    },
  };
}
