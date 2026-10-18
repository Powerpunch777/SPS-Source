# Desktop UI Development

Run from this directory after installing the existing workspace dependencies:

```powershell
npm run dev
```

This launches the source Electron app, not the installed release. Its window
title starts with `[DEV]`. The persistent `.dev-profile/` directory holds its
own login, settings, and Host data and is ignored by Git. Sign in and create a
test Host on the first launch. Do not select real project folders for UI tests.
The installed app and its data are not copied into this profile.

## Update Behavior

- Core React/CSS changes use the Core server's in-process Vite middleware/HMR.
  There is no separate public website or additional frontend server to open.
- Room, Builder, and optional Memory UI sources are watched by esbuild. Only
  their UI bundles are rebuilt; Desktop refreshes its development windows when
  these bundles change. Unsaved form state can be lost on this refresh.
- Desktop renderer HTML/CSS/JS changes refresh development windows as well.
- Main process, preload, backend, and plugin worker changes require quitting
  the development app and running `npm run dev` again. No installer build is
  required. Schema and dependency changes may still need their normal build or
  migration steps.

Use the SPS application menu's Quit command to stop the app and watchers.
Closing the window may hide it to the tray, as in the normal app.

## Boundaries

Development mode is rejected by packaged and E2E apps. It does not change the
installed app, register itself as the default `sps:` handler, bypass Google
sign-in, or disable Desktop access checks. Keep development Hosts local: do not
publish or expose the Vite development runtime through Tailscale Serve.

Development bundles are generated in the existing plugin `dist` directories;
review generated diffs before committing. Release packaging and final packaged
E2E remain separate requirements. A source window is not release evidence.
