# Multi-runtime VIBE, phase 1 (routing + init + sharing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `vibe--v1.6.0`: one routing file decides every VIBE role's runtime/model/effort, a SessionStart hook injects the resolved table, `/vibe:init` writes it with defaults, and `share.mjs` makes `AGENTS.md` + `.agents/skills` the canonical project context for both Claude Code and Codex.

**Architecture:** Plain-node `.mjs` scripts under `plugins/vibe/scripts/` and `plugins/vibe/hooks/` (no dependencies) expose pure functions that the bun tests in `tools/` import directly, plus a thin CLI. Presets and adapter rows are literal JSON under `plugins/vibe/routing/`. The skills and commands that used to carry a hardcoded PROFILE table read the injected `<VIBE_ROUTING>` block instead. Codex-side dispatch (phase 2) and the Codex host (phase 3) get their own plans; this plan only ships the guard the hook needs for phase 2's reaper.

**Tech Stack:** Bun 1.x (`bun test`, `tsc --noEmit`), Node 24 (`.mjs`, ESM), Claude Code 2.1.278 plugin hooks, Codex CLI 0.153.2.

**Spec:** `docs/specs/2026-09-04-multi-runtime-vibe.md` (rev 7). Sections A to D and contracts 0 to 7 are this plan's scope. The spec is the authority; where this plan names a value, it is copied from the spec or ruled below.

## Global Constraints

- Bun always for tooling and tests; runtime scripts are plain node `.mjs` with zero dependencies (they run inside a user's plugin cache).
- No dated model id (`claude-<family>-<n>`, `gpt-<n>`) in any authored skill, agent, reference, or preset. The routing file and the README (dated) may name one.
- Doers never touch test files. The contract-writer never touches implementation files. Every dispatch carries the matching block from `plugins/vibe/skills/conduct/guardrails.md` verbatim.
- One commit per task; the task's contract test file lands in the same commit as its implementation, red first inside the task window.
- `bun test` and `bun run typecheck` green after every task. Baseline before task 1: 121 tests across 22 files.
- The 13 roles, verbatim: `doer`, `doer-mechanical`, `escalation`, `exploration`, `contract-writer`, `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians`, `cross-check`, `adversarial`, `plan-check`.
- The four write roles, verbatim: `doer`, `doer-mechanical`, `escalation`, `contract-writer`. Every other role is read-only, with one adapter-local exception: on `codex-agent`, `verifier` gets `workspace-write` plus the no-edit instruction.
- `contract-writer.runtime` is `claude` in every preset; the resolver rejects any other value. The three review roles (`cross-check`, `adversarial`, `plan-check`) accept only `cross`.
- Preset `model` values are limited to `default`, `sonnet`, `haiku`, `opus`, `fable`. User and project files accept any non-empty string.
- `--host` is always required by the resolver and the hook. Environment variables are never consulted for the host.
- Nothing in phase 1 writes `sandbox_workspace_write.network_access`.

## Probe results (phase 0, recorded 2026-09-20)

| Probe | Result | Where |
|---|---|---|
| P0 | Done. `codex exec --json` emits `thread.started` first; the id is its top-level `thread_id`. | `tools/fixtures/codex-exec.jsonl`, `tools/fixtures/README.md` |
| P1 | Human gate, not run. Only gates the optional whole-container symlink mode of `share apply`, which phase 1 leaves disabled. | `tools/probes/p1.sh` prepares the scratch repo |
| P2 | See `tools/probes/RESULTS.md` (Codex half run by the orchestrator; Claude half is a human gate). | `tools/probes/p2.sh` |

## Rulings made while planning (spec gaps, decided here)

1. **`cc-companion` pin.** `sendbird/codex-marketplace` has no tags (verified with `gh api`), so the pin names the plugin's own repo tag: `pin: "v1.5.0"`, `sha: "19e565151f35b328a5b9433df351bd8f3818fdc7"` (tag commit of `sendbird/cc-plugin-codex`), and the row also records `marketplace: { "repo": "sendbird/codex-marketplace", "sha": "b614ba66b8194f71a4c5e64c916a91fc2f8ee600" }`, the marketplace commit whose `plugins/cc` manifest is 1.5.0. At v1.5.0 the companion accepts `--effort low|medium|high|xhigh|max` on `task`, `review`, and `adversarial-review`, and ships `task-reserve-job` and `--job-id`. Cost if wrong: phase 3's install uses the wrong ref; contract 16 catches it.
2. **Role merge is whole-entry.** A role entry in a user or project file replaces the preset's entry for that role; a file entry must carry `runtime`, and a missing `model` or `effort` means `default`. Cost if wrong: a file that meant to override only `model` also resets `effort`; visible in the injected table.
3. **Egress at project scope.** When a project routing file exists, its `egress` is authoritative for the `doer` class; the `review` class is the union of user and project acknowledgments. Without a project file the user file applies to both classes. Cost if wrong: one extra acknowledgment question.
4. **User-scope sharing is skills only.** `share --scope user` links `~/.claude/skills` and `~/.codex/skills` into `~/.agents/skills`; it never touches `~/.claude/CLAUDE.md` or `~/.codex/AGENTS.md`. Cost if wrong: a follow-up task.
5. **The harness fakes both CLIs.** `tools/fixtures/harness.ts` puts fake `codex` and `claude` executables first on `PATH` (the spec names only `codex`); `init detect` needs both. Cost if wrong: none, superset.
6. **`resolve --cwd` is the project root.** No upward walk; the hook passes `process.cwd()`, which Claude Code sets to the project directory. Cost if wrong: a project file is missed from a subdirectory session; the table's `source` line shows it.

## File map

| File | Responsibility | Task |
|---|---|---|
| `plugins/vibe/routing/presets/{uniform,tiered,split}.json` | Literal presets, all 13 roles | 1 |
| `plugins/vibe/routing/adapters.json` | Literal adapter rows (`claude-native`, `codex-exec`, `codex-agent`, `cc-companion`, `codex-companion`) | 1 |
| `plugins/vibe/scripts/routing.mjs` | Resolver: load, merge, validate, report; CLI `resolve` | 1 |
| `tools/fixtures/harness.ts` | Temp HOME/project dirs + fake `codex`/`claude` on PATH, mode-driven | 1 |
| `tools/routing.test.ts` | Contract 1 | 1 |
| `plugins/vibe/hooks/resolve-routing.mjs` | SessionStart hook: envelope + `<VIBE_ROUTING>` block + guarded reaper spawn | 2 |
| `plugins/vibe/hooks/claude-hooks.json`, `plugins/vibe/.claude-plugin/plugin.json` | Hook wiring (`--host claude`) | 2 |
| `tools/hooks.test.ts` | Contract 2 | 2 |
| `plugins/vibe/scripts/share.mjs` | Sharing layer: `plan`, `apply`, frontmatter parser | 3 |
| `tools/fixtures/share/` | IRIS-shaped mixed layout fixture builder | 3 |
| `tools/share.test.ts`, `.gitignore` | Contract 3; `.share-backup-*.tar` ignored | 3 |
| `plugins/vibe/scripts/init.mjs` | `detect`, `write`, `bridges`, `show`, `agents-cap` | 4 |
| `tools/init.test.ts` | Contract 4 | 4 |
| `plugins/vibe/skills/init/SKILL.md`, `plugins/vibe/skills/init/agents/openai.yaml`, `plugins/vibe/commands/setup.md` | The user-only init skill; setup hands off to it | 5 |
| `tools/init-skill.test.ts` | Contract 5 | 5 |
| `plugins/vibe/skills/conduct/SKILL.md`, `plugins/vibe/commands/{review,review-plan,quick-check}.md`, `plugins/vibe/skills/profile-policy/SKILL.md`, `plugins/vibe/scripts/secret-patterns.json`, `README.md` | Consumers read the routing block; PROFILE table gone | 6 |
| `tools/{conduct-skill,review-command,review-plan-command,profile-policy}.test.ts` (edited), `tools/{quick-check-command,readme}.test.ts` (new) | Contract 6 | 6 |
| `.gitignore` (`.worktrees/`) | Phase 2 prerequisite named by the spec's task 7 | 7 |

Dependency order: 1 → {2, 4}; P2 → 3; {3, 4} → 5; {1, 2} → 6; all → 7. Tasks 2, 3, 4 have disjoint file sets and may run in parallel; so may 5 and 6.

---

### Task 1: Routing presets, adapters, resolver, fixtures harness

**Files:**
- Create: `plugins/vibe/routing/presets/uniform.json`, `plugins/vibe/routing/presets/tiered.json`, `plugins/vibe/routing/presets/split.json`
- Create: `plugins/vibe/routing/adapters.json`
- Create: `plugins/vibe/scripts/routing.mjs`
- Create: `tools/fixtures/harness.ts`
- Test: `tools/routing.test.ts`

**Interfaces:**
- Produces (`routing.mjs` exports, all pure except file reads):
  ```js
  export const ROLES = [/* the 13 roles, spec order */];
  export const REVIEW_ROLES = ["cross-check", "adversarial", "plan-check"];
  export const EDIT_ROLES = ["doer", "doer-mechanical", "escalation", "contract-writer"];
  export const PRESET_MODELS = ["default", "sonnet", "haiku", "opus", "fable"];
  export const DEFAULTS = { max_parallel: 3, task_budget_minutes: 30, task_idle_minutes: 10 };
  export class RoutingError extends Error {}
  export function loadPreset(name, presetsDir = <shipped dir>)      // validates; throws RoutingError
  export function loadAdapters(path = <shipped file>)
  export function parseSet(text)                                     // "doer=codex:default:high" | "task_budget_minutes=0" | "profile=split"
  export function resolveRouting({ host, cwd, home, profile, sets, codexConfigPath }) // → Resolved; throws RoutingError
  export function formatMarkdown(resolved)                            // the literal <VIBE_ROUTING> block
  ```
- `Resolved` shape:
  ```js
  {
    host: "claude" | "codex",
    profile: "uniform" | "tiered" | "split",
    source: "arg" | "project:<display path>" | "user:<display path>" | "default",   // what set profile
    max_parallel, task_budget_minutes, task_idle_minutes,
    sources: { profile, max_parallel, task_budget_minutes, task_idle_minutes, egress }, // each "arg" | "project:…" | "user:…" | "preset:<name>" | "default"
    egress: { openai: string[], anthropic: string[] },                      // acknowledged classes
    egressNeeded: { openai: string[], anthropic: string[] },                // classes this host's routing needs
    egressMissing: [{ provider, class: "review" | "doer", roles: string[], fatal: boolean }], // fatal only for contract-writer on a Codex host
    project: null | { install, test, disposable_paths, env_passthrough, secret_allowlist },
    roles: { [role]: { runtime, resolvedRuntime, adapter, path, mode, model, effort, source } },
    // runtime = requested (claude|codex|host|cross); resolvedRuntime = claude|codex;
    // path = "task" | "review" | "adversarial-review" | null; mode = "write" | "read-only" | "workspace-write-no-edit"
    nativeOverrides: string,   // the literal line, see below
  }
  ```
- CLI: `node plugins/vibe/scripts/routing.mjs resolve --host claude|codex [--cwd <dir>] [--profile <p>] [--set key=value ...] [--json|--markdown]`. Missing `--host` → stderr `--host is required`, exit 2. Any `RoutingError` → stderr message, exit 2. `--json` prints `Resolved`; `--markdown` prints the block; default `--markdown`.
- Harness (`tools/fixtures/harness.ts`):
  ```ts
  export type FakeMode = "ok" | "hang" | "fail" | "write" | "trap-term" | "login-out" | "no-cli";
  export function makeHarness(opts?: { mode?: FakeMode; session?: string }): {
    root: string;            // temp dir
    home: string;            // <root>/home  (HOME)
    userRoutingDir: string;  // <home>/.agents/vibe
    project: string;         // <root>/project (a git repo with one commit)
    projectRoutingDir: string; // <project>/.agents/vibe
    env: NodeJS.ProcessEnv;  // PATH with <root>/bin first, HOME=<home>, FAKE_CLI_MODE, FAKE_CLI_SESSION, FAKE_CLI_LOG
    calls(): { argv: string[]; cwd: string; env: Record<string,string>; stdin: string }[]; // every fake invocation, in order
    writeUserRouting(obj): string; writeProjectRouting(obj): string; writeCodexConfig(toml: string): string;
    cleanup(): void;
  }
  ```
  The fake `codex` (and `claude`) is a small node script at `<root>/bin/<name>` that appends `{argv,cwd,env,stdin}` as one JSON line to `FAKE_CLI_LOG`, then behaves per `FAKE_CLI_MODE`: `ok` → exits 0 (`--version` prints `codex-cli 0.153.2` / `2.1.278 (Claude Code)`; `login status` prints `Logged in using ChatGPT`; `plugin list --json` prints `{"installed":[]}`; `exec` replays `tools/fixtures/codex-exec.jsonl` with `thread_id` replaced by `FAKE_CLI_SESSION` when set, and writes `ok` to the `-o` file); `login-out` → `login status` prints `Not logged in` exit 1, everything else as `ok`; `no-cli` → the executable is not created at all; `fail` → exit 1 after logging; `hang` → sleeps until killed; `write` → creates `written.txt` in cwd then exits 0; `trap-term` → ignores SIGTERM and sleeps (phase 2 uses it).

**Values (copied from the spec, section A):**

`adapters.json`, literal:
```json
{
  "claude-native":   { "host": "claude", "runtime": "claude", "efforts": ["default"] },
  "codex-exec":      { "host": "claude", "runtime": "codex",  "efforts": ["default","minimal","low","medium","high","xhigh"], "cli": "codex 0.153" },
  "codex-agent":     { "host": "codex",  "runtime": "codex",  "efforts": ["default","minimal","low","medium","high","xhigh"] },
  "cc-companion":    { "host": "codex",  "runtime": "claude", "pin": "v1.5.0", "sha": "19e565151f35b328a5b9433df351bd8f3818fdc7",
                       "marketplace": { "repo": "sendbird/codex-marketplace", "sha": "b614ba66b8194f71a4c5e64c916a91fc2f8ee600" },
                       "paths": { "task": ["default","low","medium","high","xhigh","max"], "review": ["default","low","medium","high","xhigh","max"], "adversarial-review": ["default","low","medium","high","xhigh","max"] } },
  "codex-companion": { "host": "claude", "runtime": "codex",  "pin": "v1.0.6", "sha": "db52e28f4d9ded852ab3942cea316258ae4ef346",
                       "paths": { "task": ["default","none","minimal","low","medium","high","xhigh"], "review": ["default"], "adversarial-review": ["default"] } }
}
```

Presets (every file lists all 13 roles as `{ "runtime", "model", "effort" }`):
- `uniform`: every role `host`/`default`/`default`, except `contract-writer` → `claude`/`default`/`default` and the three review roles → `cross`/`default`/`default`.
- `tiered`: `doer` `claude`/`sonnet`; `doer-mechanical` `claude`/`haiku`; `escalation` `claude`/`opus`; `exploration` `claude`/`sonnet`; `contract-writer` `claude`/`default`; `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians` `claude`/`opus`; the three review roles `cross`/`default`; all efforts `default`.
- `split`: `doer` `codex`/`default`/`high`; `doer-mechanical` `codex`/`default`/`medium`; `escalation` `claude`/`opus`/`default`; `exploration` `claude`/`sonnet`/`default`; `contract-writer` `claude`/`default`/`default`; `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians` `claude`/`opus`/`default`; `cross-check` and `adversarial` `cross`/`default`/`default`; `plan-check` `cross`/`default`/`xhigh`.

Resolution rules:
- Precedence, highest first: `--set` args and `--profile`; project `<cwd>/.agents/vibe/routing.json`; user `<home>/.agents/vibe/routing.json`; the preset named by `profile`. No file → profile `tiered`, `source: "default"`.
- `runtime` per role: `host` → the host; `cross` → the other runtime; `claude`/`codex` literal. Review roles: any value but `cross` → `RoutingError`. `contract-writer`: any value but `claude` → `RoutingError`.
- Adapter per role: review roles → the host's companion row (`codex-companion` on Claude, `cc-companion` on Codex) with `path` `review` (cross-check), `adversarial-review` (adversarial), `task` (plan-check, read-only). Every other role by (host, resolvedRuntime): Claude+claude → `claude-native`; Claude+codex → `codex-exec`; Codex+codex → `codex-agent`; Codex+claude → `cc-companion` path `task`. No row → `RoutingError` naming role and host.
- `effort` validated against the row's `efforts`, or the row's `paths[path]` list for companion rows.
- `mode`: `write` for `EDIT_ROLES`; `read-only` otherwise; on `codex-agent` only, `verifier` → `workspace-write-no-edit`.
- `egressNeeded`: on Claude host every role whose resolvedRuntime is `codex` needs `openai`; on Codex host every role whose resolvedRuntime is `claude` needs `anthropic`. Class `review` for review roles, `doer` for all others. `egressMissing` lists needed-but-unacknowledged (provider, class, roles); `fatal: true` when the role is `contract-writer`.
- `egress` keys other than `openai`/`anthropic`, or classes other than `review`/`doer` → `RoutingError`. Ruling 3 governs inheritance.
- `project` block: allowed only in the project file (a user file carrying it → `RoutingError`); keys `install`, `test`, `disposable_paths`, `env_passthrough`, `secret_allowlist`; missing keys default to `bun install --frozen-lockfile`, `bun test`, `["node_modules", ".cache"]`, `[]`, `[]`.
- `nativeOverrides`: on Claude host the literal `claude: a dispatch model beats CLAUDE_CODE_SUBAGENT_MODEL unless CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`; on Codex host `codex: live /permissions overrides are reapplied to children; sandbox_workspace_write.network_access=<value>` where value is the `network_access` key of the `[sandbox_workspace_write]` table in `<home>/.codex/config.toml` (read with a line scanner: find the table header, then the key until the next `[`), or `unset` when absent.

`formatMarkdown` output, literal shape (display paths replace `<home>` with `~`):
```
<VIBE_ROUTING host="claude" profile="split" source="user:~/.agents/vibe/routing.json">
| role | runtime | adapter | model | effort | source |
| doer | codex | codex-exec | default | high | preset:split |
… one row per role in ROLES order, runtime = resolvedRuntime …
max_parallel: 3
task_budget_minutes: 30
task_idle_minutes: 10
egress: openai=review,doer anthropic=-
project: install="bun install --frozen-lockfile" test="bun test" disposable_paths=node_modules,.cache secret_allowlist=-
native-overrides: claude: a dispatch model beats CLAUDE_CODE_SUBAGENT_MODEL unless CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1
</VIBE_ROUTING>
```
On Codex the egress line lists `anthropic` first (`anthropic=review,doer openai=-`). An empty list prints `-`. With no project file the line is `project: none`.

- [ ] **Step 1: Contract-writer writes `tools/routing.test.ts`** (★ assertions from contract 1). Test names, each importing from `../plugins/vibe/scripts/routing.mjs` and using `makeHarness()`:
  - `presets: uniform, tiered, split list all 13 roles and validate`
  - `precedence: --set > project > user > preset, with per-field sources (including --set task_budget_minutes=0)`
  - `per-role merge: a user file naming only doer keeps every other role from the preset`
  - `model: default is valid, any string is accepted in a file, a preset with a non-alias model is rejected`
  - `runtime: cross only on the three review roles; contract-writer only claude`
  - `adapters: rows and efforts match the literal adapters.json; isStableTag(pin) and 40-hex sha on both companion rows`
  - `--host is always required (CLI exit 2)`
  - `egress: keys openai/anthropic only, classes review/doer only, a user-scope doer entry is not inherited by a project`
  - `project block: accepted at project scope only, with its five keys and defaults`
  - `edit predicate: exactly the four write roles on every adapter; the suite exception is codex-agent-only`
  - `native-override note per host, reading network_access from ~/.codex/config.toml`
  - `formatMarkdown prints the literal block`
- [ ] **Step 2: Run `bun test tools/routing.test.ts`** — expected: every test fails (module or preset files missing).
- [ ] **Step 3: Doer implements** the three presets, `adapters.json`, `routing.mjs`, `harness.ts`.
- [ ] **Step 4: Run `bun test tools/routing.test.ts && bun test && bun run typecheck`** — expected: all green.
- [ ] **Step 5: Commit** `feat(routing): presets, adapters, and the routing resolver (spec A, contract 1)`.

---

### Task 2: SessionStart hook and Claude hook wiring

**Files:**
- Create: `plugins/vibe/hooks/resolve-routing.mjs`
- Create: `plugins/vibe/hooks/claude-hooks.json`
- Modify: `plugins/vibe/.claude-plugin/plugin.json` (add `"hooks": "./hooks/claude-hooks.json"`)
- Test: `tools/hooks.test.ts`

**Interfaces:**
- Consumes: `resolveRouting`, `formatMarkdown`, `RoutingError` from task 1.
- CLI: `node plugins/vibe/hooks/resolve-routing.mjs --host claude|codex`. Reads the project dir from `process.cwd()` and the home dir from `os.homedir()`. Plugin root = `CLAUDE_PLUGIN_ROOT` ?? `PLUGIN_ROOT` ?? the hook file's parent's parent.
- Stdout is exactly one JSON document: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<the block from formatMarkdown>"}}`. On a `RoutingError`, `additionalContext` is `<VIBE_ROUTING host="…" error="…">\n<message>\n</VIBE_ROUTING>` and the exit code is still 0 (a routing mistake must not break session start). Missing `--host` → stderr, exit 2.
- Reaper guard: when `<pluginRoot>/scripts/runtime-job.mjs` exists and `process.env.VIBE_RUNTIME_JOB !== "1"`, spawn `process.execPath <that script> reap --dir <home>/.agents/vibe/jobs` with `{ detached: true, stdio: "ignore" }` and `unref()` it; nothing about it reaches stdout. Phase 2 ships the script; phase 1 ships only this guard.
- `claude-hooks.json`, literal:
  ```json
  {
    "hooks": {
      "SessionStart": [
        { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/resolve-routing.mjs\" --host claude" } ] }
      ]
    }
  }
  ```
  No `plugins/vibe/hooks/hooks.json` may exist (Codex auto-detects that name).

- [ ] **Step 1: Contract-writer writes `tools/hooks.test.ts`** (contract 2), running the hook with `spawnSync(process.execPath, [hook, "--host", h], { cwd: harness.project, env: { ...harness.env, CLAUDE_PLUGIN_ROOT: <temp copy or the real plugin dir> } })`:
  - `envelope: nested hookSpecificOutput/SessionStart on both hosts, selected by --host, CLAUDE_PLUGIN_ROOT set in both runs`
  - `block: literal <VIBE_ROUTING> content including the project line, and on codex the anthropic-first egress line and the codex override line`
  - `no routing file means profile tiered`
  - `claude-hooks.json passes --host claude; hooks/hooks.json does not exist; plugin.json names claude-hooks.json`
  - `reaper: spawned detached and silent only when scripts/runtime-job.mjs exists, and not under VIBE_RUNTIME_JOB=1` (the test copies the hook and scripts into a temp plugin root, drops a fake `runtime-job.mjs` that writes a marker file with its argv, and asserts the marker appears within 2 s in one case and never in the other two; stdout stays the single envelope line).
- [ ] **Step 2: Run `bun test tools/hooks.test.ts`** — expected: red (hook missing).
- [ ] **Step 3: Doer implements** the hook, the hook file, the manifest field.
- [ ] **Step 4: Run `bun test tools/hooks.test.ts && bun test && bun run typecheck && claude plugin validate plugins/vibe --strict`** — expected: green.
- [ ] **Step 5: Commit** `feat(hooks): inject the resolved routing table at SessionStart (spec A, contract 2)`.

---

### Task 3: Sharing layer

**Files:**
- Create: `plugins/vibe/scripts/share.mjs`
- Create: `tools/fixtures/share/index.ts` (builds the IRIS-shaped fixture into a temp dir)
- Modify: `.gitignore` (add `.share-backup-*.tar`)
- Test: `tools/share.test.ts`

**Interfaces:**
- Exports:
  ```js
  export function parseFrontmatter(text)   // → { name?, description?, ...keys } ; supports `key: value`, indented continuation lines, `>` and `|` block scalars
  export function planShare({ scope, cwd, home, prefer })   // scope "project" | "user"; → Plan (never writes)
  export function applyShare(plan, { yes })                 // throws unless yes === true; writes the backup tar first
  ```
- `Plan` shape: `{ scope, root, canonical, backup, operations: [{ kind, from?, to?, detail }], repairs: [{ path, detail }], conflicts: [{ skill, files: [{ path, detail }] }], missingDescription: string[] }`. `kind` ∈ `move-claude-md` (CLAUDE.md body → new AGENTS.md, byte for byte), `append-claude-md` (under `## Imported from CLAUDE.md`), `write-claude-md-import` (CLAUDE.md becomes `@AGENTS.md` + blank line + `## Claude Code only` section), `move-skill` (real dir → `.agents/skills/<name>`), `merge-identical` (same-named dirs, identical files), `symlink` (`.claude/skills/<name>` and `.codex/skills/<name>` → `../../.agents/skills/<name>`), `skip-migrated` (entry already points into `.agents/skills`), `repair-dangling` (dangling symlink; reported, replaced by the canonical link only when the name exists in `.agents/skills`).
- `planShare` aborts with `ShareError` listing skills when any skill lacks `description`; a differing file between same-named dirs is a conflict and `applyShare` refuses unless `prefer` was given (`claude` | `agents` | `codex` picks that copy).
- Backup: project scope `<root>/.share-backup-<YYYYMMDD-HHMMSS>.tar` (tar of `CLAUDE.md`, `AGENTS.md`, `.claude/skills`, `.codex/skills`, `.agents/skills`, whichever exist, created with the system `tar`); user scope under `$TMPDIR`. Never inside `.agents/`.
- Project scope roots: `<cwd>/.claude/skills`, `<cwd>/.codex/skills`, canonical `<cwd>/.agents/skills`; `CLAUDE.md`/`AGENTS.md` at `<cwd>`. User scope: `<home>/.claude/skills`, `<home>/.codex/skills`, canonical `<home>/.agents/skills`; no context-file migration (ruling 4). `.claude/rules/*.md` untouched.
- `skillOverrides` branch: only when `tools/probes/RESULTS.md` records P2 as `fail`, `applyShare` also writes `skillOverrides: { "<name>": "user-invocable-only" }` into `<cwd>/.claude/settings.json` for every skill carrying `disable-model-invocation: true`, and the shared copy keeps only spec keys with the Claude-only keys under `metadata`. When P2 passed, the branch and its assertion are absent.
- CLI: `node plugins/vibe/scripts/share.mjs plan|apply --scope project|user [--cwd <dir>] [--home <dir>] [--prefer claude|agents|codex] [--yes] [--json]`. `plan` prints every operation and writes nothing; `apply` requires `--yes`.
- Fixture builder `tools/fixtures/share/index.ts`: `buildIrisLikeRepo(dir)` creates `CLAUDE.md` (a 3-line body), no `AGENTS.md`, `.agents/skills/{alpha,beta,gamma}` (`beta` and `gamma` with multi-line `description:` scalars, `>` and `|`), `.claude/skills/alpha` → symlink into `../../.agents/skills/alpha`, `.claude/skills/deploy-to-vercel` and `.claude/skills/vercel-cli-with-tokens` dangling symlinks, `.claude/skills/{delta,epsilon}` real dirs (`epsilon` also exists identically under `.agents/skills`), `.claude/skills/zeta` real dir that also exists under `.agents/skills` with one differing file, `.codex/skills/plan-feedback` real dir, `.claude/rules/argent.md`; and `buildNoDescriptionRepo(dir)`.

- [ ] **Step 1: Contract-writer writes `tools/share.test.ts`** (contract 3): byte-for-byte move and append-under-heading; CLAUDE.md import plus section; per-skill symlinks; already-migrated skip; dangling links reported as repairs; identical-only merge; abort with per-file summary; `--prefer`; tar backup outside `.agents/`; `.codex/skills` symlinked after merge; frontmatter parser incl. multi-line scalars; missing `name` filled from the dir, missing `description` aborts with the list; `plan` writes nothing (dir snapshot equal before/after); `.claude/rules` untouched; the conditional `skillOverrides` test only when RESULTS.md says P2 failed.
- [ ] **Step 2: Run `bun test tools/share.test.ts`** — expected: red.
- [ ] **Step 3: Doer implements** `share.mjs`, the fixture builder, the `.gitignore` line.
- [ ] **Step 4: Run `bun test tools/share.test.ts && bun test && bun run typecheck`** — expected: green.
- [ ] **Step 5: Commit** `feat(share): AGENTS.md and .agents/skills as the canonical project context (spec C, contract 3)`.

---

### Task 4: `init.mjs`

**Files:**
- Create: `plugins/vibe/scripts/init.mjs`
- Test: `tools/init.test.ts`

**Interfaces:**
- Consumes: `resolveRouting`, `loadPreset`, `ROLES`, `REVIEW_ROLES` from task 1; the harness.
- Exports:
  ```js
  export function detect({ host, home, cwd, env })      // → Detection (runs the CLIs found on PATH)
  export function defaultProfile(detection, host)       // "split" when the other runtime is installed and (on a Claude host) logged in, else "tiered"
  export function buildRoutingFile({ host, scope, profile, roles, egress, project, existing }) // → the JSON object to write
  export function writeRouting({ host, scope, cwd, home, ...})  // writes user or project routing.json; returns its path
  export function bridgeCommands(detection, host, pin)  // → string[] of exact shell commands still needed
  export function ensureAgentsCap({ codexConfigPath, maxParallel }) // → { action: "appended" | "print", lines: string[] }
  ```
- `Detection` shape: `{ claude: { installed, version }, codex: { installed, version, loggedIn }, bridges: { codexPlugin: { installed, version, installPath } | null, cc: { installed, version } | null, superpowersCodex: { installed } }, writersIntoClaudeSkills: string[] /* "argent" when <home>/.claude/rules/argent.md exists */, node: { version } }`. Reads `<home>/.claude/plugins/installed_plugins.json` for `codex@…` entries and `codex plugin list --json` for `cc@sendbird` / `superpowers@openai-curated`.
- CLI: `node plugins/vibe/scripts/init.mjs detect --host <h> [--json]`; `write --host <h> --scope user|project [--cwd] [--home] [--profile <p>] [--set role=runtime[:model[:effort]]]... [--egress <provider>=<class>[,<class>]]... [--project-install <cmd>] [--project-test <cmd>] [--project-disposable <a,b>] --yes`; `bridges --host <h> [--dry-run]`; `show --host <h> [--cwd]`; `agents-cap --max-parallel <n> [--codex-config <path>]`.
- `write` rules: the file carries `version: 1`, `profile`, `max_parallel`, `task_budget_minutes`, `task_idle_minutes`, `egress`, `roles` (only roles that differ from the preset, plus any `--set`), and at project scope a `project` block whose `install`/`test` default from the lockfile and `package.json` (`bun.lock` → `bun install --frozen-lockfile` / `bun test`; `package-lock.json` → `npm ci` / `npm test`; `pnpm-lock.yaml` → `pnpm install --frozen-lockfile` / `pnpm test`; else `""`). `contract-writer` is never written (the pin is the preset's). Re-running with an existing file keeps its customized roles and egress unless the new arguments name them. Never writes `network_access` anywhere.
- `bridges` prints exactly, per host and per missing item: Claude host → `claude plugin install codex@ysainson`; Codex host → `codex plugin marketplace add sendbird/codex-marketplace --ref <marketplace sha from adapters.json>`, `codex plugin add cc@sendbird`, `codex plugin add superpowers@openai-curated`, then the reminder line `run $cc:setup inside Codex, then restart Codex if it asks`. `--dry-run` runs nothing (the harness log stays empty of install calls).
- `ensureAgentsCap`: if the config has no `[agents]` table, append `\n[agents]\nmax_concurrent_threads_per_session = <maxParallel + 3>\n` and return `appended`; otherwise return `print` with the exact lines for the user.
- `show` prints the resolved markdown block, bridge readiness, the hook-trust reminder on Codex, and the `writersIntoClaudeSkills` list.

- [ ] **Step 1: Contract-writer writes `tools/init.test.ts`** (contract 4): preset by detection (`split` under `ok`, `tiered` under `login-out` and `no-cli`); `contract-writer` never written and always resolves to `claude`; egress entries per provider, class, host; re-run preserves customizations; `detect` shape under `login-out` and `no-cli`; `bridges` prints the exact commands including `$cc:setup` and runs nothing under `--dry-run`; `[agents]` append-or-print; the written file and the touched config never contain `network_access`.
- [ ] **Step 2: Run `bun test tools/init.test.ts`** — expected: red.
- [ ] **Step 3: Doer implements** `init.mjs`.
- [ ] **Step 4: Run `bun test tools/init.test.ts && bun test && bun run typecheck`** — expected: green.
- [ ] **Step 5: Commit** `feat(init): detect, write, bridges, show for the routing file (spec B, contract 4)`.

---

### Task 5: The `init` skill and the `setup` handoff

**Files:**
- Create: `plugins/vibe/skills/init/SKILL.md`
- Create: `plugins/vibe/skills/init/agents/openai.yaml`
- Modify: `plugins/vibe/commands/setup.md` (step 6 hands off to `/vibe:init`)
- Test: `tools/init-skill.test.ts`

**Interfaces:**
- Frontmatter, literal: `name: init`, `description: Set up VIBE routing, bridges, and shared project context with a default on every question; --yes takes the same defaults.`, `argument-hint: "[--yes]"`, `disable-model-invocation: true`.
- `agents/openai.yaml`, literal:
  ```yaml
  interface:
    display_name: "VIBE init"
    short_description: "Set up VIBE routing, bridges, and shared project context"
    default_prompt: "Set up VIBE for this machine and project"
  policy:
    allow_implicit_invocation: false
  ```
- Body (contract, not recipe; fable-safe): the six outcomes from spec section B with the default named on each (detect; preset `split` when the other runtime is installed and logged in, else `tiered`; customize roles default no, `contract-writer` shown not editable; one egress question per provider and class the resolved routing needs on this host, default acknowledged; scope default user, project scope runs `share plan` → read → confirm → `share apply` and writes the project block after confirming detected `install`/`test`; write with `init.mjs write --yes …`, `bridges`, `show`). Questions go through the harness's question tool when one exists, else plain conversation, one question per message, default marked. Re-running shows current values as defaults. Every command names `${CLAUDE_PLUGIN_ROOT}` on Claude and `${PLUGIN_ROOT}` on Codex.

- [ ] **Step 1: Contract-writer writes `tools/init-skill.test.ts`** (contract 5): user-only on both hosts (frontmatter + yaml policy); defaults named for every question; the question-tool-or-conversation rule; egress questions per class; scope default user; plan, confirm, apply; `setup.md` hands off to `/vibe:init`; no dated model id; no introspection phrasing.
- [ ] **Step 2: Run `bun test tools/init-skill.test.ts`** — expected: red.
- [ ] **Step 3: Doer writes** the skill, the yaml, the setup edit.
- [ ] **Step 4: Run `bun test tools/init-skill.test.ts && bun test && claude plugin validate plugins/vibe --strict`** — expected: green.
- [ ] **Step 5: Commit** `feat(init): user-only /vibe:init skill; setup hands off to it (spec B, contract 5)`.

---

### Task 6: Consumers read the routing block

**Files:**
- Modify: `plugins/vibe/skills/conduct/SKILL.md`, `plugins/vibe/commands/review.md`, `plugins/vibe/commands/review-plan.md`, `plugins/vibe/commands/quick-check.md`, `plugins/vibe/skills/profile-policy/SKILL.md`, `README.md`
- Create: `plugins/vibe/scripts/secret-patterns.json`
- Test (edited): `tools/conduct-skill.test.ts`, `tools/review-command.test.ts`, `tools/review-plan-command.test.ts`, `tools/profile-policy.test.ts`
- Test (new): `tools/quick-check-command.test.ts`, `tools/readme.test.ts`

**Retired assertions (the contract-writer deletes exactly these):** in `tools/conduct-skill.test.ts` the two tests `PROFILE table routes exploration…` and `PROFILE table routes contract writing…`; in `tools/review-command.test.ts` the test `model expectation on the native-review path derives from review_model first`; in `tools/review-plan-command.test.ts` the assertions `--effort xhigh` and `no \`--model\`` inside `dispatches read-only at explicit high effort…` (the test is rewritten to assert config-owned wording: effort and model come from the `plan-check` routing row and are passed only when not `default`).

**Values:**
- `secret-patterns.json`, literal shape `{ "version": 1, "patterns": [ { "name", "regex" } ] }` with at least: `aws-access-key` `AKIA[0-9A-Z]{16}`; `gcp-api-key` `AIza[0-9A-Za-z_-]{35}`; `github-token` `gh[pousr]_[A-Za-z0-9]{36,}`; `openai-key` `sk-(proj-)?[A-Za-z0-9_-]{20,}`; `anthropic-key` `sk-ant-[A-Za-z0-9_-]{20,}`; `private-key-block` `-----BEGIN [A-Z ]*PRIVATE KEY-----`; `bearer-token` `[Bb]earer\s+[A-Za-z0-9._~+/=-]{20,}`.
- conduct: delete the `PROFILE:` line and the routing table; new `## Model routing` section stating that routing is read from the injected `<VIBE_ROUTING>` block, with the fallback `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve --host claude --markdown`; each dispatch takes `model` from the role's row (omit when `default`); guardians and project-local agents take the `guardians` row and fall back to their own frontmatter; a role resolved to `codex` for `doer`/`doer-mechanical`/`escalation`/`exploration` is dispatched on the host's native doer and reported as "codex dispatch lands in phase 2 (spec section E)"; step 6 may run `adversarial` on the final diff for a high-stakes change or on request, never per-subtask (keep the words `cross-model` and `never per-subtask`).
- review: dispatch models from `roles.cross-check`, `roles.adversarial`, `roles.guardians`; new `/vibe:review adversarial [focus]` form running the companion's `adversarial-review --scope working-tree` (dirty tree) or `--base <default-branch>` (clean), default branch from `git symbolic-ref refs/remotes/origin/HEAD` falling back to `main`; the secrets pre-scan reads `${CLAUDE_PLUGIN_ROOT}/scripts/secret-patterns.json`; model expectation wording becomes "config-owned: the routing row's model, else the codex config's `model`"; `review_model` is gone.
- review-plan Step 3: reads `roles.plan-check`; `--effort <effort>` and `--model <model>` only when the row's value is not `default`.
- quick-check: guardians take the `guardians` row's model.
- profile-policy: rewritten around the routing file, presets, adapters, `default`, requested vs effective (on Claude a dispatch `model` beats `CLAUDE_CODE_SUBAGENT_MODEL` unless `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`), the `contract-writer` pin, egress keys and classes; keeps the `cross-check … config-owned … assert … report` and `setup-layer/README … dated` sentences the existing tests assert.
- README: the tagline and the `Model routing` section describe `routing.json` (user `~/.agents/vibe/`, project `.agents/vibe/`), the three presets, `/vibe:init`, and the sharing layer (`AGENTS.md`, `.agents/skills`); no `PROFILE` table claim and no `CLAUDE_CODE_SUBAGENT_MODEL` "zero file edits" claim; the `profile-policy` row in the skills table matches.

- [ ] **Step 1: Contract-writer** retires the listed assertions and writes the new ones across the six test files: no `PROFILE:` line or table in conduct; conduct reads the block with the resolver fallback and defers dispatch mechanics to spec E; `/vibe:review adversarial`, default-branch rule, guardians from routing, secret scan reads `secret-patterns.json`, no `review_model`; quick-check reads `guardians`; review-plan reads `plan-check` with config-owned effort/model; step 6 adversarial rule; profile-policy states the routing file, presets, adapters, requested vs effective with the corrected env semantics, the pin, egress; README documents the routing file, `/vibe:init`, the sharing layer, and no longer claims a PROFILE table or an env override; `secret-patterns.json` parses and every regex compiles and matches its own sample; no-dated-id guards stay green.
- [ ] **Step 2: Run `bun test tools/conduct-skill.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts tools/quick-check-command.test.ts tools/profile-policy.test.ts tools/readme.test.ts`** — expected: red on the new assertions only.
- [ ] **Step 3: Doer edits** the six prose files and creates `secret-patterns.json`.
- [ ] **Step 4: Run the six test files, then `bun test && bun run typecheck`** — expected: green.
- [ ] **Step 5: Commit** `feat(routing): conduct, review, review-plan, quick-check, profile-policy, and README read the routing file (spec D, contract 6)`.

---

### Task 7: Verify, release prep, human gate

**Files:**
- Modify: `.gitignore` (add `.worktrees/`)

- [ ] **Step 1:** Add `.worktrees/` to `.gitignore`; commit `chore(repo): ignore .worktrees/ for the phase 2 run worktrees`.
- [ ] **Step 2:** Run `bun test && bun run typecheck && claude plugin validate . --strict && claude plugin validate plugins/vibe --strict` — expected: green.
- [ ] **Step 3:** Dispatch `vibe:verifier` and `vibe:security-verifier` on the spec plus the full phase diff (`git diff bf69b21..HEAD`), no history.
- [ ] **Step 4: Human gate (the orchestrator stops here).** `bun release plugins/vibe` (minor → `vibe--v1.6.0`; pushes a tag and creates a GitHub release). Then: `/vibe:init` here at user scope (routing only); on `iris/app` at project scope (`share plan`, read, confirm, `apply`, which exercises the CLAUDE.md migration); curate IRIS's `## Claude Code only` section; re-run argent's skill sync and diff `.agents/skills`; open IRIS in Codex and confirm the shared skills and one convention; `/vibe:review` in Claude still dispatches `.claude/agents`; run `tools/probes/p1.sh` and `/skills` in a fresh Claude session.

## Self-review against spec sections A to D

- A: presets, adapters (with the pin ruling), resolver grammar, sources, native-override note, session injection incl. the reaper guard and the two hook files — tasks 1, 2. Codex hook file (`codex-hooks.json`) is phase 3 (spec H) and is not in this plan.
- B: `init.mjs` verbs, defaults, egress questions, scope, `[agents]` cap, bridges — tasks 4, 5. `gen-codex-agents.mjs` is phase 3 (task 17) and is excluded.
- C: plan/apply, migration rules, symlinks, backup, frontmatter, P1/P2 gating — task 3 (P1 leaves the container mode disabled; P2 decides the `skillOverrides` branch).
- D: conduct, review, review-plan, quick-check, profile-policy, README, `secret-patterns.json` — task 6.
- Contract 7: task 7.
