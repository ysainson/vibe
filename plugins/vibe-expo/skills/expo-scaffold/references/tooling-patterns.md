# Tooling patterns — worked baseline code

The worked code behind the SKILL's baseline. Install non-SDK packages with `bun add`, SDK-tied ones with `bunx expo install` (it pins to the resolved SDK). No version below is a pin — resolve current stable at scaffold time.

## dayjs behind one pre-extended util module

```ts
// src/lib/date.ts
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";

// dayjs is imported from here and nowhere else, so its plugins are
// extended exactly once and every call site shares one configured instance.
dayjs.extend(relativeTime);
dayjs.extend(utc);

export { dayjs };
```

Done-signal: app code does `import { dayjs } from "@/lib/date"`; the bare `dayjs` package is imported in no other file.

## src/env.ts — t3-env + zod, EXPO_PUBLIC_ prefix

`bun add @t3-oss/env-core zod` (resolve a Standard-Schema-compatible zod). This is one of the two files allowed to read raw `process.env`; Metro inlines `EXPO_PUBLIC_*` at build time, so each var is referenced **statically** in `runtimeEnv` (no dynamic `process.env[key]`).

```ts
// src/env.ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_APP_ENV: z.enum(["development", "preview", "production"]),
    EXPO_PUBLIC_API_URL: z.url(),
  },
  runtimeEnv: {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  },
});
```

Done-signal: `import { env } from "@/env"` typechecks; every other module reads config through `env`, never `process.env`.

## ds/ tokens module — single barrel, plain StyleSheet

```ts
// src/ds/tokens.ts
export const color = {
  bg: "#FFFFFF",
  surface: "#F2F3F5",
  fg: "#11181C",
  muted: "#687076",
  accent: "#2E78F0",
  border: "#E6E8EB",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: "700" },
  body: { fontSize: 16, fontWeight: "400" },
  caption: { fontSize: 13, fontWeight: "400" },
} as const;
```

```ts
// src/ds/useDS.ts
import { useColorScheme } from "react-native";

import { color, radius, space, typography } from "./tokens";

// Single hook the UI reads tokens through, so a dark palette can be
// added here later without touching call sites.
export function useDS() {
  const scheme = useColorScheme() ?? "light";
  return { scheme, color, space, radius, typography };
}
```

```ts
// src/ds/index.ts  — the single barrel
export { color, radius, space, typography } from "./tokens";
export { useDS } from "./useDS";
```

Screens style with plain `StyleSheet`, tokens read from the barrel:

```tsx
import { StyleSheet, Text, View } from "react-native";

import { color, space, typography } from "@/ds";

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, padding: space.md },
  title: { ...typography.title, color: color.fg },
});
```

Done-signal: `src/ds/index.ts` is the only tokens import path; no `nativewind` / `tamagui` in `package.json`.

## Root layout — AppProvider nesting + exported ErrorBoundary

`bunx expo install react-native-gesture-handler react-native-safe-area-context` and `bun add @tanstack/react-query`. Nesting order is **Query > GestureHandlerRootView > SafeAreaProvider**.

```tsx
// src/app/_layout.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { color, space, typography } from "@/ds";

const queryClient = new QueryClient();

// Expo Router renders a named `ErrorBoundary` export in place of the
// route subtree when it throws.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: space.md, padding: space.lg, backgroundColor: color.bg }}>
      <Text style={{ ...typography.title, color: color.fg }}>Something went wrong</Text>
      <Text style={{ ...typography.body, color: color.muted }}>{error.message}</Text>
      <Text onPress={retry} style={{ ...typography.body, color: color.accent }}>
        Try again
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Stack />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
```

Done-signal: the root layout nests those three providers in that order and exports `ErrorBoundary`; a thrown error in a child route renders the fallback.

## Example test — jest-expo + @testing-library/react-native

`bunx expo install jest-expo jest @types/jest --dev` and `bun add -d @testing-library/react-native`. The preset maps the tsconfig `@/*` alias into jest's module resolution itself — no `moduleNameMapper` needed. Two wiring facts the defaults don't cover: jest's globals (`describe`/`it`/`expect`) are not auto-included under `expo/tsconfig.base`, so add `"types": ["jest"]` to `tsconfig.json`'s `compilerOptions` when installing; and `renderHook` (testing-library v14+) is async — `await` it.

```jsonc
// package.json
{
  "scripts": { "test": "jest" },
  "jest": { "preset": "jest-expo" }
}
```

```tsx
// src/ds/__tests__/useDS.test.tsx
import { renderHook } from "@testing-library/react-native";

import { useDS } from "@/ds";

describe("useDS", () => {
  it("exposes the token scales", async () => {
    const { result } = await renderHook(() => useDS());
    expect(result.current.space.md).toBe(16);
    expect(result.current.color.accent).toBeDefined();
  });
});
```

Done-signal: `bun run test` is green.

## ESLint flat config — the two bans

`bun add -d eslint eslint-config-expo` (the template ships neither). `eslint-config-expo` supplies the base (JSX/TS, platform globals, the `react-hooks` v7 preset that carries the React Compiler rules). Compose the two project bans on top. The `runOnJS` ban is `no-restricted-imports`; the raw-`process.env` ban is `no-restricted-syntax` with an override for the two build-time config files.

```js
// eslint.config.js
const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  globalIgnores(["dist/*", ".expo/*"]),
  {
    rules: {
      // runOnJS is retired — schedule RN-runtime work with scheduleOnRN.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native-worklets",
              importNames: ["runOnJS"],
              message: "Use scheduleOnRN from react-native-worklets, not runOnJS.",
            },
            {
              name: "react-native-reanimated",
              importNames: ["runOnJS"],
              message: "Use scheduleOnRN from react-native-worklets, not runOnJS.",
            },
          ],
        },
      ],
      // Raw process.env is banned; read config through @/env instead.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: "Read env through @/env (t3-env), not raw process.env.",
        },
      ],
    },
  },
  {
    // The two sanctioned build-time readers of process.env.
    files: ["src/env.ts", "app.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
]);
```

Done-signal: importing `runOnJS` fails lint with the `scheduleOnRN` message; a raw `process.env.X` outside `src/env.ts` / `app.config.ts` fails lint.

## Prettier — @ianvs import sort

`bun add -d prettier @ianvs/prettier-plugin-sort-imports`.

```js
// prettier.config.js
module.exports = {
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "<BUILTIN_MODULES>",
    "<THIRD_PARTY_MODULES>",
    "",
    "^@/(.*)$",
    "",
    "^[.]",
  ],
};
```

Done-signal: `bunx prettier --check .` passes on the baseline and groups builtins, third-party, `@/…`, then relative imports.

## Escape hatch — zustand (documented, not scaffolded)

`zustand` is **not installed** at scaffold time. When genuinely global *client* state appears (server state stays in TanStack Query), `bun add zustand` and add a store:

```ts
// src/stores/session.ts — only once global client state actually exists
import { create } from "zustand";

type SessionState = {
  userId: string | null;
  signIn: (userId: string) => void;
  signOut: () => void;
};

export const useSession = create<SessionState>((set) => ({
  userId: null,
  signIn: (userId) => set({ userId }),
  signOut: () => set({ userId: null }),
}));
```

## Escape hatch — monorepo metro wiring (documented, not scaffolded)

The repo starts as a standalone single-bun-package. When it becomes a workspace, point Metro at the workspace root and both `node_modules` trees:

```js
// metro.config.js — only when the app becomes a workspace package
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
```
