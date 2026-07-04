# vibe-expo — the Expo / React Native overlay

**Date:** 2026-07-04 · **Status:** approved · review-plan r1+r2 applied, verdict ready 2026-07-04 · **Builds with:** /vibe:conduct (this repo)

## Goal

Add a `vibe-expo` overlay plugin so `/vibe:setup` can scaffold a fresh, phone-only Expo app
(latest SDK, Expo Router, dev client, argent-verified running) and `/vibe:conduct` can build
within it — following the `vibe-swift` overlay pattern: no commands, read-only guardian
agents (vibe-swift ships three; vibe-expo ships four), one hidden scaffold-knowledge skill,
pinned expert-skill dependencies, and the core command wiring that dispatches the guardians.

## Locked decisions

- **Name/scope:** `vibe-expo`. Expo-first: SDK + Expo Router + EAS assumed. Bare RN out of scope.
- **Scaffold recipe:** `create-expo-app` default template → its `reset-project` script →
  reshape to: routes in `src/app`, `@/*` alias, typed `app.config.ts`, strict tsconfig.
  (This is the shape iris uses; iris is a private external repo — the list here is the
  normative content, not the citation.)
- **Phones only:** web support stripped (no `react-native-web`/`react-dom`, no web config).
  At scaffold time, setup asks one **additional Expo-specific** clarify question (on top of
  setup.md's existing gap questions): **iOS-first or iOS + Android**.
- **Dev client from day one:** `expo run:ios` (and `run:android` when selected); never Expo Go.
- **Tooling baseline:** dayjs behind one pre-extended util module; TanStack Query in the provider
  tree; t3-env + zod `src/env.ts` (`EXPO_PUBLIC_` prefix, raw `process.env` banned outside
  build-time config). **No state manager** — the skill names zustand as the pre-decided pick
  when genuinely global client state appears.
- **Quality baseline:** ESLint (eslint-config-expo flat) + Prettier with @ianvs import sort;
  `no-restricted-imports` banning `runOnJS` in favor of `scheduleOnRN` from
  `react-native-worklets`; jest-expo + @testing-library/react-native with one passing example
  test; React Compiler on — **verify, don't add**: the SDK 57 default template already ships
  `experiments.reactCompiler` and typed routes enabled, and the compiler lint rules arrive via
  eslint-config-expo's `react-hooks` v7 preset (`react-hooks/*` rule ids — do **not** install
  the stale standalone `eslint-plugin-react-compiler`, which Expo's docs retire on SDK 55+).
  No manual `useMemo`/`useCallback`/`React.memo`.
- **App shape:** `ds/` tokens module (color/space/radius/typography, single barrel, plain
  StyleSheet — no nativewind/tamagui); AppProvider nesting (Query > GestureHandlerRootView >
  SafeAreaProvider) + exported `ErrorBoundary` in the root `_layout.tsx`. Standalone single-bun-
  package repo; monorepo/metro wiring documented for later, not scaffolded.
- **Skill dependencies (4 upstreams targeted, best-effort — see §4 for per-repo shapes):**
  expo/skills, callstackincubator/agent-skills, vercel-labs/agent-skills,
  software-mansion-labs/skills — pinned ref+sha, mechanism per §4. The final `dependencies`
  list is whatever task 1 proves re-exportable; any upstream that fails the install probe
  becomes a plain reference link in the skill instead (facts verified 2026-07-04).
- **Done check:** argent-verified running app — `argent init -y` in the new project, simulator
  booted via argent, dev client built, screenshot + component tree proving the hello screen,
  tests + typecheck green.
- **Guardians (4):** `expo-ui-performance`, `expo-testability`, `expo-release`, `expo-a11y`.

## Deliverables

### 1. `plugins/vibe-expo/.claude-plugin/plugin.json`

Exactly the five vibe-swift fields: `name: "vibe-expo"`, one-paragraph `description` (guardians
shipped + carries the scaffold knowledge /vibe:setup uses + resolve-latest-at-scaffold-time
promise), `version: "1.0.0"`, `author: { "name": "ysainson" }`, `dependencies: [...]` — bare
plugin names of re-exports in this marketplace (final list fixed by task 1's install matrix;
verify each repo's marketplace-id / plugin-name / SKILL-name triple before wiring, per the
swiftui-expert three-name trap). **`claude plugin validate --strict` does not check that
dependency names resolve** (verified on 2.1.201: it schema-checks the field's type only;
resolution surfaces as `dependency-unsatisfied` at install/enable time) — the gate for this is
the deps-resolution repo test in task 2.

### 2. `plugins/vibe-expo/skills/expo-scaffold/SKILL.md` + `references/`

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
- **Dependencies.** Route to the re-exported expert skills by **namespaced plugin:skill ids with
  a purpose gloss** — two upstreams ship a skill with the identical frontmatter name
  `react-native-best-practices`, so bare SKILL names are ambiguous. Route as:
  Expo official (`<expo-reexport>` — SDK/Router/EAS specifics), Callstack's
  react-native-best-practices (performance: FPS/TTI/bundle/memory), Software Mansion's
  react-native-best-practices (New-Architecture patterns: Reanimated/worklets/Fabric), and
  Vercel's **`vercel-react-native-skills`** (not `vercel-react-best-practices`, which is
  Next.js/web) — "instead of guessing", mirroring swift-scaffold's dependencies bullet. Exact
  namespace prefixes are fixed by the entry names task 3 pins.
- **Argent.** The project is argent-wired at scaffold time (`argent init -y`; `.mcp.json` stdio
  entry; vendored argent skills). Deep-dive: [verification.md](references/verification.md) —
  dev-client + Metro debugger requirements (Metro on 8081, `adb reverse tcp:8081 tcp:8081` on
  Android), the boot → launch → screenshot → component-tree verify loop.
- **Guardians.** Names the four namespaced agents (`vibe-expo:expo-ui-performance`, etc.) and
  that the `/vibe:review` / `/vibe:quick-check` commands and conduct's review step dispatch them
  (per the §5 wiring).
- **Self-check.** Dev client builds clean for each selected platform; example test + typecheck
  green; argent screenshot + component tree show the hello screen; CLAUDE.md records resolved
  versions and commands; `.claude/settings.json` matches setup.md's canonical shape; no web
  artifacts remain.

### 3. `agents/` — four guardians

The guardian template (the swift agents approximate it with drift — swift-signing opens "You
pre-flight", swift-testability lacks the anti-assumption line; the expo four implement it
uniformly): frontmatter `name` (unprefixed), `description` ending in a "Dispatched on/before …"
clause, `tools: Read, Grep, Glob, Bash` (review-only **by instruction** — Bash is for running
builds/tests as evidence, never edits), `model: inherit`. Body: "You review X" opening + an
anti-assumption instruction (read the actual config, resolve current versions — don't trust
embedded numbers), then "Check, with evidence:" bullets, closing with the standard verdict
paragraph ("Verdict: PASS or CHANGES — lead with it. Each finding names file:line …").

- **expo-ui-performance** — re-render discipline under React Compiler (no manual memo unless
  proven — a review judgment, not a lint signal: no `react-hooks/*` rule bans adding memo;
  `react-hooks/preserve-manual-memoization` only guards *existing* memo the compiler cannot
  preserve), reanimated/worklets thread correctness (UI-thread
  work stays in worklets; `scheduleOnRN` not `runOnJS`), list virtualization, animation jank
  sources. Dispatched on changed `.tsx`/`.ts` touching animations, lists, gestures, or shared
  state in an Expo project.
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

**Per-repo facts (verified 2026-07-04 via `gh api`; all four repos have zero tags and zero
releases, and `main` as default branch):**

| repo | shape | what we want |
|------|-------|--------------|
| expo/skills | marketplace `expo-plugins`; one real plugin `expo` at `plugins/expo` (has plugin.json, v1.5.1) + 3 deprecated aliases. **Ships `.mcp.json` → the hosted `https://mcp.expo.dev/mcp` MCP server, which auto-loads for consumers — acknowledged deliberately, name it in the entry description.** | the `expo` plugin |
| callstackincubator/agent-skills | marketplace `callstack-agent-skills`; five plugins defined **inline** (source `./` + skills arrays, no plugin.json files) | `react-native-best-practices` (performance) |
| software-mansion-labs/skills | marketplace `swmansion`; **single** inline plugin `skills` (whole repo, no plugin.json, and — unlike callstack — no skills enumeration in its entry to copy; task 1 determines whether skills auto-discover from the repo or need explicit paths) | its RN/New-Architecture skills |
| vercel-labs/agent-skills | **not a Claude marketplace** (skills.sh-style collection; no `.claude-plugin/` anywhere) | the `vercel-react-native-skills` skill |

**Pin mechanism — proven for the plugin.json case:** the documented `git-subdir` source
(`{"source": "git-subdir", "url": "<owner>/<repo>", "path": "<subdir>", "ref", "sha"}`)
installs the pinned subdirectory correctly (verified: `path: plugins/expo` resolves the plugin
with all 18 skills in an isolated `CLAUDE_CONFIG_DIR`). A `github` source with a bolted-on
`path` field **silently installs the repo root with zero skills — never use it**, and
`validate --strict` catches none of this (it passes nonexistent repos, all-zeros shas, and
unknown source fields; it validates schema only). The open question for task 1 is narrower:
the re-export shape for the three upstreams **without** a plugin.json — an entry in this
marketplace declaring the skills inline (the callstack pattern) over a pinned remote source.

Add to `.claude-plugin/marketplace.json`: the `vibe-expo` local entry, plus pinned re-export
entries ("Re-exported and pinned: <owner>/<repo> - …" description naming vibe-expo as the
dependent). **Tagless pinning recipe:** ref = `main`, sha = the branch-head commit at pin time
(`gh api repos/<r>/commits/main --jq .sha`) — there is no "latest stable tag" to use. Entry
naming: where the upstream has a plugin.json the entry keeps its name (`expo`); inline-declared
entries get non-generic names chosen by us (upstream `skills` is too generic to import as-is) —
task 1 confirms naming freedom, task 3 fixes the names.

**Fallback (per repo, not global):** any upstream whose re-export shape fails the task-1
install probe is dropped from `dependencies`, and the scaffold skill cites it as a plain
reference link instead. (The old fallback — writing upstream marketplaces into generated
projects' `extraKnownMarketplaces` — is impossible for vercel-labs, which is not a marketplace,
and unnecessary once re-exports prove out.)

### 5. Core wiring (bumps `vibe`)

- `plugins/vibe/commands/review.md` Step 2: add the overlay line at the existing hook — in an
  Expo project (`expo` in package.json dependencies), changed `.ts`/`.tsx` dispatch
  `vibe-expo:expo-ui-performance` and `vibe-expo:expo-testability`; add `expo-a11y` when screens
  or components changed; add `expo-release` only when app config, eas.json, config plugins, or
  native modules changed. File extension alone is not the key — `.ts` is ambiguous. Guard: if
  the overlay isn't installed, say so and skip its guardians instead of dispatching missing
  agent ids (the existing vibe-swift line shares this hole — fix both while there).
- `plugins/vibe/skills/conduct/SKILL.md` step 5 (Review): one added line — also dispatch the
  enabled stack overlay's guardians that match the changed files, per review.md's overlay
  table. Today conduct's review step enumerates a closed set (`reviewer-spec`,
  `reviewer-quality`), so overlay guardians never fire during conduct builds — this one line
  closes that gap for vibe-swift too and makes the Goal's "/vibe:conduct can build within it"
  true.
- `plugins/vibe/commands/quick-check.md` step 3: quick guardian `vibe-expo:expo-ui-performance`
  for changed `.tsx` in an Expo project (same not-installed guard).
- `plugins/vibe/commands/setup.md`: extend the stack-mapping example ("Expo / React Native →
  `vibe-expo`").
- `README.md`: a `vibe-expo` overlay section (mirroring the `vibe-swift` one), extend the
  re-export paragraph (line "Third-party, re-exported and pinned…"), and update the Status
  section's re-export enumeration.
- No manual version bump — `bun release` computes and commits the bump itself (task 9).

## Build plan — numbered, one commit per task, test-first where a red test can exist

Verification gates: `claude plugin validate . --strict` (**schema hygiene only** — it resolves
nothing remote and ignores `dependencies` contents), the task-2 repo tests (`bun test`:
deps-resolution + pins + release-log), `bun run typecheck`, `bun tools/pins.ts --dry-run`
(report-only — the bare command opens clack prompts when pins are behind), scratch-
`CLAUDE_CONFIG_DIR` install probes, plus grep-level fable-safe checks (see acceptance).
Authoring tasks (5, 6) gate on post-authoring checks; task 2 is strictly red-first.
Conventional commits, no Co-Authored-By trailer, no CHANGELOG file.

1. **Spike: re-export install matrix.** In a scratch `CLAUDE_CONFIG_DIR`, for each of the four
   upstreams: add a trial entry to a scratch copy of this marketplace (git-subdir for
   expo/skills; inline-skills entries over a pinned remote source for callstack / swmansion /
   vercel), `claude plugin marketplace add` + `claude plugin install`, and assert the decisive
   oracle: **install exit 0, the cache contains exactly the pinned content, and
   `claude plugin details` lists the expected skills** (validate --strict is not an oracle
   here — it passes broken entries). Also confirm entry-naming freedom for inline entries.
   Evidence lands in `docs/evidence/vibe-expo/spike.md`. Commit (its own):
   `docs(specs): vibe-expo re-export matrix results` updating §4's table with outcomes.
2. **Tooling to carry the pins (test-first).** Extend `tools/pins.ts`: parse `git-subdir`
   sources (today it only reads `source.source === "github"`), branch-head drift for tagless
   pins (pinned sha vs `gh api repos/<r>/commits/<ref>`), fail **closed** on unreachable
   upstream (today "could not reach upstream" still ends "All pins current", exit 0), and
   distinct messages for unreachable vs no-tags. **Drift semantics for branch-head pins:**
   drift is *informational* (exit 0) — on actively-pushed tagless upstreams "no drift" is only
   true at the pin instant, so the failure modes are unreachable upstream and structural
   errors, never drift itself; and branch-head pins are **excluded from any `--yes` auto-bump**
   (re-pinning one is a deliberate act that re-runs the task-1 install probe before
   committing). Path-scope `tools/release.ts`'s commit log to the plugin dir
   (`git log <range> -- <pluginDir>`) — extract the log-args into a pure helper (the
   version.ts/notes.ts pattern) and test it; stated consequence: `chore(pins):` commits touch
   only the root marketplace.json and are deliberately outside every plugin's release trail.
   Add `tools/deps.test.ts`: every `plugins/*/.claude-plugin/plugin.json` `dependencies` name
   resolves to a marketplace entry name — the mechanical gate for the three-name trap that
   validate --strict does not provide. Red tests first, then green. Commit `feat(tools): …`.
3. **Pin the re-exports.** marketplace.json entries per the task-1 matrix (subset if any repo
   failed), ref = `main`, sha = branch-head via `gh api` at pin time. Test: validate --strict
   green, extended `bun tools/pins.ts --dry-run` exits 0 with all upstreams reachable
   (branch-head drift reported informationally is not a failure), deps test green, and one
   install probe per new entry (task-1 harness re-run; outputs appended to the evidence file).
   Commit `chore(pins): …`.
4. **Plugin skeleton.** `plugins/vibe-expo/.claude-plugin/plugin.json` + marketplace entry.
   Test: validate --strict (repo + `./plugins/vibe-expo`) green and `tools/deps.test.ts` green
   (this is what actually proves the `dependencies` names resolve). Commit
   `feat(vibe-expo): plugin skeleton and marketplace entry`.
5. **Author `expo-scaffold` SKILL.md + three references.** Test: validate green; description
   contains the /vibe:setup routing sentence; `user-invocable: false`; fable-safe greps clean.
   Commit `feat(vibe-expo): expo-scaffold knowledge skill`.
6. **Author the four guardians.** Test: validate green; every description ends with a
   "Dispatched …" clause; `tools` exactly `Read, Grep, Glob, Bash`; `model: inherit`; verdict
   paragraph present; fable-safe greps clean. Commit `feat(vibe-expo): guardian agents`.
7. **Core wiring.** review.md (+ not-installed guard), conduct SKILL.md one-liner,
   quick-check.md, setup.md, README (overlay section + re-export paragraph + Status). Test:
   validate green; grep confirms the dispatch lines reference the namespaced agent ids and the
   guard text exists in review.md and quick-check.md. Commit
   `feat(vibe): dispatch vibe-expo guardians and map the Expo stack`.
8. **End-to-end dry run.** In `~/tmp/vibe-expo-dryrun/` (outside this repo), scaffold a
   throwaway app by following the skill verbatim (create-expo-app → reset-project → reshape →
   baseline → `argent init` → boot simulator → `expo run:ios` → argent screenshot + component
   tree). Budget the build: `expo run:ios` exceeds default command timeouts — run it
   backgrounded/with an extended timeout. Bounded loop: at most three deviation-fix cycles;
   each cycle feeds one `fix(vibe-expo): …` commit; anything still deviating after three goes
   into the spec as a known gap, not an endless loop. Evidence (screenshot, component-tree
   text, the generated CLAUDE.md) lands in `docs/evidence/vibe-expo/dry-run/` in its own
   commit `docs(evidence): vibe-expo dry run` — even on a clean run with zero deviation fixes.
9. **Release.** `bun release plugins/vibe-expo --yes` (first release ships 1.0.0 as-is →
   `vibe-expo--v1.0.0`; the tool bumps nothing on a first release), then
   `bun release plugins/vibe --yes` (detects minor from the `feat(vibe):` commit; with task 2's
   path-scoping the notes contain only vibe's own commits). `--yes` because conduct's doer
   shells are non-TTY — the bare command opens clack prompts. Update project memory.

## Acceptance criteria

- `claude plugin validate . --strict`, `bun test` (including `tools/deps.test.ts` and the
  extended pins + release-log tests), `bun run typecheck`, and `bun tools/pins.ts --dry-run`
  (extended: fails closed on unreachable upstreams; branch-head drift is informational, not a
  failure) all green at head.
- Every pinned re-export proved installable: `docs/evidence/vibe-expo/spike.md` records, per
  entry, the install probe output (`claude plugin details` skill list) at the pinned sha.
- Fable-safe greps over `plugins/vibe-expo/`: zero hits for introspection phrasing ("explain your
  reasoning", "show your work", "think out loud"); no dated model ids; every agent description is
  a what+when trigger.
- The dry-run app ran on a simulator, with the argent screenshot + component tree and the
  generated CLAUDE.md (resolved versions + commands) committed under
  `docs/evidence/vibe-expo/dry-run/`.
- Tags `vibe-expo--v1.0.0` and the bumped `vibe--v1.x.0` exist with generated release notes
  scoped to each plugin's own commits.

## Out of scope

Bare (non-Expo) React Native projects; web/desktop targets; Vega; a client state manager;
monorepo scaffolding. (Conduct changes are **in** scope, limited to the single overlay-guardian
dispatch line in §5 — without it, guardians only fire in `/vibe:review` / `/vibe:quick-check`,
never during conduct builds.)
