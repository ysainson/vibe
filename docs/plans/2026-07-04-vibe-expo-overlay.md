# vibe-expo Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `vibe-expo` overlay plugin (4 guardians + hidden `expo-scaffold` skill + pinned re-exports + core wiring) so `/vibe:setup` scaffolds phone-only Expo apps and `/vibe:conduct` builds within them.

**Architecture:** Mirrors the `vibe-swift` overlay: no commands, read-only guardian agents, one hidden scaffold-knowledge skill, `dependencies` on re-exports pinned in this marketplace. New: tagless branch-head pins (ref=`main` + sha) carried by an extended `tools/pins.ts`, and a path-scoped release log in `tools/release.ts`.

**Tech Stack:** Markdown + JSON plugin manifests; Bun + TypeScript sidecar (`tools/`); `claude` CLI + `gh` for probes; argent MCP for the dry run.

**Normative source:** `docs/specs/2026-07-04-vibe-expo-overlay.md` (committed, review-plan hardened). Where this plan compresses, the spec section cited is the contract.

## Global Constraints

- Conventional commits, one commit per task, **no Co-Authored-By trailer**, no CHANGELOG file.
- Gates at every task: `claude plugin validate . --strict` (schema only — resolves nothing remote), `bun test`, `bun run typecheck`.
- `bun tools/pins.ts --dry-run` and `bun tools/release.ts <dir> --yes` are the only non-interactive forms — bare commands open clack prompts (doer shells are non-TTY).
- Fable-safe authoring (spec §Acceptance): zero hits in `plugins/vibe-expo/` for "explain your reasoning" / "show your work" / "think out loud"; no dated model ids; every agent description is a what+when trigger.
- All four upstream repos are **tagless** with default branch `main`: pins are ref=`main`, sha=branch-head at pin time. There is no stable tag to prefer.
- `git-subdir` source shape: `{"source": "git-subdir", "url": "<owner>/<repo>", "path": "<subdir>", "ref": "main", "sha": "<head>"}`. A `github` source with a bolted-on `path` silently installs the repo root with zero skills — never use it.
- Bun always (never npm/yarn/pnpm) for the sidecar; `bunx` for scaffold commands in the dry run.

---

### Task 1: Spike — re-export install matrix

**Files:**
- Create: `docs/evidence/vibe-expo/spike.md`
- Modify: `docs/specs/2026-07-04-vibe-expo-overlay.md` (§4 table — outcome column)

**Interfaces:**
- Produces: per-upstream verdict {entry shape that installs, skills listed by `claude plugin details`, naming freedom for inline entries} → fixes Task 3's entries and Task 4's `dependencies` list.

- [ ] **Step 1:** Scratch env: `export CLAUDE_CONFIG_DIR=$(mktemp -d)`; copy this marketplace to a scratch dir; work there. Never touch the real `~/.claude`.
- [ ] **Step 2 (expo/skills):** add entry `{"name": "expo", "source": {"source": "git-subdir", "url": "expo/skills", "path": "plugins/expo", "ref": "main", "sha": <gh api repos/expo/skills/commits/main --jq .sha>}}`; `claude plugin marketplace add <scratch-mp>`; `claude plugin install expo@<mp-name>`; oracle: exit 0 + `claude plugin details` lists the expected skills (18 at last probe) + cache dir content matches the pinned sha's tree.
- [ ] **Step 3 (callstack):** entry named by us (test naming freedom — use `callstack-react-native`) over a pinned remote source declaring skills inline (their marketplace declares five inline plugins with `source: "./"` + `skills` arrays — enumerate their repo first to find the `react-native-best-practices` skill paths). Try `github` source + `skills` array; if zero skills install, try `git-subdir` variants. Same oracle.
- [ ] **Step 4 (swmansion):** entry `swmansion-react-native` over `software-mansion-labs/skills` (single inline plugin, no skills enumeration upstream) — determine whether skills auto-discover or need explicit `skills` paths. Same oracle.
- [ ] **Step 5 (vercel):** entry `vercel-react-native` over `vercel-labs/agent-skills` (not a Claude marketplace; skills.sh layout) — explicit `skills` path to the `vercel-react-native-skills` skill dir (NOT `vercel-react-best-practices`). Same oracle.
- [ ] **Step 6:** Record per-upstream: entry JSON used, install exit code, `details` skill list, verdict PASS/FAIL → `docs/evidence/vibe-expo/spike.md`. Update spec §4 table outcomes. Any FAIL ⇒ that upstream is dropped from `dependencies` (Task 4) and becomes a reference link in the skill (Task 5).
- [ ] **Step 7:** Commit: `docs(specs): vibe-expo re-export matrix results`

### Task 2: Tools to carry the pins (test-first)

**Files:**
- Modify: `tools/pins.ts`, `tools/pins.test.ts`, `tools/release.ts`
- Create: `tools/release-log.ts`, `tools/release-log.test.ts`, `tools/deps.ts`, `tools/deps.test.ts`

**Interfaces (locked — tests are written against these):**
```ts
// pins.ts — extended
export type Reexport = {
  name: string; repo: string; ref: string; sha: string;
  kind: "github" | "git-subdir"; path?: string;          // repo ⟵ source.repo (github) | source.url (git-subdir)
};
export function parseReexports(marketplace: { plugins?: unknown[] }): Reexport[]; // now returns both kinds
export function isBranchPin(ref: string): boolean;        // !isStableTag(ref) — "main" → true, "v6.1.1" → false
export type Upstream =
  | { kind: "unreachable" }                                // gh api non-zero
  | { kind: "no-stable-tags" }                             // tag fetch ok, none stable
  | { kind: "latest-tag"; tag: string; sha: string }
  | { kind: "branch-head"; sha: string };
export type PinReport =
  | { status: "current" }
  | { status: "behind"; latest: { tag: string; sha: string } }  // tag pins only — the only auto-bumpable state
  | { status: "drift"; headSha: string }                        // branch pins only — informational, exit 0, never bumped by --yes
  | { status: "unreachable" }                                   // fail closed: exit 1
  | { status: "no-stable-tags" };                               // fail closed: exit 1, distinct message
export function reportPin(pin: Reexport, upstream: Upstream): PinReport;

// release-log.ts — pure (the version.ts/notes.ts pattern)
export function releaseLogArgs(range: string, pluginDir: string): string[];
// → ["log", range, "--format=%s", "--no-merges", "--", pluginDir]

// deps.ts — pure
export function unresolvedDeps(
  plugins: { name: string; dependencies?: string[] }[],
  marketplaceNames: string[],
): { plugin: string; dependency: string }[];
```

- [ ] **Step 1: Write the failing tests.** In `tools/pins.test.ts` add: parseReexports returns a git-subdir entry `{name, repo: <url>, ref: "main", sha, kind: "git-subdir", path}` alongside github ones (existing assertions gain `kind: "github"`); `isBranchPin("main")===true`, `isBranchPin("v6.1.1")===false`, `isBranchPin("4.0.0")===false`; `reportPin` matrix — branch pin + matching head → current; branch pin + different head → drift (never behind); tag pin + newer tag → behind; tag pin + same tag → current; any pin + unreachable → unreachable; tag pin + no-stable-tags → no-stable-tags. New `tools/release-log.test.ts`: exact array shape. New `tools/deps.test.ts`: `unresolvedDeps` unit cases (bogus dep detected; empty/missing dependencies tolerated) + integration: every real `plugins/*/.claude-plugin/plugin.json` dependency resolves against real `.claude-plugin/marketplace.json` names.
- [ ] **Step 2: Run to verify RED.** `bun test` — new assertions fail (missing exports / modules). Capture output.
- [ ] **Step 3: Implement.** `pins.ts`: extend parse; add `isBranchPin`/`reportPin`; replace `latestTag` IO with an upstream fetch that distinguishes unreachable vs no-stable-tags and queries `gh api repos/<repo>/commits/<ref> --jq .sha` for branch pins; main flow prints per-pin status (drift line marked informational), exits 1 listing unreachable/no-stable-tags pins distinctly, and offers updates (interactive or `--yes`) **only** for `behind` rows. `release.ts`: use `releaseLogArgs(range, pluginDir)`. `deps.ts`: implement. No behavior change for existing tag pins.
- [ ] **Step 4: Run to verify GREEN.** `bun test` all pass; `bun run typecheck` clean; `bun tools/pins.ts --dry-run` exits 0 against current marketplace (all tag pins, all reachable).
- [ ] **Step 5: Commit:** `feat(tools): git-subdir + branch-head pins, fail-closed drift check, path-scoped release log, deps-resolution gate`

### Task 3: Pin the re-exports

**Files:**
- Modify: `.claude-plugin/marketplace.json`, `docs/evidence/vibe-expo/spike.md` (append re-probe outputs)

**Interfaces:**
- Consumes: Task 1's proven entry shapes + naming; Task 2's pins tooling.
- Produces: marketplace entry names (`expo`, `callstack-react-native`, `swmansion-react-native`, `vercel-react-native` — or the Task-1-proven subset/renames) → Task 4's `dependencies`, Task 5's namespaced skill ids.

- [ ] **Step 1:** Add one entry per PASS upstream, description "Re-exported and pinned: <owner>/<repo> - …" naming vibe-expo as the dependent; the expo entry's description names the hosted `https://mcp.expo.dev/mcp` MCP server it auto-loads. sha = `gh api repos/<r>/commits/main --jq .sha` at pin time.
- [ ] **Step 2:** Gates: `claude plugin validate . --strict` green; `bun tools/pins.ts --dry-run` exit 0 (drift informational); `bun test` green; one scratch-config install probe per new entry, outputs appended to `docs/evidence/vibe-expo/spike.md`.
- [ ] **Step 3:** Commit: `chore(pins): pin expo/callstack/swmansion/vercel re-exports for vibe-expo`

### Task 4: Plugin skeleton

**Files:**
- Create: `plugins/vibe-expo/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json` (local `vibe-expo` entry)

- [ ] **Step 1:** plugin.json with exactly the five vibe-swift fields: name `vibe-expo`; one-paragraph description (guardians shipped + carries the scaffold knowledge /vibe:setup uses + resolve-latest-at-scaffold-time promise); version `1.0.0`; author `{"name": "ysainson"}`; `dependencies` = the Task-3 entry names (bare plugin names). Marketplace entry mirrors vibe-swift's.
- [ ] **Step 2:** Gates: `claude plugin validate . --strict` AND `claude plugin validate ./plugins/vibe-expo --strict` green; `bun test` green (deps.test.ts is the gate that proves the names resolve).
- [ ] **Step 3:** Commit: `feat(vibe-expo): plugin skeleton and marketplace entry`

### Task 5: Author `expo-scaffold` skill

**Files:**
- Create: `plugins/vibe-expo/skills/expo-scaffold/SKILL.md`, `.../references/scaffold-recipe.md`, `.../references/tooling-patterns.md`, `.../references/verification.md`

Content contract = spec §2 verbatim (sections: Toolchain / Scaffold recipe / Baseline / Dependencies / Argent / Guardians / Self-check; contracts not recipes; versions only as dated snapshots to verify). Pattern: `plugins/vibe-swift/skills/swift-scaffold/`.

- [ ] **Step 1:** Author SKILL.md — frontmatter `name: expo-scaffold`, `user-invocable: false`, description with canonical shape + the routing sentence "Background knowledge for /vibe:setup when scaffolding an Expo / React Native phone app and for /vibe:conduct when building one."
- [ ] **Step 2:** Author the three references per spec §2 deep-dive lists (worked code lives in references, not SKILL.md).
- [ ] **Step 3:** Gates: validate green; `grep -c "user-invocable: false"` =1 and routing-sentence grep hits in SKILL.md; fable-safe greps zero hits; dependency routing uses namespaced `plugin:skill` ids from Task 3.
- [ ] **Step 4:** Commit: `feat(vibe-expo): expo-scaffold knowledge skill`

### Task 6: Author the four guardians

**Files:**
- Create: `plugins/vibe-expo/agents/expo-ui-performance.md`, `expo-testability.md`, `expo-release.md`, `expo-a11y.md`

Uniform template (spec §3): frontmatter `name` unprefixed, `description` ending in a "Dispatched on/before …" clause, `tools: Read, Grep, Glob, Bash`, `model: inherit`. Body: "You review X" opening + anti-assumption line (read actual config, resolve current versions) + "Check, with evidence:" bullets + standard verdict paragraph. Content per spec §3's four bullets. Pattern: `plugins/vibe-swift/agents/swift-concurrency.md`.

- [ ] **Step 1:** Author all four.
- [ ] **Step 2:** Gates: validate green; per-file greps — `^tools: Read, Grep, Glob, Bash$`, `^model: inherit$`, description ends "Dispatched …", "Verdict: PASS or CHANGES" present; fable-safe greps zero hits.
- [ ] **Step 3:** Commit: `feat(vibe-expo): guardian agents`

### Task 7: Core wiring (bumps vibe)

**Files:**
- Modify: `plugins/vibe/commands/review.md`, `plugins/vibe/skills/conduct/SKILL.md`, `plugins/vibe/commands/quick-check.md`, `plugins/vibe/commands/setup.md`, `README.md`

- [ ] **Step 1:** review.md Step 2 overlay block: Expo line (detect `expo` in package.json dependencies — extension alone is ambiguous): changed `.ts`/`.tsx` → `vibe-expo:expo-ui-performance` + `vibe-expo:expo-testability`; +`expo-a11y` when screens/components changed; +`expo-release` only when app config / eas.json / config plugins / native modules changed. Add the not-installed guard to BOTH the expo and the existing swift lines: if the overlay isn't installed, say so and skip its guardians.
- [ ] **Step 2:** conduct SKILL.md step 5: one line — also dispatch the enabled stack overlay's guardians matching the changed files, per review.md's overlay table.
- [ ] **Step 3:** quick-check.md step 3: `vibe-expo:expo-ui-performance` for changed `.tsx` in an Expo project (same guard). setup.md: stack-mapping example gains "Expo / React Native → `vibe-expo`". README: `vibe-expo` overlay section mirroring vibe-swift's; extend the "Third-party, re-exported and pinned…" paragraph; update Status enumeration.
- [ ] **Step 4:** Gates: validate green; grep confirms namespaced agent ids in review.md/quick-check.md/conduct SKILL.md and guard text in review.md + quick-check.md. No manual version bump (release computes it).
- [ ] **Step 5:** Commit: `feat(vibe): dispatch vibe-expo guardians and map the Expo stack`

### Task 8: End-to-end dry run

**Files:**
- Create: `docs/evidence/vibe-expo/dry-run/` (screenshot, component-tree text, generated CLAUDE.md copy)
- Possibly modify: `plugins/vibe-expo/skills/expo-scaffold/*` (deviation fixes)

- [ ] **Step 1:** In `~/tmp/vibe-expo-dryrun/` (outside this repo), follow the committed skill **verbatim**: create-expo-app → reset-project → reshape → baseline → `argent init -y` → boot simulator via argent → `expo run:ios` (backgrounded / extended timeout — it exceeds default command timeouts) → argent screenshot + component tree of the hello screen; `bun test` (jest example) + typecheck green in the generated app.
- [ ] **Step 2:** Bounded loop — at most three deviation-fix cycles; each cycle = one `fix(vibe-expo): …` commit against the skill. Anything still deviating after three → recorded in the spec as a known gap.
- [ ] **Step 3:** Evidence commit (even on a zero-deviation run): `docs(evidence): vibe-expo dry run`

### Task 9: Release

- [ ] **Step 1:** Full gates at head: validate --strict, `bun test`, `bun run typecheck`, `bun tools/pins.ts --dry-run`, fable-safe greps.
- [ ] **Step 2:** Independent fresh-context verify (vibe:verifier, spec + final diff only) — PASS required.
- [ ] **Step 3:** Merge `vibe-expo-overlay` → `main`.
- [ ] **Step 4:** `bun release plugins/vibe-expo --yes` (first release ships 1.0.0 as-is → tag `vibe-expo--v1.0.0`), then `bun release plugins/vibe --yes` (minor from `feat(vibe):`; notes path-scoped to vibe's own commits via Task 2).
- [ ] **Step 5:** Verify tags exist with scoped notes; update project memory.
