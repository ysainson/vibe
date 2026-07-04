@AGENTS.md

# myapp

An Expo Router phone app (iOS-first, dev-client, never Expo Go) scaffolded per the VIBE `vibe-expo` overlay's `expo-scaffold` skill.

## Toolchain (resolved at scaffold time — re-verify, don't copy)

- Expo SDK 57 (`expo@57.0.2`)
- React Native 0.86.0
- React 19.2.3
- TypeScript 6.0.3
- bun 1.3.14 as the package runtime and script runner

## Commands

- Install: `bun install`
- Typecheck: `bun run typecheck`
- Test: `bun run test`
- Lint: `bun run lint`
- Format check: `bunx prettier --check .`
- Run on iOS simulator (dev client, builds + installs + launches against Metro): `bunx expo run:ios`
- Start Metro only (once the dev client is installed): `bunx expo start --dev-client`

## Platforms

iOS only. No Android, no web — `expo run:android` is not wired and no `android` block exists in `app.config.ts`.

## Conventions

- Routes live in `src/app` (Expo Router auto-detects it); app code imports via the `@/*` alias (`./src/*`).
- Config is `app.config.ts` (typed, branches on `EXPO_PUBLIC_APP_ENV`) — there is no `app.json`.
- Env vars: read through `import { env } from "@/env"` (t3-env + zod). Raw `process.env` is banned outside `src/env.ts` and `app.config.ts` (lint-enforced).
- Dates: `import { dayjs } from "@/lib/date"` — the bare `dayjs` package is imported nowhere else.
- Design tokens: `import { ... } from "@/ds"` (the single barrel) — plain `StyleSheet`, no nativewind/tamagui.
- No state manager installed. Reach for `zustand` only when genuinely global client state appears.
- `runOnJS` is banned by lint; use `scheduleOnRN` from `react-native-worklets` instead.
