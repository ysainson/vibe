# Verification — dev client + argent verify loop

Proving the scaffolded app actually runs on a simulator, via the dev client (never Expo Go) and argent. All commands assume the resolved-current toolchain — nothing here is version-pinned.

## Argent wiring at scaffold time

Wire argent into the new project so the running app is inspectable:

```sh
argent init -y
```

That writes an `.mcp.json` stdio entry for the argent server and vendors the argent skills into the project. Done-signal: `.mcp.json` exists with the argent stdio entry and the vendored skills are present.

## Build the dev client — budget the build time

The dev client is built and installed once per platform, then Metro serves the JS:

```sh
bunx expo run:ios          # iOS-first
bunx expo run:android      # also, when Android was selected
```

**Long-build caveat:** the first `expo run:ios` compiles the native app and **exceeds default command timeouts**. Run it backgrounded or with an extended timeout — do not let a default-timeout kill abort a healthy build. Subsequent JS changes reload over Metro without a rebuild.

Done-signal: the build finishes, installs the dev client, and the app launches against Metro.

## Metro requirements

- **Metro on 8081.** Start it (`bunx expo start --dev-client`) or let `run:ios` / `run:android` start it; the dev client connects to `localhost:8081`.
- **Android needs a port bridge.** When Android is selected, forward Metro to the emulator/device before the app loads:

  ```sh
  adb reverse tcp:8081 tcp:8081
  ```

Done-signal: the dev client loads the JS bundle and the hello screen renders (no red-box bundling error).

## The argent verify loop

Boot the simulator and confirm the hello screen through argent, in order:

1. **`list-devices`** → pick the target (prefer a booted one; iOS `Booted`, Android `state: "device"`).
2. **`boot-device`** with that device's `udid` / `avdName` if it is not already running.
3. **`launch-app`** with the app's bundle id / package (the `bundleIdentifier` / `android.package` from `app.config.ts`, resolved for the current `EXPO_PUBLIC_APP_ENV`).
4. **`screenshot`** — a baseline image of the running hello screen.
5. **`debugger-component-tree`** (React Native) or **`describe`** — confirm the hello screen's components are present in the tree, not just pixels.

Done-signal: the screenshot shows the hello screen and the component tree lists its elements — captured evidence, not an assertion.

## What "verified running" means

The scaffold is proven when: the dev client built clean for each selected platform, Metro served the bundle with no error, and the argent screenshot + component tree show the hello screen. Record the resolved SDK / RN / React versions and the run commands in `CLAUDE.md` alongside this evidence.
