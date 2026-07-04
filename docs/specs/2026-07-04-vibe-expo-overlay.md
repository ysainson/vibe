# vibe-expo — the Expo / React Native overlay

**Date:** 2026-07-04 · **Status:** approved · **Builds with:** /vibe:conduct (this repo)

## Goal

Add a `vibe-expo` overlay plugin so `/vibe:setup` can scaffold a fresh, phone-only Expo app
(latest SDK, Expo Router, dev client, argent-verified running) and `/vibe:conduct` can build
within it — mirroring `vibe-swift`'s shape exactly: no commands, four read-only guardian
agents, one hidden scaffold-knowledge skill, pinned expert-skill dependencies, and the core
command wiring that dispatches the guardians.

## Locked decisions

- **Name/scope:** `vibe-expo`. Expo-first: SDK + Expo Router + EAS assumed. Bare RN out of scope.
- **Scaffold recipe:** `create-expo-app` default template → its `reset-project` script →
  iris-style reshape (routes in `src/app`, `@/*` alias, typed `app.config.ts`, strict tsconfig).
- **Phones only:** web support stripped (no `react-native-web`/`react-dom`, no web config).
  At scaffold time, setup asks one clarify question: **iOS-first or iOS + Android**.
- **Dev client from day one:** `expo run:ios` (and `run:android` when selected); never Expo Go.
- **Tooling baseline:** dayjs behind one pre-extended util module; TanStack Query in the provider
  tree; t3-env + zod `src/env.ts` (`EXPO_PUBLIC_` prefix, raw `process.env` banned outside
  build-time config). **No state manager** — the skill names zustand as the pre-decided pick
  when genuinely global client state appears.
- **Quality baseline:** ESLint (eslint-config-expo flat) + Prettier with @ianvs import sort;
  `no-restricted-imports` banning `runOnJS` in favor of `scheduleOnRN` from
  `react-native-worklets`; jest-expo + @testing-library/react-native with one passing example
  test; React Compiler on (`experiments.reactCompiler` + eslint-plugin-react-compiler, no manual
  `useMemo`/`useCallback`/`React.memo`); typed routes on.
- **App shape:** `ds/` tokens module (color/space/radius/typography, single barrel, plain
  StyleSheet — no nativewind/tamagui); AppProvider nesting (Query > GestureHandlerRootView >
  SafeAreaProvider) + exported `ErrorBoundary` in the root `_layout.tsx`. Standalone single-bun-
  package repo; monorepo/metro wiring documented for later, not scaffolded.
- **Skill dependencies (4):** expo/skills (official), callstackincubator/agent-skills,
  vercel-labs/agent-skills, software-mansion-labs/skills — pinned ref+sha like the swift deps,
  subject to the mechanism verification in task 1.
- **Done check:** argent-verified running app — `argent init -y` in the new project, simulator
  booted via argent, dev client built, screenshot + component tree proving the hello screen,
  tests + typecheck green.
- **Guardians (4):** `expo-ui-performance`, `expo-testability`, `expo-release`, `expo-a11y`.

## Deliverables

### 1. `plugins/vibe-expo/.claude-plugin/plugin.json`

Exactly the five vibe-swift fields: `name: "vibe-expo"`, one-paragraph `description` (guardians
shipped + carries the scaffold knowledge /vibe:setup uses + resolve-latest-at-scaffold-time
promise), `version: "1.0.0"`, `author: { "name": "ysainson" }`, `dependencies: [...]` — bare
plugin names of re-exports in this marketplace (final list depends on task 1's verified
mechanism; verify each repo's marketplace-id / plugin-name / SKILL-name triple before wiring,
per the swiftui-expert three-name trap).

### 2. `skills/expo-scaffold/SKILL.md` + `references/`

Frontmatter: `name: expo-scaffold`, `user-invocable: false`, and a `description` that states the
canonical project shape **and** carries the routing sentence: "Background knowledge for
/vibe:setup when scaffolding an Expo / React Native phone app and for /vibe:conduct when
building one."

Body sections (contracts, not recipes — per vibe:fable-safe-authoring):

- **Toolchain — resolve current stable at scaffold time.** Versions appear only as a dated
  snapshot to verify, never to copy (July 2026: Expo SDK 57 / `expo@57.0.x`, RN 0.86,
  React 19.2; SDK 55+ is New-Architecture-only). Rules: bun is the package runtime; add
  expo/react-native packages only via `bunx expo install` (SDK-pinned versions); record resolved
  versions and build/test/run commands in the generated project's CLAUDE.md.
- **Scaffold recipe.** The template → reset-project → reshape path, with the platform clarify
  question, web strip, and the standalone-repo shape. Deep-dive:
  [scaffold-recipe.md](references/scaffold-recipe.md) — exact reshape moves (src/app, `"main":
  "expo-router/entry"`, `@/*` paths, typed `app.config.ts` branching on `EXPO_PUBLIC_APP_ENV`,
  minimal babel/metro configs, what to delete for web).
- **Baseline.** The tooling + quality + app-shape lists from Locked decisions, each item with its
  verifiable done-signal. Deep-dive: [tooling-patterns.md](references/tooling-patterns.md) —
  worked code for the dayjs module, `src/env.ts`, `ds/` tokens + hook, AppProvider +
  ErrorBoundary root layout, and the eslint rules (scheduleOnRN ban, process.env ban). Includes
  the two pre-decided escape hatches: zustand when global client state appears; monorepo metro
  wiring when a workspace appears.
- **Dependencies.** Route to the re-exported expert skills by their SKILL names (Expo official,
  Callstack RN, Vercel React, Software Mansion) "instead of guessing" — mirroring swift-scaffold's
  dependencies bullet.
- **Argent.** The project is argent-wired at scaffold time (`argent init -y`; `.mcp.json` stdio
  entry; vendored argent skills). Deep-dive: [verification.md](references/verification.md) —
  dev-client + Metro debugger requirements (Metro on 8081, `adb reverse tcp:8081 tcp:8081` on
  Android), the boot → launch → screenshot → component-tree verify loop.
- **Guardians.** Names the four namespaced agents (`vibe-expo:expo-ui-performance`, etc.) and
  that the review/conduct flow dispatches them.
- **Self-check.** Dev client builds clean for each selected platform; example test + typecheck
  green; argent screenshot + component tree show the hello screen; CLAUDE.md records resolved
  versions and commands; `.claude/settings.json` matches setup.md's canonical shape; no web
  artifacts remain.

### 3. `agents/` — four guardians

All follow the swift template exactly: frontmatter `name` (unprefixed), `description` ending in a
"Dispatched on/before …" clause, `tools: Read, Grep, Glob, Bash` (read-only — guardians never
modify), `model: inherit`. Body: "You review X" opening + an anti-assumption instruction
(read the actual config, resolve current versions — don't trust embedded numbers), then
"Check, with evidence:" bullets, closing with the standard verdict paragraph
("Verdict: PASS or CHANGES — lead with it. Each finding names file:line …").

- **expo-ui-performance** — re-render discipline under React Compiler (no manual memo unless
  proven), reanimated/worklets thread correctness (UI-thread work stays in worklets;
  `scheduleOnRN` not `runOnJS`), list virtualization, animation jank sources. Dispatched on
  changed `.tsx`/`.ts` touching animations, lists, gestures, or shared state in an Expo project.
- **expo-testability** — logic in testable hooks/pure functions, system effects (network,
  storage, sensors, time) behind injectable seams, testing-library idioms over snapshots,
  no untestable module-scope side effects beyond the sanctioned root-layout init. Dispatched on
  changed `.ts`/`.tsx` adding state or side effects.
- **expo-release** — app.config.ts / eas.json / config-plugin coherence, prebuild (CNG) safety
  (no manual native edits that prebuild would clobber), bundle id/scheme/entitlements per env,
  store submission requirements. Dispatched before a release or when app config, eas.json,
  config plugins, or native modules change.
- **expo-a11y** — labels/roles on touchables, dynamic type, contrast against `ds/` tokens, focus
  order, reduced-motion handling for reanimated work. Dispatched on changed screens or
  components.

### 4. Marketplace + pins

Add to `.claude-plugin/marketplace.json`: the `vibe-expo` local entry, plus pinned re-export
entries for the four skill repos ("Re-exported and pinned: <owner>/<repo> - …" description
naming vibe-expo as the dependent; `source: { github, repo, ref: <latest stable tag>, sha:
<that tag's commit sha> }`). Pins land before or with the overlay commit — a plugin.json
dependency on a missing re-export fails `claude plugin validate --strict`.

**Verified risk + fallback:** unlike AvdLee's single-plugin repos, all four are multi-plugin
marketplaces. Task 1 verifies whether a marketplace plugin entry can pin a plugin inside another
marketplace repo. If not: `dependencies` in vibe-expo's plugin.json lists only what proves
re-exportable, and the scaffold skill instead has /vibe:setup write the extra marketplaces into
the generated project's `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`,
exactly how iris consumes them — noting extraKnownMarketplaces takes ref only, no sha).

### 5. Core wiring (bumps `vibe`)

- `plugins/vibe/commands/review.md` Step 2: add the overlay line at the existing hook — in an
  Expo project (`expo` in package.json dependencies), changed `.ts`/`.tsx` dispatch
  `vibe-expo:expo-ui-performance` and `vibe-expo:expo-testability`; add `expo-a11y` when screens
  or components changed; add `expo-release` only when app config, eas.json, config plugins, or
  native modules changed. File extension alone is not the key — `.ts` is ambiguous.
- `plugins/vibe/commands/quick-check.md` step 3: quick guardian `vibe-expo:expo-ui-performance`
  for changed `.tsx` in an Expo project.
- `plugins/vibe/commands/setup.md`: extend the stack-mapping example ("Expo / React Native →
  `vibe-expo`").
- `README.md`: overlay + re-export tables.
- Bump `plugins/vibe/.claude-plugin/plugin.json` version (minor — these are feat changes).

## Build plan — numbered, test-first, one commit per task

Verification gates available: `claude plugin validate . --strict`, `bun tools/pins.ts` (drift),
`bun test`, `bun run typecheck`, plus grep-level fable-safe checks (see acceptance). Conventional
commits, no Co-Authored-By trailer, no CHANGELOG file.

1. **Spike: re-export mechanism for multi-plugin repos.** Add one trial pinned entry referencing
   a plugin inside expo/skills; the test is `claude plugin validate . --strict` output. Evidence
   decides task 2's shape and vibe-expo's `dependencies`. Ends in either the task 2 commit or a
   spec-note commit updating §4's fallback as chosen.
2. **Pin the re-exports.** marketplace.json entries for the four repos (or the verified subset),
   ref = latest stable tag, sha = that tag's commit (via `gh api`, not repo HEAD). Test: validate
   --strict green and `bun tools/pins.ts` reports no drift. Commit `chore(pins): …`.
3. **Plugin skeleton.** `plugins/vibe-expo/.claude-plugin/plugin.json` + marketplace entry.
   Test: `claude plugin validate . --strict` and `claude plugin validate ./plugins/vibe-expo
   --strict` green. Commit `feat(vibe-expo): plugin skeleton and marketplace entry`.
4. **Author `expo-scaffold` SKILL.md + three references.** Test: validate green; description
   contains the /vibe:setup routing sentence; `user-invocable: false`; fable-safe greps clean.
   Commit `feat(vibe-expo): expo-scaffold knowledge skill`.
5. **Author the four guardians.** Test: validate green; every description ends with a
   "Dispatched …" clause; `tools` exactly `Read, Grep, Glob, Bash`; `model: inherit`; verdict
   paragraph present; fable-safe greps clean. Commit `feat(vibe-expo): guardian agents`.
6. **Core wiring.** review.md, quick-check.md, setup.md, README, vibe version bump. Test:
   validate green; grep confirms the dispatch lines reference the namespaced agent ids. Commit
   `feat(vibe): dispatch vibe-expo guardians and map the Expo stack`.
7. **End-to-end dry run.** In scratch space, scaffold a throwaway app by following the skill
   verbatim (create-expo-app → reset-project → reshape → baseline → `argent init` → boot
   simulator → `expo run:ios` → argent screenshot + component tree). This is the proof the
   knowledge is executable. Feed every deviation back into the skill. Commit fixes as
   `fix(vibe-expo): …`.
8. **Release.** `bun release plugins/vibe-expo` (first release ships 1.0.0 as-is →
   `vibe-expo--v1.0.0`), then `bun release plugins/vibe` (minor). Update project memory.

## Acceptance criteria

- `claude plugin validate . --strict`, `bun test`, `bun run typecheck`, `bun tools/pins.ts` all
  green at head.
- Fable-safe greps over `plugins/vibe-expo/`: zero hits for introspection phrasing ("explain your
  reasoning", "show your work", "think out loud"); no dated model ids; every agent description is
  a what+when trigger.
- The dry-run app ran on a simulator with an argent screenshot + component tree as evidence, and
  its CLAUDE.md records resolved versions and commands.
- Tags `vibe-expo--v1.0.0` and the bumped `vibe--v1.x.0` exist with generated release notes.

## Out of scope

Bare (non-Expo) React Native projects; web/desktop targets; Vega; a client state manager;
monorepo scaffolding; changes to the conduct skill (it picks up guardians via the scaffold
skill's Guardians section and the review commands, by design).
