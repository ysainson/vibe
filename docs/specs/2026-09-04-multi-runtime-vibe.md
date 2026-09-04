# Multi-runtime VIBE: Claude + Codex as routed runtimes, one kit for both hosts

**Date:** 2026-09-04 (rev 5)
**Status:** draft, under `/vibe:review-plan`. Review log: rev 1 Codex `needs-rework` (28); rev 2 Codex `needs-rework` (11 new, 6 open); rev 3 four Claude lenses plus Codex pass 3, `needs-rework`; rev 4 two Claude resolution lenses plus Codex pass 4, `needs-rework` on remaining boundary and bookkeeping items. Rev 5 is the resolution pass for rev 4. The log at the end records every finding and what changed.
**Motivation:** GPT-6 Astra (2026-09-03) makes Codex a second, cheaper, separately-metered coding runtime that is competitive with Claude on bounded implementation and terminal work. VIBE today is a Claude Code plugin that uses Codex only as an optional read-only cross-check at two gates. This spec turns VIBE into a harness-neutral kit: every role is routed by a config file to a runtime (`claude` or `codex`), both tools read the same project context and skills, conduct can run doers on Codex locally and in parallel, the Codex review commands become routed roles, and VIBE installs into and orchestrates from Codex with the same skill tree. A new model means one line in config, not a VIBE release.

## Decisions

| Decision | Choice |
|---|---|
| Scope | All three sub-projects in one spec, phased inside (routing + sharing, Codex doer tier, Codex host). |
| Who writes tests | Claude, always. `contract-writer.runtime` is pinned to `claude` in every preset and the resolver rejects any other value. On a Codex host a declined `anthropic` acknowledgment therefore makes the run unsupported before any contract is written. |
| Routing rule | Role split + task-shape rule. `split`: implementation + mechanical edits on Codex; orchestration, contract, reviews, verify on Claude; escalation on Claude opus. |
| Where Codex doers run | Locally. Parallel only for plan-marked parallel-safe batches, one git worktree per task attempt, created directly by conduct from a batch contract commit on a run branch that lives in its own worktree. Codex Cloud is out of scope. |
| Dispatch primitive | Claude host: Claude roles are native subagents; Codex roles run through `runtime-job.mjs`, which spawns `codex exec -s <mode>` as a child it keeps handles to, in its own process group, with wall-clock and idle budgets, a signal ladder ending in SIGKILL, a pid file with identity, and a reaper. Codex host: Codex roles are native Codex subagents from generated custom-agent files that carry their own `sandbox_mode`; Claude roles go through the Sendbird `cc` bridge companion, which owns its own Claude sandboxing. VIBE never runs `claude -p` itself and never widens a session's sandbox network. |
| Bridge plugins | `codex` plugin on a Claude host for `cross-check`, `adversarial`, `plan-check`. `cc` plugin on a Codex host for those three and for every Claude-routed role. |
| Canonical files | Tool-neutral: `AGENTS.md` (CLAUDE.md imports it) and `.agents/skills` (per-skill symlinks from `.claude/skills` and `.codex/skills`). |
| Routing config | `routing.json` under `~/.agents/vibe/` (user) and `.agents/vibe/` (project), injected at session start by a hook told its host explicitly. `/vibe:init` writes it with defaults on every question. |
| Egress | Acknowledged per provider (`openai`, `anthropic`) and per dispatch class (`review`, `doer`), recorded in the routing file. A user-scope `doer` acknowledgment is never inherited by a project. |
| Shared memory | Researched, parked. Repo files are the shared memory. |

## Goals

1. **One routing file** decides, per role, the *requested* runtime, model, and effort. Any model string is accepted for either runtime; a preset may only use `default` or one of the four documented Claude aliases. Native overrides still apply beneath and are reported.
2. **`/vibe:init`** sets everything up with a default on every question; `--yes` takes the same defaults.
3. **Both tools read the same project context and skills.**
4. **conduct runs doers on Codex** under `split`: a batch contract commit on a run branch, worktrees from it, owned jobs with budgets, Claude reviewing every Codex diff, a bounded attempt ledger, archive-and-reset fallback to the other runtime, a terminal FAILED state, and an abort path that leaves nothing running.
5. **`cross-check`, `adversarial`, `plan-check` are routed roles** on the non-host runtime.
6. **VIBE is installable in Codex** and orchestrates from there when P3 passes; when P3 fails, VIBE's skills still install in Codex and Codex-hosted conduct is reported unsupported.
7. **No cross-provider dispatch without a matching acknowledgment,** on either host, and sandboxed shells keep network off on both hosts.
8. No dated model id in any authored skill, agent, or reference body, and none in presets. The routing file, generated Codex agent files, and the README (dated) may name one.

## Non-goals

- Codex Cloud. Cross-tool memory. Porting superpowers to Codex (`superpowers@openai-curated` exists). Budget-aware failover. Changing the review split. Windows.
- Routing effort into Claude-native subagent dispatch: agent frontmatter pins effort; `claude-native` rows accept only `default`.
- Running `claude -p` from VIBE. Headless Claude execution belongs to the `cc` bridge on a Codex host and does not exist on a Claude host.

## Research summary (verified 2026-09-04; sources at the end)

- **Model split.** Codex (Astra) wins on cost per task, terminal work, bounded maintenance, low-interruption runs. Claude (Fable 5.1) wins on judgment, architecture, deep debugging, multi-file refactors, orchestration, tooling. Consensus practice: Claude plans and does the hard parts, Codex does bounded implementation and review.
- **Codex CLI 0.153.2 (help text on this machine).** `codex exec`: prompt from stdin when `-` or absent; `-C <dir>`; `-s read-only|workspace-write|danger-full-access`; `--add-dir`; `-m`; `-c key=value`; `--json` (JSONL events, includes `thread.started` with a thread id); `-o <file>` (last message, written at the end). `codex exec resume <id> [-]` accepts `-m`, `-c`, `--json`, `-o` and neither `-s` nor `-C`. `codex login status`, `codex plugin list --json` exist. `model_reasoning_effort` accepts `minimal|low|medium|high|xhigh`. In `workspace-write`, model-generated shell commands have **network off by default**; `codex exec` has no interactive approval path; an interactive Codex session can approve a command. Subagents inherit the session sandbox, and a custom agent file may set `sandbox_mode` (`read-only` or `workspace-write`) as its default; live `/permissions` overrides made during the session are reapplied to children. Custom agent files cannot change network settings.
- **Claude Code 2.1.260.** Since 2.1.251 `CLAUDE_CODE_SUBAGENT_MODEL` is only a default; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` is the override. The OS sandbox for Bash exists (`sandbox.enabled`, `filesystem`, `network.allowedDomains`, `network.strictAllowlist`, `allowUnsandboxedCommands`), applies to the orchestrator's own Bash when enabled, and by default keeps the working directory writable and prompts on new domains. Skills: a `<skill-name>` entry may be a symlink (documented); a symlinked container is not documented. `skillOverrides: "user-invocable-only"` marks a skill user-only. `claude plugin validate --strict` validates the manifest only.
- **Codex plugins, hooks, skills (docs).** `.codex-plugin/plugin.json` fields `name`, `version`, `description`, `skills`, `hooks`, `interface`. Plugin hooks receive `PLUGIN_ROOT` and a compatibility `CLAUDE_PLUGIN_ROOT`. SessionStart returns `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. Plugin hooks are skipped until trusted in `/hooks`; `--dangerously-bypass-hook-trust` runs them once. Skills load from `.agents/skills` (symlinked folders included) and `~/.agents/skills`; `agents/openai.yaml` with `policy.allow_implicit_invocation: false` makes a skill user-only.
- **Bridge companions.** Installed `codex-companion.mjs` 1.0.6: `task --background` detaches its worker and writes the job record after spawning; `review`/`adversarial-review` take `--scope`, `--base`, `--model`, focus text (adversarial only), no effort, no prompt file, and their `--background` is a no-op. Sendbird's `cc` plugin (`codex plugin marketplace add sendbird/codex-marketplace`, `codex plugin add cc@sendbird`, then `$cc:setup` which sets feature gates and writable roots and may require a Codex restart): its skills are `$cc:review`, `$cc:adversarial-review`, `$cc:rescue`, `$cc:status`, `$cc:result`, `$cc:cancel`, `$cc:setup`; its script `claude-companion.mjs` exposes `task [--write] [--model] [--effort] [--prompt-file] [--cwd] [--resume-last]`, `review`, `adversarial-review`, `status`, `result`, `cancel`; it runs `claude -p` under `dontAsk` with an OS-sandbox settings file and, for review, no Bash tool. `/codex:transfer` is a session handoff, not a background runner.
- **Superpowers 6.3.0.** `subagent-driven-development` forbids parallel implementers and requires a pre-dispatch conflict table. `using-git-worktrees` prefers the native worktree tool, skips creation when already in a worktree, asks consent, requires `.worktrees/` to be git-ignored, and asks the human on a red baseline. `finishing-a-development-branch` cleans only `.worktrees/`, refuses removal on uncommitted files, and refuses its menu on a red suite. This spec deviates from those rules deliberately and says where.
- **IRIS (`~/Projects/iris/app`), the migration test case.** `.claude/skills`: 27 symlinks into `../../.agents/skills/` (two dangling: `deploy-to-vercel`, `vercel-cli-with-tokens`) plus 5 real dirs; `.agents/skills`: 25 dirs, two with multi-line `description:` scalars; `.codex/skills/plan-feedback` exists; `.worktreeinclude` copies `.env*` into native Claude worktrees so dev and some tests work there; argent regenerates 18 `argent-*` skills into `.claude/skills`; `.claude/agents/` holds `README.md` and `references/` beside the agent files; a 15 KB `CLAUDE.md`, no `AGENTS.md`. The vibe repo has neither `CLAUDE.md` nor `AGENTS.md`.

## Changes

### A. Routing file, presets, adapters, resolver, session injection (phase 1)

**File** `routing.json`. Requested-routing precedence, highest first: a one-run argument (`/vibe:conduct split <task>`, `doer=claude <task>`, `task_budget_minutes=0 <task>`), project `.agents/vibe/routing.json`, user `~/.agents/vibe/routing.json`, then the preset named by `profile`. When neither file exists the profile is `tiered`. Effective routing may still differ, and the resolver's report says so per host: on Claude, a `model` passed at dispatch beats `CLAUDE_CODE_SUBAGENT_MODEL` unless `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`; on Codex, live session overrides are reapplied to children.

```json
{
  "version": 1,
  "profile": "split",
  "max_parallel": 3,
  "task_budget_minutes": 30,
  "task_idle_minutes": 10,
  "egress": { "openai": ["review", "doer"] },
  "roles": {
    "doer": { "runtime": "codex", "model": "default", "effort": "medium" }
  }
}
```

- **Roles (13):** `doer`, `doer-mechanical`, `escalation`, `exploration`, `contract-writer`, `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians`, `cross-check`, `adversarial`, `plan-check`.
- **`runtime`:** `claude`, `codex`, `host`, or `cross` (the non-host runtime; valid only for the three review roles). `contract-writer` accepts only `claude`.
- **`model`:** `default` (omit; native resolution decides) or any non-empty string. Presets may only use `default`, `sonnet`, `haiku`, `opus`, `fable`.
- **`effort`:** `default` (omit) or a level, validated per adapter row.
- **`egress`:** per provider key `openai` or `anthropic`, a list of acknowledged classes: `review` (the three review roles) and `doer` (every other cross-provider role). A project file must carry its own `doer` entry; a user-scope `doer` entry applies only to user-scope runs of repositories without a project routing file. A run that needs an unacknowledged class asks once; "no" reroutes `doer`-class roles to `host` except `contract-writer`, whose pin cannot be satisfied on a Codex host, in which case the run stops as unsupported before contracts; review roles are reported as not performed.
- **Adapters** (`plugins/vibe/routing/adapters.json`, shipped, literal):

```json
{
  "claude-native":   { "host": "claude", "runtime": "claude", "efforts": ["default"] },
  "codex-exec":      { "host": "claude", "runtime": "codex",  "efforts": ["default","minimal","low","medium","high","xhigh"], "cli": "codex 0.153" },
  "codex-agent":     { "host": "codex",  "runtime": "codex",  "efforts": ["default","minimal","low","medium","high","xhigh"] },
  "cc-companion":    { "host": "codex",  "runtime": "claude", "pin": "<sendbird/codex-marketplace tag, set at build time>",
                       "paths": { "task": ["default","low","medium","high","xhigh","max"], "review": [], "adversarial-review": [] } },
  "codex-companion": { "host": "claude", "runtime": "codex",  "pin": "v1.0.6",
                       "paths": { "task": ["default","none","minimal","low","medium","high","xhigh"], "review": [], "adversarial-review": [] } }
}
```

  Role-to-row rule: `cross-check` → the host's companion row, `review` path; `adversarial` → `adversarial-review` path; `plan-check` → `task` path (read-only). Every other role resolves by (host, runtime): Claude host + `claude` → `claude-native`; Claude host + `codex` → `codex-exec`; Codex host + `codex` → `codex-agent`; Codex host + `claude` → `cc-companion`, `task` path, `--write` for `doer`-class roles and read-only for review-class ones. Review-path effort lists are empty, so `cross-check` and `adversarial` must be `default`. A route with no row on the given host is an error naming the role and host.
- **Presets** in `plugins/vibe/routing/presets/{uniform,tiered,split}.json`, each listing all 13 roles. `uniform`: every role `host`/`default`/`default`, except `contract-writer` (`claude`) and the three review roles (`cross`/`default`/`default`). `tiered`: `doer` `claude`/`sonnet`, `doer-mechanical` `claude`/`haiku`, `escalation` `claude`/`opus`, `exploration` `claude`/`sonnet`, `contract-writer` `claude`/`default`, reviewers, verifiers, `guardians` `claude`/`opus`, the three review roles `cross`/`default`/`default`, all efforts `default`. `split`: `doer` `codex`/`default`/`high`, `doer-mechanical` `codex`/`default`/`medium`, `escalation` `claude`/`opus`/`default`, `exploration` `claude`/`sonnet`/`default`, `contract-writer` `claude`/`default`/`default`, reviewers, verifiers, `guardians` `claude`/`opus`/`default`, `cross-check` and `adversarial` `cross`/`default`/`default`, `plan-check` `cross`/`default`/`xhigh`. A user file names a preset and overrides only what differs; merge is per role key.
- **Resolver** `plugins/vibe/scripts/routing.mjs`: `resolve --host claude|codex [--cwd <dir>] [--profile <p>] [--set key=value ...] [--json|--markdown]`. `--host` is always required. `--set` accepts `role=runtime:model:effort` and the top-level numeric keys. Validates roles, runtimes, the `contract-writer` pin, preset model values, adapter rows and efforts, egress keys and classes; reports the source of every field and the host's native-override note.
- **Session injection.** `plugins/vibe/hooks/resolve-routing.mjs --host <host>` runs on SessionStart and emits the nested envelope with this literal block as `additionalContext` (values illustrative):

```
<VIBE_ROUTING host="claude" profile="split" source="user:~/.agents/vibe/routing.json">
| role | runtime | adapter | model | effort | source |
| doer | codex | codex-exec | default | high | preset:split |
…
max_parallel: 3
task_budget_minutes: 30
task_idle_minutes: 10
egress: openai=review,doer anthropic=-
native-overrides: claude: a dispatch model beats CLAUDE_CODE_SUBAGENT_MODEL unless CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1
</VIBE_ROUTING>
```

  On a Codex host the `egress` line reads `anthropic=review,doer openai=-`. `hooks/hooks.json` passes `--host claude`; `hooks-codex.json` passes `--host codex`. Environment variables are never consulted for the host. The hook also runs `runtime-job.mjs reap --dir ~/.agents/vibe/jobs` when that script exists (phase 1 ships the guard, phase 2 ships the script), and skips it when `VIBE_RUNTIME_JOB=1` is set.

### B. `/vibe:init` (phase 1, extended in phase 3)

A user-only skill at `plugins/vibe/skills/init/SKILL.md` (Claude: `disable-model-invocation: true`; Codex: `agents/openai.yaml` with `policy.allow_implicit_invocation: false`), backed by `plugins/vibe/scripts/init.mjs` with `detect --json`, `write`, `bridges`, `show`.

Questions go through the harness's question tool when the session exposes one; otherwise plain conversation with the default marked, one question per message.
1. **Detect.** Claude CLI and version; Codex CLI, version, `codex login status`; bridges (`codex@…` from `~/.claude/plugins/installed_plugins.json`; `cc@sendbird` and `superpowers@openai-curated` from `codex plugin list --json`); tools that write into `.claude/skills` (argent, by its `.claude/rules/argent.md` marker); node.
2. **Preset.** Default `split` when the other runtime is installed and logged in, else `tiered`.
3. **Customize roles?** Default no. `contract-writer` is shown but not editable.
4. **Egress.** One question per provider and class the resolved routing needs on this host; default "acknowledged".
5. **Scope.** Default user. Project scope runs the sharing layer (C) as plan, confirmation, apply, and writes a project routing file with its own egress entries.
6. **Write and verify.** `init.mjs write --host <host> --yes …`; `bridges install --host <host>` for anything missing: Claude host `claude plugin install codex@ysainson`; Codex host `codex plugin marketplace add sendbird/codex-marketplace --ref <pin>`, `codex plugin add cc@sendbird`, `codex plugin add superpowers@openai-curated`, then `$cc:setup` and its restart check. `show` prints the resolved table, bridge readiness, the hook-trust reminder on Codex, and the tools that write into `.claude/skills`. On a Codex host it also ensures `agents.max_concurrent_threads_per_session >= max_parallel + 3`: if `~/.codex/config.toml` has no `[agents]` table the block is appended verbatim; otherwise the exact lines are printed for the user (plain node has no TOML round-trip). Init never changes `sandbox_workspace_write.network_access`.

Re-running shows current values as the defaults. `/vibe:setup` calls this flow as its final step.

### C. Sharing layer (phase 1)

`plugins/vibe/scripts/share.mjs` with `plan` (prints every operation, writes nothing) and `apply` (only after explicit confirmation, at both scopes, after writing a backup).

- **Context.** `AGENTS.md` at the repo root is canonical. `CLAUDE.md` becomes `@AGENTS.md` plus a `## Claude Code only` section. Migration moves the CLAUDE.md body into AGENTS.md byte for byte, or appends it under `## Imported from CLAUDE.md` when AGENTS.md exists. Curation is a human edit afterwards. `.claude/rules/*.md` are untouched. IRIS exercises this path at the phase 1 gate; the vibe repo has no CLAUDE.md and exercises only routing.
- **Skills.** `.agents/skills/` is canonical. `share apply` creates one symlink per skill directory from `.claude/skills/<name>` and `.codex/skills/<name>` to `../../.agents/skills/<name>`; replacing a whole container with one symlink is enabled only after P1 passes. The union walk resolves symlinks: an entry already pointing into `.agents/skills` is "migrated, skip"; a dangling symlink is reported as a repair item, never skipped silently; same-named directories merge only when identical; any differing file aborts with a per-file diff summary unless `--prefer claude|agents|codex`. The backup is a tar at `<repo>/.share-backup-<timestamp>.tar` (git-ignored) or under `$TMPDIR` at user scope, never inside `.agents/`. Frontmatter is parsed by a small block parser (`key: value`, continuation lines, `>`/`|` scalars); a missing `name` becomes the directory name; a missing `description` aborts with the list.
- **Regenerating tools.** The phase 1 human gate re-runs argent's skill sync and diffs `.agents/skills` afterwards.
- **Third-party plugins** are not shared by file.
- **Probes before building C:** P1, a symlinked `.claude/skills` container is listed by `/skills` in a fresh session started in a scratch repo prepared by `tools/probes/p1.sh`; P2, `codex exec --skip-git-repo-check -s read-only` in a scratch dir whose `.agents/skills` holds one skill carrying `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `allowed-tools`, plus `skillOverrides: "user-invocable-only"` confirmed in Claude. If Codex rejects any key, the shared dir keeps spec-only keys, the Claude-only keys move under `metadata`, and `share apply` writes `skillOverrides` into `.claude/settings.json`; contract 3's assertion for that branch is enabled only when P2 recorded a failure.

### D. VIBE reads the routing file (phase 1)

- **conduct** (task 6 only touches this): drops the `PROFILE:` line and the hardcoded table, reads the injected `<VIBE_ROUTING>` block (fallback: run the resolver with the host it runs in), and states that the dispatch mechanics of steps 2 to 6 are specified in E and land in task 10. Task 6 retires these existing assertions, through the contract-writer: the two PROFILE-table tests in `tools/conduct-skill.test.ts` (lines 17 and 27 today), and in `tools/review-command.test.ts` and `tools/review-plan-command.test.ts` the `review_model`, `--effort xhigh`, and "no `--model`" wording assertions, replaced by config-owned and `plan-check` wording.
- **`/vibe:review`** reads `roles.cross-check`, `roles.adversarial`, `roles.guardians`; **`/vibe:quick-check`** reads `roles.guardians`. `/vibe:review adversarial [focus]` runs `adversarial` through the host's companion `adversarial-review --scope working-tree|--base <default-branch> [focus]`; the default branch is `git symbolic-ref refs/remotes/origin/HEAD`, falling back to `main`.
- **`/vibe:review-plan`** reads `roles.plan-check` for its Step 3 brief.
- **conduct step 6** may run `adversarial` on the final diff when the change is high-stakes or requested. Never per-subtask.
- **profile-policy** is rewritten: routing file, presets, adapters, `default`, requested vs effective with the corrected `CLAUDE_CODE_SUBAGENT_MODEL` semantics, the pin, egress keys and classes.
- **README** loses its PROFILE-table and env-override claims in the same task.

### E. Codex doer tier in conduct (phase 2)

**Shared contract** `plugins/vibe/skills/conduct/references/codex-dispatch.md`: locate, assert, requested-routing report, all-stage failure wording, the adapter table, the review-background no-op note, and the orchestrator-sandbox rule for installs (below).

**Job script** `plugins/vibe/scripts/runtime-job.mjs` (single adapter, `codex-exec`).

- `run --cwd <dir> --prompt-file <file> --mode read-only|write --pid-file <file> --result <file> --budget-ms <n> --idle-ms <n> [--model <id>] [--effort <level>] [--resume <session-id>] --json`
- Spawns `codex exec -C <cwd> -s read-only|workspace-write [-m <id>] [-c model_reasoning_effort=<e>] --json -o <result> -` with `{ cwd, detached: true, stdio: ["pipe","pipe","pipe"], env: <scrubbed> }`, keeps the handles, never calls `unref()`. The scrubbed environment passes only `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_*`, `TERM`, `CODEX_HOME`, and `VIBE_RUNTIME_JOB=1`. Immediately after spawn it writes the pid file atomically (temp then rename): `{ pid, pgid, lstart: <exact "ps -o lstart=" string>, owner: <script pid>, ownerLstart, cwd }`, and unlinks it on exit. Pid files live under `~/.agents/vibe/jobs/<run>/`.
- Child stdout is teed to `<result>.jsonl`; the script's own single JSON line is the last line of its stdout: `{ sessionId, status: done|failed|cancelled|budget-exceeded|idle-exceeded|killed, escalated, exitCode, durationMs, resultPath, logPath }`. `sessionId` comes from `thread.started` (field path frozen by the P0 golden) and may be null when the child died before emitting it. `resultPath` is null unless the child finished.
- Budgets: `--budget-ms` is wall clock (0 kills immediately after spawn); `--idle-ms` restarts on every byte of child output. Either elapsing triggers SIGTERM to the negative pgid, 10 s, SIGKILL, 5 s reap; the script returns only after the child is reaped or reports `escalated: true` when the reap wait expires. `task_budget_minutes` and `task_idle_minutes` from routing are converted to milliseconds by conduct; `task_idle_minutes` must exceed the project's longest single command.
- `cancel --pid-file <file>`: compares `pid`, `pgid`, and the `lstart` string byte for byte with `ps -o pgid=,lstart= -p <pid>` before signalling, runs the ladder, waits, unlinks. `reap --dir <dir>`: for every pid file, if the owner is gone (its pid or `ownerLstart` no longer match) or the child identity no longer matches, cancels the group and removes the file; tolerates partial files.
- `--resume <id>` runs `codex exec resume <id> -` with `-m`, `-c`, `--json`, `-o` only, cwd set by the spawn. Only a same-worktree redirect may resume, and only after P4 proves that a resumed session keeps its sandbox and root; a redirect that changes the base or the worktree always starts a fresh `codex exec -C <new worktree>` with the archived patch in the prompt.

**Plan step (conduct step 3, rewritten in task 10).** The plan lists, per task: files (the declared file set), exclusive resources (ports, simulator or device, database, build cache, docker), whether it changes dependencies, lockfiles, generated outputs, or a shared interface, whether its contract needs runtime env or secrets, and the runtime tag. A task is `[claude]` (host runtime) when it needs judgment its contract cannot carry, when its contract needs runtime env or secrets, when it changes dependencies, lockfiles, or generated outputs, or when it was escalated; otherwise under `split` it is `[codex]`. Two tasks are parallel-safe only when their file sets and resources are disjoint, neither depends on the other, and neither changes dependencies, lockfiles, generated outputs, or a shared interface the other imports; the plan writes the pairwise conflict table superpowers' dispatch scan requires and groups parallel-safe tasks into batches.

**Run branch and batch contract (conduct steps 2 and 4, rewritten in task 10).** A run refuses to start on a dirty main checkout, records the working branch SHA, creates `vibe/run/<id>` from it, and checks that branch out in its own worktree `.worktrees/vibe-<id>/run`; the main checkout is never touched. Per batch: the contract-writer writes the batch's tests and a manifest `contract.json` (`[{ task, testFile, testName, command }]`); the orchestrator runs them in the run worktree, records `expected-red.txt` from a reference worktree built exactly like task worktrees (post-install, no `.env*`), and commits `test(<batch>): contract for tasks N-M (expected red)` on the run branch. Task worktrees are `git worktree add .worktrees/vibe-<id>/<task>-a<n> -b vibe/task/<id>/<task>-a<n> <contract-sha>`, created directly by conduct, a documented exception to the superpowers worktree skill (native-tool preference, skip-when-in-a-worktree, consent question); `.worktrees/` is git-ignored by an explicit task. Nothing copies `.worktreeinclude` files. The orchestrator then runs the project's install step in the worktree with `--frozen-lockfile` (or the project's recorded command) and re-runs it between batches when a lockfile changed; the failing set of the suite must equal `expected-red.txt`, otherwise the human gate the worktree skill requires is raised.

**Orchestrator-sandbox rule.** The install and git commands run as the orchestrator's own Bash. On a Claude host with the OS sandbox enabled, conduct detects it (settings `sandbox.enabled`) and requires the registry domain or the install command in `excludedCommands`, else raises the human gate. On a Codex host the install may request one approval in the interactive session. Lifecycle scripts run with the developer's own privileges, exactly as a manual install would; the frozen lockfile pins them.

**Secrets preflight.** Before the first cross-provider dispatch of each batch, the orchestrator scans the tracked content at `<contract-sha>` (`git grep` with the credential patterns `/vibe:review` uses, excluding lockfiles and generated paths) and every prompt file; worktrees carry no `.env*` and their untracked content is the install output. A hit reroutes the task to `host` and is reported. The doer block gains: "Never read, print, or send secret-bearing files (`.env*`, key or credential files, `~/.claude`, `~/.codex`); if a task seems to need one, stop and report." and "Never commit or run git write commands; the orchestrator stages and commits."

**Dispatch of one Codex task.**
1. Assert the CLI and login; failure enters the ledger as an adapter failure.
2. Prompt file in the session temp dir: goal and why, scope and file set, the contract and how to run it, "conventions are in AGENTS.md", the doer block verbatim, the Codex addendum from guardrails.md (the install is done; run the contract and report it red first; the worktree path is the working root; git may fail inside the sandbox, report instead of working around it; report in the doer format).
3. `runtime-job.mjs run --mode write --cwd <worktree> …` in a background shell job; completion is the collection mechanism. `--model` only when routing names one.
4. Up to `max_parallel` jobs in flight, all from one batch.

**After a job.** `git add -A` in the worktree, then `git diff --cached --name-only <contract-sha>` compared with the declared file set; any extra path, lockfile, or generated output is an automatic redirect before the review passes. Then the baseline-aware diff (`git diff --cached <contract-sha>`) and the two review passes.

**Attempt ledger.** Per task: `{ attempt, runtime, adapter, sessionId, worktree, branch, status, archivePath }`. A same-worktree redirect binds to the current attempt (resume per the P4 rule, else fresh exec with the archived diff). Caps: two redirects, then escalation (the `escalation` role as routed, new attempt, same worktree when the runtime stays the same, else a fresh worktree); one fallback per task (below); an escalation failure marks the task FAILED, the batch stops, and the report lists every archive.

**Failure and fallback.** On adapter failure, `failed`, `budget-exceeded`, `idle-exceeded`, `cancelled`, `killed`, or a rate limit: (1) confirm the job is terminal (the script returned; a stale pid file goes through `cancel`); (2) archive: `git add -A`, `git diff --cached --binary <contract-sha> > docs/evidence/vibe/<id>/<task>-a<n>.patch`, plus `<result>.jsonl`, and a ref `refs/vibe/attempts/<id>/<task>-a<n>` on the worktree tip (an empty patch is valid for a job killed before it wrote); (3) `git reset --hard <contract-sha> && git clean -fd`; (4) dispatch the other runtime (`escalation` if the task was already redirected, else `doer` with the runtime swapped) in a new attempt with its own worktree and branch, the archived patch attached as a prior attempt; a crossing whose class is not acknowledged asks, and "no" marks the task FAILED.

**Integration.** Strictly in plan order, one task at a time, in the run worktree: cherry-pick the task's implementation commit (made by the orchestrator in the task worktree after acceptance); on conflict, `git cherry-pick --abort` and redirect the task in a fresh worktree from the run branch tip with the conflicting hunks as text. After integrating task K run the commands for K's contract entries plus the whole suite minus the test names of not-yet-integrated batch tasks, both derived from `contract.json`; the full suite runs after the batch's last integration. Accepted-but-not-yet-integrable worktrees are held and named in the report. When the run integrates green and the working branch still equals the recorded SHA, `git merge --ff-only` lands it; otherwise the run branch is left for the human and reported. Worktree removal: inventory untracked and ignored files; install outputs declared by the project recipe are disposable; anything else is archived to the evidence dir; then `git worktree remove --force` and branch deletion after the attempt refs exist.

**Abort.** `/vibe:conduct abort <id>` (or the orchestrator on interruption) cancels every pid file under `~/.agents/vibe/jobs/<id>/`, archives every attempt, removes the run's worktrees, and leaves the run branch and refs as evidence.

**Reporting** per task: attempt ledger, adapter, session id, requested model and effort with sources, mode, duration, worktree, integration result.

### F. Commands become skills; harness-neutral prose (phase 3)

- Every `plugins/vibe/commands/*.md` moves to `plugins/vibe/skills/<name>/SKILL.md`; `init` is born as a skill in phase 1 and only its frontmatter is specified here. Descriptions stay as today.

| skill | name | argument-hint | Claude `disable-model-invocation` | Codex `agents/openai.yaml` policy |
|---|---|---|---|---|
| brainstorm | brainstorm | `[idea]` | true | `allow_implicit_invocation: false` |
| commit | commit | `[scope hint]`; keeps `allowed-tools` | true | false |
| fix | fix | `[paths]` | true | false |
| review-plan | review-plan | `[spec path]` | true | false |
| setup | setup | `[brief path]` | true | false |
| init | init (exists since task 5) | `[--yes]` | true | false |
| review | review | `[adversarial focus]` | absent | no file |
| quick-check | quick-check | none | absent | no file |
| conduct | conduct | `[task, or preset/role overrides, or abort <id>]`; `user-invocable: false` removed; `commands/conduct.md` deleted | absent | no file |

- Skill and agent bodies stop naming Claude tools. `plugins/vibe/skills/conduct/references/harness-tools.md` is the single mapping: subagent dispatch (Agent tool with `model` vs `spawn_agent` with `agent_type` or the inlined-instructions spawn), question tool (AskUserQuestion vs plain conversation), background shell job (Bash `run_in_background` vs a forwarding subagent), waits in 5 to 10 minute stretches, redirects via `--resume` or fresh exec, plugin root variable, the adapter table from A, the read-only exploration prompt, and "trust the actual tool list over this file". Contract 14's scan excludes `commands/`, and task 14 updates `tools/review-command.test.ts`, which today asserts `run_in_background` in review's body.

### G. Codex host (phase 3)

Adapters on a Codex host follow the (host, runtime) rule in A; no table is per role. What differs from the Claude host:

- **`codex-agent`.** `gen-codex-agents.mjs --out <dir> --routing <resolved json>` writes one custom-agent file per Codex-runtime role: `name = "vibe-<role>"`, `description`, `developer_instructions` = the agent body (`doer.md`, `doer-mechanical.md`, the exploration prompt, the reviewer and verifier bodies, overlay and project guardian bodies filtered by frontmatter), `model` and `model_reasoning_effort` when not `default`, `sandbox_mode = "workspace-write"` for `doer`, `doer-mechanical`, `escalation` and `"read-only"` for every other role. User-scope routing generates into `~/.codex/agents/`; project-scope routing into `.codex/agents/`, which Codex prefers. Regenerated on every `/vibe:init`, stale generated files removed, hand-written files untouched. Spawn uses `agent_type: "vibe-<role>"`; when the installed spawn tool does not advertise it, the default agent is spawned with the same instructions inlined and the read-only guarantee is then instruction-based, which the report says.
- **`cc-companion`.** Claude-runtime roles run `claude-companion.mjs task --prompt-file <file> [--write] [--model <alias>] [--effort <e>] --cwd <worktree>` inside a forwarding subagent (the pattern the `cc` plugin prescribes); the ledger records the `cc` job id; cancel is `claude-companion.mjs cancel <job>`; the bridge owns Claude's sandboxing and job control. The three review roles use its `review` and `adversarial-review` paths.
- The session sandbox stays as the user configured it; the install step may prompt for approval; VIBE does not set `network_access`.
- **P3 (first task of phase 3, hard gate).** In a Codex session on this repo, with a hand-written `vibe-doer.toml` and `vibe-reviewer-spec.toml` fixture in `.codex/agents/`: (a) whether the spawn tool advertises `agent_type`; (b) a `vibe-doer` spawn edits a scratch worktree and a `vibe-reviewer-spec` spawn cannot; (c) a forwarding subagent's `cc` `task` read-only, `task --write`, `review`, and `adversarial-review` calls complete and the write one edits the worktree; (d) which approvals were requested. Pass: (b) and all (c) cells pass without VIBE changing any sandbox setting. Fail: phase 3 ships packaging and skills only (tasks 13, 14, 16), the harness-tools reference states that Codex-hosted conduct is unsupported, and tasks 15, 17, 18 are dropped from this spec.
- **P4 (before task 10).** From a Claude session: `codex exec -C <scratch worktree> -s workspace-write --json` creates a file; `codex exec resume <id> -` is asked to create a second file; pass when it lands in the same worktree. Fail: `codex-exec` redirects always use fresh exec.

### H. Codex packaging (phase 3)

- `plugins/vibe/.codex-plugin/plugin.json`: `name`, `version` (equal to its own Claude manifest), `description`, `skills: "./skills/"`, `hooks: "./hooks/hooks-codex.json"`, minimal `interface`. Same for `vibe-swift` and `vibe-expo` (skills only).
- `plugins/vibe/hooks/hooks-codex.json`: SessionStart `node "$PLUGIN_ROOT/hooks/resolve-routing.mjs" --host codex`.
- `.agents/plugins/marketplace.json` at the repo root: `name: "ysainson"`, `interface.displayName`, entries `{ name, source: { source: "local", path: "./plugins/<name>" }, policy: { installation: "AVAILABLE", authentication: "ON_USE" }, category: "Developer Tools" }`; no versions.
- `tools/manifests.ts`: pure `bumpManifests(claude, codex, version)`; `tools/release.ts` reads both, asserts equality, writes and stages both in one commit. The Codex install smoke runs only with `bun release --with-codex-smoke` or in the phase 3 gate.
- `tools/codex-install-smoke.sh`: a 0700 temporary `CODEX_HOME` seeded with a 0600 copy of `auth.json`, removed on EXIT/INT/TERM, never archived; `codex plugin marketplace add <repo path>`, `codex plugin add vibe@ysainson`, `codex plugin list --json` shows it enabled; the hook script is executed directly with `--host codex` and its envelope asserted; one `codex exec --skip-git-repo-check -s read-only` "reply ok" call proves the seeded credentials authenticate.

### I. Codex-hosted dispatch (phase 3, only if P3 passes)

The Codex primary thread orchestrates with the same conduct skill, batches, ledger, failure rule, and abort. `codex` roles spawn through `codex-agent`; `claude` roles and the three review roles go through `cc-companion`. `/vibe:init` on a Codex host installs the bridge and superpowers as in B, runs `$cc:setup`, reminds the user to trust the hook, and applies the thread cap.

## Resolution log

### Rev 4 to rev 5 (two Claude resolution lenses + Codex pass 4)

| # | source | finding | change |
|---|---|---|---|
| D1 | all three | `claude-print` read-only and write modes not enforceable (cwd writable by default, `allowedDomains: []` prompts, unsandboxed retry hatch, bare Bash allow); contract 9 would freeze the wrong settings | Adapter removed. Claude roles on a Codex host go through the `cc` bridge; on a Claude host they are native. VIBE never runs `claude -p`. |
| D2 | feasibility, Codex | P3 pass path widened the Codex session network, contradicting "shells keep network off" | VIBE never sets `network_access`; the bridge owns its Claude execution; P3 tests the bridge under the user's sandbox |
| D3 | feasibility, Codex | "custom agents cannot narrow the sandbox" was wrong; `codex-agent` inherited the session sandbox | Research corrected; generated agents carry `sandbox_mode`, read-only for review roles |
| D4 | consistency, feasibility | G table per role contradicted A's (host, runtime) rule for `escalation` and `exploration`; Codex-host fallback could loop back into Codex | G is now a per-adapter section; roles follow routing; fallback swaps runtime |
| D5 | feasibility | `vibe/run-<id>` and `vibe/run-<id>/<task>` collide in the ref namespace; run branch checkout location unstated | `vibe/run/<id>` and `vibe/task/<id>/<task>-a<n>`; run branch in its own worktree; dirty main checkout refuses to start |
| D6 | feasibility | "suite minus pending contracts" not computable from a batch-level red list | `contract.json` manifest per batch (task, testFile, testName, command) |
| D7 | feasibility | Conflict redirect "fresh worktree" cannot resume a session rooted elsewhere | Redirect kinds: same-worktree may resume (after P4); base or worktree change always fresh exec |
| D8 | feasibility | Env-less worktrees make expected-red equality fire on env-dependent suites | Baseline recorded from a reference worktree built the same way; env-needing contracts are `[claude]` on host |
| D9 | feasibility, Codex | Preflight after install scanned node_modules; `git status` inventory incomplete; env inheritance | `git grep` over tracked content at the contract sha plus prompt files, before install, per batch; scrubbed child environment |
| D10 | feasibility | Dependency-changing tasks could never succeed on `codex-exec` | Such tasks are `[claude]` on host; install re-runs between batches on lockfile change |
| D11 | feasibility | Install "outside any sandbox" asserted of an environment VIBE does not control | Orchestrator-sandbox rule in `codex-dispatch.md` |
| D12 | feasibility | Idle budget killed silent long steps | Idle resets on any output byte; `task_idle_minutes` must exceed the longest command |
| D13 | feasibility, consistency, Codex | Smoke 12 unsatisfiable (budget-0 task with a non-empty patch); no per-run budget override | Budget-0 row expects a null session and an empty patch; patch preservation proven by `cancel` on the other task; `task_budget_minutes=0` accepted as a one-run argument |
| D14 | feasibility, Codex | `cancel` identity check undefined against a formatted `lstart`; nonce unused; pid dir unspecified; hook `reap` before the script exists; nested sessions reaping parents | Exact `lstart` string stored and compared byte for byte; owner identity for orphaned groups; `~/.agents/vibe/jobs/<run>/`; guarded `reap` in phase 1; `VIBE_RUNTIME_JOB=1` skip |
| D15 | Codex | Declared-file guard missed untracked files | `git add -A` then `git diff --cached --name-only` |
| D16 | Codex | Generated agents under `~/.codex/agents` collide across projects | Project routing generates into `.codex/agents/` |
| D17 | Codex, consistency | Declined `doer` egress conflicts with the `contract-writer` pin on a Codex host | Run stops as unsupported before contracts |
| D18 | Codex | Bridge paths never exercised before shipping | P3 cell (c) runs all four `cc` paths; smoke 18 repeats them |
| D19 | Codex, feasibility | Forced worktree removal destroys unarchived artifacts; abandoned runs leave state; no non-FF path | Inventory-then-archive before removal; abort step; ff-only guarded by the recorded SHA |
| D20 | consistency | Contract 6 named "three" PROFILE tests (two exist) and ignored `review_model` / effort assertions; task 13 missed `quick-check-command.test.ts`; task 14 missed `review-command.test.ts`; contract 16 wording; `adapters.json` lacked `pin`; contract 17 lacked init assertions; harness in the wrong task; preset model predicate undefined; conditional `skillOverrides` assertion; `gen-codex-agents` output dir; addendum location; naming and log drift; IRIS counts | All applied in D, F, G, contracts, and tasks |
| D21 | Codex | Auth smoke never proved authentication | One authenticated `codex exec` call in the smoke |
| D22 | Codex | Install lifecycle scripts run unsandboxed | Stated as the developer's own privileges under the orchestrator-sandbox rule; frozen lockfile pins them; accepted residual risk |
| D23 | consistency | `anthropic` egress key never named | Both keys named; Codex-host block line shown |

Not changed, by decision: parallel doers remain a deliberate deviation from superpowers' rule, bounded by the conflict table, resources, the diff-versus-declaration check, and serial integration. Codex workspace-write reads the whole filesystem; the scrubbed environment, the preflight, and the doer block are the mitigations, and the routing file's acknowledgment is where the user accepts that.

### Rev 3 to rev 4 (four Claude lenses + Codex pass 3)

C1 process ownership (finalized in rev 5 with owner identity); C2 subset suites (finalized in rev 5 with `contract.json`); C3 `bypassPermissions` (superseded in rev 5: adapter removed); C4 install before dispatch (finalized in rev 5 with the orchestrator-sandbox rule); C5 plan mode (superseded in rev 5); C6 Codex-host nesting and P3 (finalized in rev 5: bridge-owned, no network change); C7 resume cwd (finalized in rev 5 with the redirect kinds); C8 archive before reset; C9 egress per class; C10 no `.worktreeinclude`, preflight (finalized in rev 5); C11 `plan-check`; C12 `tiered` spelled out; C13 fallback swaps runtime (finalized in rev 5); C14 P0 goldens (Codex only in rev 5); C15 `--budget-ms`; C16 retired tests enumerated (corrected in rev 5); C17 task 14 after 13; C18 readme test; C19 config-table append-or-print. Major and Minor items as listed in the rev 4 log, with the rev 5 corrections above.

### Rev 2 to rev 3 (Codex pass 2)

N1 ownership; N2 cleanup; N3 contract order; N4 sandbox per call (restored for `codex-agent` in rev 5 via `sandbox_mode`); N5 reviewer roles via the bridge (rev 5); N6 generated agents restored for the Codex host with `name` and `sandbox_mode`; N7 hook envelope and trust; N8 descriptions abort; N9 seeded auth; N10 budget-zero smoke; N11 no companion background jobs on the doer path.

### Rev 1 to rev 2 (Codex pass 1)

1 `--host` from manifests; 2 requested vs effective; 3 `default` omits; 4 per-adapter effort; 5 review effort config-owned; 6 `contract-writer` pin; 7 contract commit (finalized rev 5); 8 job control (finalized rev 5); 9 write on resume, inherited on `codex-exec` and proven by P4; 10 fallback state (finalized rev 5); 11 parallel policy (finalized rev 5); 12 secrets rule; 13 merge and backups; 14 commands frontmatter; 15 sandbox table; 16 `default` omits both model and effort, native resolution decides; 17 role inventory; 18 sandbox per call; 19 reverse-bridge source; 20 question fallback and thread cap; 21 `agent_type` not assumed; 22 superpowers on Codex; 23 marketplace shape; 24 `tools/manifests.ts`; 25 DAG and fixtures; 26 generated files exempt; 27 superpowers claim narrowed; 28 symmetric acknowledgment.

## Contracts (bun tests in `tools/`; ★ = failing-first)

Scripts are tested behaviorally against `tools/fixtures/`: `tools/fixtures/harness.ts` creates a temp dir and puts a fake `codex` executable first on `PATH`, controlled by `FAKE_CLI_MODE=ok|hang|fail|write|trap-term` and `FAKE_CLI_SESSION=<id>`; the fake records argv, cwd, env, and stdin, and replays the golden transcript captured in P0. Contracts 10 and 17 are prose contracts on `conduct/SKILL.md` and the references; their behavior is gated by the live smokes' named checklists.

0. **P0 golden** (probe, committed): `tools/fixtures/codex-exec.jsonl` from one real `codex exec --json` run, with the `thread.started` id field path noted in a README beside it.
1. **`tools/routing.test.ts`** (task 1): ★ presets list all 13 roles and validate; ★ precedence with per-field sources, including `--set task_budget_minutes=0`; ★ per-role merge; ★ `default` valid, any string accepted in files, presets restricted to `default` and the four aliases, `cross` only on the three review roles, `contract-writer` only `claude`; ★ adapter rows and efforts per the literal `adapters.json` including `pin`; ★ `--host` always required; ★ egress keys `openai`/`anthropic`, classes, project-never-inherits; ★ the host's native-override note.
2. **`tools/hooks.test.ts`** (task 2, after 1): ★ nested envelope on both hosts, selected by `--host` with `CLAUDE_PLUGIN_ROOT` set in both runs; ★ the literal block including the Codex-host egress line; ★ no file means `tiered`; ★ `hooks.json` passes `--host claude`; ★ `reap` invoked only when the script exists and not under `VIBE_RUNTIME_JOB=1`.
3. **`tools/share.test.ts`** (task 3, after P1, P2; fixtures: the IRIS mixed layout with two dangling links, the two multi-line-description skills): ★ byte-for-byte move and append-under-heading; ★ CLAUDE.md import plus section; ★ per-skill symlinks, "already migrated" skip, dangling links reported as repairs, identical-only merge, abort with summary, `--prefer`; ★ tar backup outside `.agents/`; ★ `.codex/skills` symlinked after merge; ★ frontmatter parser; ★ `name` filled, missing `description` aborts; ★ `plan` writes nothing; ★ `.claude/rules` untouched; ★ (only when P2 recorded a failure) `skillOverrides` written.
4. **`tools/init.test.ts`** (task 4, after 1): ★ preset by detection; ★ `contract-writer` always `claude`; ★ egress entries per provider, class, and host; ★ re-run preserves customizations; ★ `detect` shape; ★ `bridges` prints the exact commands including `$cc:setup`, nothing runs under `--dry-run`; ★ `[agents]` append-or-print; ★ never writes `network_access`.
5. **`tools/init-skill.test.ts`** (task 5, after 3, 4): ★ user-only on both hosts; ★ defaults named; ★ question-tool-or-conversation rule; ★ egress questions per class; ★ scope default user; ★ plan, confirm, apply; ★ `setup.md` hands off.
6. **`tools/conduct-skill.test.ts`, `tools/review-command.test.ts`, `tools/review-plan-command.test.ts`, `tools/quick-check-command.test.ts`, `tools/profile-policy.test.ts`, `tools/readme.test.ts`** (task 6, after 1, 2; the contract-writer retires the assertions listed in D): ★ no `PROFILE:` line or table; ★ conduct reads the block with the resolver fallback and defers dispatch mechanics to E; ★ `/vibe:review adversarial`, default-branch rule, guardians from routing; ★ quick-check reads `guardians`; ★ review-plan reads `plan-check`; ★ step 6 adversarial rule; ★ profile-policy states the routing file, presets, adapters, requested vs effective with the corrected env semantics, the pin, egress; ★ README documents the routing file, `/vibe:init`, the sharing layer, and no longer claims a PROFILE table or an env override; no-dated-id guards green.
7. **Release** (task 7, after 1 to 6): `bun release plugins/vibe` and the human gate; no new test.
8. **`tools/codex-dispatch-ref.test.ts`** (task 8): ★ sections present including the adapter table, the review-background note, and the orchestrator-sandbox rule; ★ the review commands reference it.
9. **`tools/runtime-job.test.ts`** (task 9, after P0; ships the harness and the fake): ★ argv and stdin, cwd equals `--cwd` (the fake prints `process.cwd()`); ★ scrubbed environment (the fake prints its env); ★ session id from the golden; ★ `--resume` argv; ★ pid file written atomically with `pid`, `pgid`, `lstart`, `owner`, `ownerLstart` and unlinked; ★ `--budget-ms 0` reports `budget-exceeded` with `sessionId: null`; ★ idle budget resets on output bytes; ★ ladder reaches SIGKILL against `trap-term` within the bounded wait and reports `escalated`; ★ `cancel` refuses a mismatched `lstart` and kills a matching one; ★ `reap` cleans an orphaned group whose owner is gone; ★ JSONL tee and single result line; ★ `resultPath` null on non-`done`.
10. **`tools/conduct-skill.test.ts`** (task 10, after 6, 8, 9, P4; prose): ★ plan fields, tags, and the conflict table; ★ run branch in its own worktree, dirty-checkout refusal, recorded SHA; ★ batch contract commit with `contract.json` and reference-worktree `expected-red.txt`; ★ direct `git worktree add` naming and the documented exception; ★ install with frozen lockfile and the orchestrator-sandbox rule; ★ expected-red equality; ★ tracked-content preflight per batch; ★ dispatch through `runtime-job.mjs`; ★ staged diff-versus-declaration check; ★ ledger, caps, FAILED, redirect kinds; ★ archive with attempt ref before reset, empty patch valid on early kill; ★ other-runtime fallback with the patch attached; ★ plan-order cherry-pick, subset suites from the manifest, abort on conflict; ★ guarded ff-only, inventory before removal, abort step; ★ report fields.
11. **`tools/guardrails.test.ts`** (task 11, after 10; absorbs the existing guardrails assertions): ★ secrets and never-commit bullets; ★ the Codex addendum lives in `guardrails.md`; contract-writer block unchanged.
12. **Live smoke** (task 12, after 10, 11): a batch of two parallel-safe `[codex]` tasks on a run branch of this repo. Task A runs with `task_budget_minutes=0`: expected row `sessionId: null`, empty patch, attempt ref present, fallback to Claude with the empty patch noted. Task B: the orchestrator waits for its first write, runs `cancel`, and asserts a non-empty archive patch, then re-dispatches and gives one redirect. Checklist: expected-red equality, session id on B, attempt refs, plan-order integration with subset suites, working branch untouched until the guarded fast-forward, `pgrep -g <pgid>` empty for every job, a job whose script was SIGKILLed is reaped at the next session start, no `.env*` in any worktree, evidence under `docs/evidence/vibe/<id>/`.
13. **`tools/skills-layout.test.ts`** (task 13; updates `tools/review-command.test.ts`, `tools/review-plan-command.test.ts`, `tools/quick-check-command.test.ts`, `tools/init-skill.test.ts` to the new paths): ★ no `commands/`; ★ frontmatter keys and values from the table; ★ `agents/openai.yaml` on the six user-only skills only; ★ `conduct` user-invocable with `abort`.
14. **`tools/harness-neutral.test.ts`** (task 14, after 13; updates `tools/review-command.test.ts`): ★ no Claude tool names in skill or agent bodies outside `references/harness-tools.md` and the scripts; ★ the single content list of the reference.
15. **`tools/gen-codex-agents.test.ts`** (task 15, after P3 pass): ★ golden files for the `split` and `uniform` routings into `--out`; ★ `name`, `description`, `developer_instructions`, `sandbox_mode` per role, model and effort only when not `default`; ★ project routing targets `.codex/agents/`; ★ stale generated files removed, hand-written untouched; ★ guardian bodies filtered by frontmatter.
16. **`tools/codex-packaging.test.ts` + `tools/manifests.test.ts`** (task 16): ★ each Codex manifest's version equals its own Claude manifest; ★ `hooks-codex.json` uses `$PLUGIN_ROOT` and `--host codex`; ★ marketplace entries in the full shape without versions; ★ `bumpManifests` pure and equal; ★ smoke script permissions, cleanup, direct hook assertion, authenticated call; ★ release runs the smoke only with `--with-codex-smoke`.
17. **`tools/init.test.ts`, `tools/conduct-skill.test.ts`, `tools/harness-neutral.test.ts`** (task 17, after P3 pass, 14, 15, 16): ★ init Codex-host steps (bridge, superpowers, `$cc:setup`, thread cap, hook reminder, never `network_access`); ★ Codex-host rules: `codex-agent` spawn or inlined fallback with the instruction-based caveat, `cc-companion` for Claude roles with job ids and cancel, identical batches, ledger, abort.
18. **Live smoke hosted in Codex** (task 18, after 15 to 17): the checklist of 12 plus install from the local marketplace with the seeded temporary home, hook trusted, all four `cc` paths exercised, README Codex section.

## Task shape (numbered, test-first, commit per task; each task lists its files)

Bun always. Runtime scripts are plain node `.mjs` under `plugins/vibe/scripts/` and `plugins/vibe/hooks/`. Tasks that share a file are ordered, never parallel.

**Phase 0, probes (about 1 hour; P0 committed)**
- P0: one real `codex exec --json` run, committed as `tools/fixtures/codex-exec.jsonl` with a README.
- P1: `tools/probes/p1.sh` prepares a scratch repo with a symlinked `.claude/skills` container; a fresh Claude session there runs `/skills`.
- P2: `tools/probes/p2.sh` prepares a scratch dir with the six-key skill and runs `codex exec --skip-git-repo-check -s read-only`; `skillOverrides` checked in Claude.

**Phase 1, routing + init + sharing (about 6 days, release `vibe--v1.6.0`)**
1. `plugins/vibe/routing/presets/*.json`, `plugins/vibe/routing/adapters.json`, `plugins/vibe/scripts/routing.mjs`. Run: `bun test tools/routing.test.ts`.
2. `plugins/vibe/hooks/resolve-routing.mjs`, `plugins/vibe/hooks/hooks.json`, `plugins/vibe/.claude-plugin/plugin.json`. After 1. Run: `bun test tools/hooks.test.ts`.
3. `plugins/vibe/scripts/share.mjs`, `tools/fixtures/share/`, `.gitignore` (`.share-backup-*.tar`). After P1, P2. Run: `bun test tools/share.test.ts`.
4. `plugins/vibe/scripts/init.mjs`. After 1. Run: `bun test tools/init.test.ts`.
5. `plugins/vibe/skills/init/SKILL.md`, `plugins/vibe/skills/init/agents/openai.yaml`, `plugins/vibe/commands/setup.md`. After 3, 4. Run: `bun test tools/init-skill.test.ts`.
6. `plugins/vibe/skills/conduct/SKILL.md`, `plugins/vibe/commands/review.md`, `plugins/vibe/commands/review-plan.md`, `plugins/vibe/commands/quick-check.md`, `plugins/vibe/skills/profile-policy/SKILL.md`, `README.md`; the contract-writer retires the listed assertions. After 1, 2. Run: `bun test tools/conduct-skill.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts tools/quick-check-command.test.ts tools/profile-policy.test.ts tools/readme.test.ts`.
7. `.gitignore` (`.worktrees/`), then `bun release plugins/vibe`. After 1 to 6. **Human gate:** `/vibe:init` here (user scope, routing only) and on `iris/app` (project scope: `share plan`, read, confirm, `apply`, which exercises the CLAUDE.md migration); curate IRIS's Claude-only section; ask Claude in IRIS for an AGENTS.md-only convention; re-run argent's skill sync and diff `.agents/skills`; open IRIS in Codex, confirm the shared skills and one convention; `/vibe:review` in Claude still dispatches `.claude/agents`.

**Phase 2, Codex doer tier (about 5 days, release `vibe--v1.7.0`)**
8. `plugins/vibe/skills/conduct/references/codex-dispatch.md`, `plugins/vibe/commands/review.md`, `plugins/vibe/commands/review-plan.md`. Run: `bun test tools/codex-dispatch-ref.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts`.
9. `plugins/vibe/scripts/runtime-job.mjs`, `tools/fixtures/harness.ts`, `tools/fixtures/fake-codex`. After P0. Run: `bun test tools/runtime-job.test.ts`.
- P4: `tools/probes/p4.sh` (one real exec, one resume).
10. `plugins/vibe/skills/conduct/SKILL.md` (steps 2 to 6). After 6, 8, 9, P4. Run: `bun test tools/conduct-skill.test.ts`.
11. `plugins/vibe/skills/conduct/guardrails.md`; `tools/guardrails.test.ts` absorbs the guardrails assertions from `tools/conduct-skill.test.ts`. After 10. Run: `bun test tools/guardrails.test.ts tools/conduct-skill.test.ts`.
12. Live smoke per contract 12; evidence under `docs/evidence/vibe/<id>/`. After 10, 11. Then `bun release plugins/vibe`.

**Phase 3, Codex host (about 6 days if P3 passes, about 2 if it fails; releases `vibe--v1.8.0`, `vibe-swift--v1.3.0`, `vibe-expo--v1.3.0` after task 18, or after 16 on the fail branch)**
- P3 first: `tools/probes/p3/` holds the two hand-written agent fixtures; the gate in G records pass/fail per cell and the approvals seen.
13. `plugins/vibe/commands/*` moved to `plugins/vibe/skills/*/SKILL.md`, five new `agents/openai.yaml` (init's exists), `plugins/vibe/skills/conduct/SKILL.md` (frontmatter, `abort` argument), and the four test files it updates. Run: `bun test tools/skills-layout.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts tools/quick-check-command.test.ts tools/init-skill.test.ts`.
14. `plugins/vibe/skills/conduct/references/harness-tools.md`, all skill and agent bodies, `plugins/vibe/skills/clarify/SKILL.md`, `plugins/vibe/skills/fable-safe-authoring/SKILL.md`, `tools/review-command.test.ts`. After 13. Run: `bun test tools/harness-neutral.test.ts tools/review-command.test.ts`.
15. `plugins/vibe/scripts/gen-codex-agents.mjs`, `tools/fixtures/codex-agents/`. After P3 pass. Run: `bun test tools/gen-codex-agents.test.ts`.
16. `plugins/*/.codex-plugin/plugin.json`, `plugins/vibe/hooks/hooks-codex.json`, `.agents/plugins/marketplace.json`, `tools/manifests.ts`, `tools/release.ts`, `tools/codex-install-smoke.sh`. Run: `bun test tools/codex-packaging.test.ts tools/manifests.test.ts`; `claude plugin validate . --strict`; `tools/codex-install-smoke.sh`.
17. `plugins/vibe/scripts/init.mjs`, `plugins/vibe/skills/conduct/references/harness-tools.md`, `plugins/vibe/skills/conduct/SKILL.md`. After P3 pass, 14, 15, 16. Run: `bun test tools/init.test.ts tools/conduct-skill.test.ts tools/harness-neutral.test.ts`.
18. Live smoke hosted in Codex per contract 18. After 15 to 17. Then the three releases.

## Verification

- `bun test` and `bun run typecheck` green after every task; ★ assertions red before their task, green after. Baseline: 121 tests across 22 files, all green.
- `claude plugin validate . --strict` stays green (manifests only; the layout tests are the gate).
- Probe results (P0 to P4) recorded here before the dependent task starts.
- Live smokes 12 and 18 leave the named checklists as evidence under `docs/evidence/vibe/`.
- Each phase ends with its release(s).

## Risks

- **P3 may fail.** Then Codex-hosted conduct is unsupported and phase 3 shrinks to packaging and skills.
- **Resumed Codex sessions** may not keep sandbox or root (P4); fresh-exec redirects cost the doer's context.
- **Bridge-owned Claude jobs on a Codex host** use the `cc` plugin's job control, including its detached workers; VIBE records job ids and cancels through the bridge, and cannot do better than the bridge does.
- **Parallel doers** deviate from superpowers' rule; bounded by the conflict table, resources, the diff check, and serial integration.
- **Egress and host reads.** Every cross-provider run sends repo content to the other provider, and a Codex doer can read the whole filesystem. Mitigations: per-class acknowledgment, tracked-content preflight, no `.env*` in worktrees, a scrubbed child environment, sandbox network off, the doer block's rules.
- **Install lifecycle scripts** run with the developer's privileges under a frozen lockfile.
- **Rate limits and cost.** `max_parallel` 3, wall and idle budgets, a bounded ledger, an abort path.
- **Undocumented internals.** `installed_plugins.json`, Codex `[agents]` keys, hook trust, the compatibility `CLAUDE_PLUGIN_ROOT`, the `thread.started` event shape (frozen in P0). Each is asserted at run time and reported.

## Parked: shared memory across tools

Claude auto-memory is Markdown per project; Codex memory is SQLite and off on this machine; the formats do not interoperate. Codex has an `external_agent_memory_import` flag under development. MCP memory servers (OpenMemory by Mem0, mcp-memory-service, basic-memory, agentmemory) work in both harnesses, but durable shared knowledge belongs in git-tracked, human-curated files: AGENTS.md, `docs/specs`, `docs/plans`. Revisit only if personal cross-tool facts become a real need.

## Sources (verified 2026-09-04)

- Benchmarks and cost: Artificial Analysis, "Benchmarking GPT-6 Astra"; Vellum. Task-type observations: Composio "100+ hours", Leanware, Firecrawl, Superblocks, Addy Osmani "The Code Agent Orchestra". Launch coverage: 9to5Mac, VentureBeat, Lenny's Newsletter (2026-09-03).
- Codex docs: config reference (`sandbox_workspace_write.*`, `model_reasoning_effort`, `[agents]`), agent approvals and security (network off by default), subagents (`sandbox_mode` per custom agent, inheritance, live overrides), hooks, build-skills (`agents/openai.yaml`, skill paths, symlinks), build-plugins, AGENTS.md guide; openai/codex issues 14579, 15250.
- CLIs on this machine: `codex --help`, `codex exec --help`, `codex exec resume --help`, `codex login --help`, `codex plugin marketplace add --help`, `codex plugin add --help`, `codex plugin list --help`, `claude --help`, `claude plugin validate --help`, `bun install --help`.
- Claude Code docs: headless mode, permission modes, permissions, sandboxing, env vars (`CLAUDE_CODE_SUBAGENT_MODEL` since 2.1.251), skills (`skillOverrides`, symlinked entries), plugins reference.
- Bridges: `openai/codex-plugin-cc` v1.0.6 (installed copy inspected), `sendbird/cc-plugin-codex` and `sendbird/codex-marketplace` (README, marketplace manifest, `scripts/lib/claude-cli.mjs` presets, `scripts/claude-companion.mjs` usage).
- Precedent: `obra/superpowers` 6.3.0 skills named above.
- IRIS repo layout inspected on disk.
