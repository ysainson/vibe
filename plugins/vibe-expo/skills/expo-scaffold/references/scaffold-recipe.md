# Scaffold recipe — template to reshaped phone app

The exact moves from `create-expo-app` to the reshaped shape. Every version below is a **July 2026 snapshot to verify, never to copy** — resolve the current stable at scaffold time and let `bunx expo install` pin SDK-tied packages.

## 1. Create from the default template

```sh
bunx create-expo-app@latest myapp
cd myapp
```

The default template is Expo Router + TypeScript. On SDK 55+ it already lays down a top-level `src/` holding `app/`, `components/`, `constants/`, and `hooks/` — verify where the routes actually landed before moving anything (step 3 is a no-op if they are already under `src/app`).

The template also pre-ships agent files: `CLAUDE.md` (a one-line `@AGENTS.md` include), `AGENTS.md`, and a `.claude/settings.json` enabling Expo's own plugin. **Merge, don't clobber**: extend the existing `CLAUDE.md` and merge the VIBE marketplace + `vibe`/`vibe-expo` entries into the existing `.claude/settings.json`, keeping what the template (and later `argent init`) put there.

## 2. Reset to a clean slate

The template's `reset-project` script is **interactive** — it prompts whether to keep the starter files. Answer non-interactively so a scripted run never hangs on stdin:

```sh
printf 'n\n' | bun run reset-project    # "n" = delete the starter outright
```

That deletes the starter `src/` + `scripts/` and writes a fresh minimal `src/app/` (an `index.tsx` + `_layout.tsx`). (Answering `y` instead moves them into `example/` — then `rm -rf example` before proceeding, or its stale `@/…` imports break typecheck.) The script deletes itself with `scripts/`, so also drop the now-dangling `"reset-project"` entry from `package.json` scripts.

## 3. Put the routes under `src/app`

Expo Router's directory resolver checks `src/app` first and falls back to `app`, so the routes are auto-detected once moved — no config key names the directory. On the current template this step is a no-op (reset-project already writes `src/app`). If a resolved template left routes at the repo root instead, move the app source under `src/` (plain `mv` — the files are freshly written and untracked, so `git mv` refuses them):

```sh
mkdir -p src
mv app src/app
# move any sibling source the template created, e.g.:
mv components src/components 2>/dev/null || true
mv constants  src/constants  2>/dev/null || true
mv hooks      src/hooks      2>/dev/null || true
```

Keep the config files (`app.config.ts`, `package.json`, `metro.config.js`, `tsconfig.json`) at the repo root — only the source moves.

Confirm `package.json` still has the Expo Router entry (the template sets it; verify, don't assume):

```jsonc
// package.json
{ "main": "expo-router/entry" }
```

## 4. `@/*` alias + strict tsconfig

```jsonc
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

The template ships no `typecheck` script — add one, since the done-signals below gate on it:

```jsonc
// package.json scripts
{ "typecheck": "tsc --noEmit" }
```

Done-signal: `import { env } from "@/env"` resolves and `bun run typecheck` is green.

## 5. Typed `app.config.ts` branching on `EXPO_PUBLIC_APP_ENV`

Replace the generated `app.json` with a typed `app.config.ts` (delete `app.json` after). `app.config.ts` is a **build-time config file** — it is one of the two sanctioned places allowed to read `process.env` directly.

```ts
// app.config.ts
import type { ExpoConfig } from "expo/config";

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const isProd = appEnv === "production";
const suffix = isProd ? "" : `.${appEnv}`;

const config: ExpoConfig = {
  name: isProd ? "MyApp" : `MyApp (${appEnv})`,
  slug: "myapp",
  scheme: "myapp",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  platforms: ["ios"],   // + "android" when Android is selected — omitting the key does NOT exclude web
  ios: {
    supportsTablet: false,
    bundleIdentifier: `com.acme.myapp${suffix}`,
  },
  // android block is added only when Android is a selected platform (step 8)
  plugins: ["expo-router"],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
```

The minimal config above deliberately drops the template's art keys (`icon`, android adaptive icons, the `expo-splash-screen` plugin entry) — build defaults cover the scaffold; carry them over when the app has real art. Note there is no `newArchEnabled` key: the New Architecture is the only mode on current SDKs, and the key no longer exists in the config types (typecheck rejects it).

Done-signal: `bunx expo config --type public` prints the resolved config for the current `EXPO_PUBLIC_APP_ENV` with no error, and `app.json` no longer exists.

**React Compiler / typed routes — verify, don't add.** The resolved default template is expected to already enable `experiments.reactCompiler` and typed routes; if a resolved template does not, the two `experiments` keys above turn them on. Confirm they are on rather than assuming either way. Do not install the standalone `eslint-plugin-react-compiler` (retired on SDK 55+); the compiler lint rules ride in via `eslint-config-expo`'s `react-hooks` v7 preset.

## 6. babel / metro — keep the defaults

The current template generates **no** `babel.config.js` or `metro.config.js` at all — the CLI defaults (`babel-preset-expo`, `@expo/metro-config`) apply without a file on disk, and that is the correct standalone-phone-app state. Do not create either file unless deviating:

- **metro** — a monorepo needs `metro.config.js` to watch the workspace root and resolve hoisted `node_modules` (see [tooling-patterns.md](tooling-patterns.md), monorepo escape hatch).
- **babel** — leave `babel-preset-expo` alone; React Compiler is driven by the `experiments.reactCompiler` config flag, not a hand-added Babel plugin.

Done-signal: `bunx expo start --no-dev --clear` boots Metro with no config error.

## 7. Strip web (phones only)

The template ships web support the phone app does not use. Remove it so no web artifact remains:

```sh
bun remove react-native-web react-dom @expo/metro-runtime   # whichever are present
rm -f assets/images/favicon.png
```

Also delete the `"web": "expo start --web"` script from `package.json`. Then in `app.config.ts` ensure there is **no** `web` key, **no** `favicon`, and that `platforms` explicitly lists only the selected native platforms (step 5's snippet) — omitting the key resolves to `['ios','android','web']`, so omission does **not** exclude web. Done-signal: `grep -ri "react-native-web\|react-dom\|favicon\|\"web\"" app.config.ts package.json` returns nothing.

## 8. The platform clarify question and its consequences

Setup asks one Expo-specific question on top of setup.md's gap questions: **iOS-first, or iOS + Android.**

- **iOS-first** — `platforms: ["ios"]`, no `android` block in `app.config.ts`; the build/run command is `expo run:ios`; `CLAUDE.md` records iOS only.
- **iOS + Android** — `platforms: ["ios", "android"]` and an `android` block in `app.config.ts`:

  ```ts
  android: {
    package: `com.acme.myapp${suffix}`,
  },
  ```

  wire `expo run:android` into `CLAUDE.md`'s run commands, and record the Android Metro caveat (`adb reverse tcp:8081 tcp:8081`, see [verification.md](verification.md)).

Record the resolved SDK / RN / React versions and the selected run commands in `CLAUDE.md` as a snapshot to re-verify.
