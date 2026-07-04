---
name: expo-scaffold
description: The canonical shape of a VIBE Expo / React Native phone app - a dev-client-first Expo Router project with routes in src/app, a typed app.config.ts, TanStack Query + t3-env, plain-StyleSheet ds/ tokens, React Compiler on, and an argent-verified running hello screen. Background knowledge for /vibe:setup when scaffolding an Expo / React Native phone app and for /vibe:conduct when building one.
user-invocable: false
---

# Expo scaffold — the canonical phone-app shape

This is the shape `/vibe:setup` scaffolds for an Expo / React Native **phone** app (iOS, optionally Android — never web, never Expo Go) and `/vibe:conduct` builds within. The structure is proven; the versions are not pinned — resolve the current stable at scaffold time. A later end-to-end dry run follows this skill verbatim, so treat every command and file move here as load-bearing.

## Toolchain — resolve current stable at scaffold time

Look up and target the latest stable Expo SDK; the numbers below are a **July 2026 snapshot to verify, never to copy**: Expo SDK 57 (`expo@57.0.x`), React Native 0.86, React 19.2 — and SDK 55+ is New-Architecture-only (Fabric + TurboModules, no legacy bridge). Rules that do not rot:

- **bun is the package runtime.** Install and run through bun (`bun install`, `bun run …`, `bunx …`).
- **Expo and React Native packages are added only via `bunx expo install`** — it picks the version pinned to the resolved SDK. Never hand-pick an `expo-*` / `react-native-*` version in `package.json`.
- **Record what you resolved.** The generated project's `CLAUDE.md` states the SDK, RN, and React versions you actually resolved and the build / test / run commands — as a snapshot to re-verify, not a pin the next session copies.

## Scaffold recipe

Path: `create-expo-app` default template → its `reset-project` script → reshape. The end state:

- **Routes live in `src/app`**, auto-detected by Expo Router; `"main": "expo-router/entry"` in `package.json`.
- **`@/*` path alias** → `./src/*`, so app code imports `@/…` not deep relative paths.
- **Typed `app.config.ts`** (replacing `app.json`) branching on `EXPO_PUBLIC_APP_ENV`.
- **Strict `tsconfig.json`** extending `expo/tsconfig.base` with `strict: true`.
- **Phones only.** Web support is stripped: no `react-native-web` / `react-dom` / `@expo/metro-runtime`, no `web` config key, no web platform entry, no `favicon`.
- **Dev client from day one.** `expo run:ios` (and `expo run:android` when Android is selected) build the dev client; **never Expo Go**.
- **Standalone single-bun-package repo.** A monorepo is an escape hatch documented for later, not scaffolded now.

Setup asks **one additional Expo-specific clarify question** on top of setup.md's gap questions: **iOS-first, or iOS + Android.** The answer decides whether `expo run:android` and the Android package id are wired and whether the Android Metro caveat applies.

Done-signal: `bun run typecheck` is green, `src/app` holds the routes, no `app.json` and no web artifacts remain. Exact reshape moves, the typed `app.config.ts`, and precisely what to delete for phones-only: [scaffold-recipe.md](references/scaffold-recipe.md).

## Baseline

Each item ships with its verifiable done-signal. Worked code for every one of these: [tooling-patterns.md](references/tooling-patterns.md).

- **dayjs behind one pre-extended util module** (`src/lib/date.ts` extends its plugins once and re-exports `dayjs`). Done: every date call imports `dayjs` from that module; the `dayjs` package is imported nowhere else.
- **TanStack Query in the provider tree.** Done: a `QueryClientProvider` wraps the app (outermost in the AppProvider nesting below) and a `useQuery` typechecks.
- **t3-env + zod `src/env.ts`** with `clientPrefix: "EXPO_PUBLIC_"`. Raw `process.env` is **banned outside build-time config** (`src/env.ts`, `app.config.ts`). Done: `import { env } from "@/env"` typechecks and lint flags any raw `process.env` access elsewhere.
- **No state manager.** `zustand` is the pre-decided pick **named, not installed** — reach for it only when genuinely global client state appears. Done: no state library in `package.json`; the escape hatch is documented, not wired.
- **ESLint (`eslint-config-expo` flat) + Prettier with `@ianvs/prettier-plugin-sort-imports`.** Done: `bun run lint` and the Prettier check pass on the baseline.
- **`no-restricted-imports` bans `runOnJS`** in favor of `scheduleOnRN` from `react-native-worklets`. Done: importing `runOnJS` fails lint with a message pointing at `scheduleOnRN`.
- **jest-expo + `@testing-library/react-native`** with one passing example test. Done: `bun run test` is green.
- **React Compiler on — verify, don't add.** The default template is expected to ship `experiments.reactCompiler` and typed routes; compiler lint rules arrive via `eslint-config-expo`'s `react-hooks` v7 preset (`react-hooks/*` rule ids). Do **not** install the stale standalone `eslint-plugin-react-compiler` (retired on SDK 55+). No manual `useMemo` / `useCallback` / `React.memo`. Done: the resolved config has `reactCompiler` enabled, `react-hooks/*` rules are active, and no manual memo appears in scaffolded code.
- **`ds/` tokens module** — color / space / radius / typography, a single barrel, plain `StyleSheet` (no nativewind / tamagui). Done: `src/ds` exports one barrel plus a use hook, and screens read tokens through it.
- **AppProvider nesting** — Query > GestureHandlerRootView > SafeAreaProvider — plus an **exported `ErrorBoundary`** in the root `_layout.tsx`. Done: the root layout nests those three in that order and exports `ErrorBoundary`.

Two escape hatches are **documented, not scaffolded**: `zustand` when genuinely global client state appears, and monorepo metro wiring when a workspace appears.

## Dependencies

Route to the re-exported expert skills by their **namespaced `plugin:skill` ids** instead of guessing — two upstreams ship a skill with the identical name `react-native-best-practices`, so bare names are ambiguous:

- **`expo` plugin** (Expo official) — SDK, Expo Router, and EAS specifics; it also ships the hosted Expo MCP server that auto-loads for consumers.
- **`callstack-react-native:react-native-best-practices`** — performance: FPS, TTI, bundle size, memory.
- **`swmansion-react-native:react-native-best-practices`** — New-Architecture patterns: Reanimated, worklets, Fabric.
- **`vercel-react-native:vercel-react-native-skills`** — React Native / Expo best practices.

## Argent

The project is argent-wired at scaffold time so the running app is verifiable: `argent init -y`, an `.mcp.json` stdio entry, and vendored argent skills. The dev-client + Metro requirements and the boot → launch → screenshot → component-tree verify loop: [verification.md](references/verification.md).

## Guardians

The overlay ships four read-only review agents the review / conduct flow dispatches: `vibe-expo:expo-ui-performance` (re-render discipline, worklet thread correctness, list virtualization), `vibe-expo:expo-testability` (logic in testable hooks, effects behind injectable seams), `vibe-expo:expo-release` (app config / eas.json / prebuild coherence), `vibe-expo:expo-a11y` (labels, dynamic type, contrast, reduced motion). `/vibe:review`, `/vibe:quick-check`, and conduct's review step dispatch the ones matching the changed files.

## Self-check

A scaffolded project is done when: the dev client builds clean for each selected platform; the example test and `bun run typecheck` are green; an argent screenshot plus component tree show the hello screen; `CLAUDE.md` records the resolved versions and the build / test / run commands; `.claude/settings.json` matches setup.md's canonical shape (VIBE marketplace registered, `vibe` + `vibe-expo` enabled); and no web artifacts remain.
