# Multi-runtime VIBE: Claude + Codex as routed runtimes, one kit for both hosts

**Date:** 2026-09-04 (rev 4)
**Status:** draft, under `/vibe:review-plan`. Review log: rev 1 Codex `needs-rework` (28 findings); rev 2 Codex `needs-rework` (11 new, 6 open); rev 3 `needs-rework` from four Claude lenses (feasibility, consistency, architecture, conduct-readiness) plus Codex pass 3. Rev 4 is the resolution pass for all of it; the tables at the end record every finding and what changed.
**Motivation:** GPT-6 Astra (2026-09-03) makes Codex a second, cheaper, separately-metered coding runtime that is competitive with Claude on bounded implementation and terminal work. VIBE today is a Claude Code plugin that uses Codex only as an optional read-only cross-check at two gates. This spec turns VIBE into a harness-neutral kit: every role is routed by a config file to a runtime (`claude` or `codex`), both tools read the same project context and skills, conduct can run doers on Codex locally and in parallel, the Codex review commands become routed roles, and VIBE installs into and orchestrates from Codex with the same skill tree. A new model means one line in config, not a VIBE release.

## Decisions

| Decision | Choice |
|---|---|
| Scope | All three sub-projects in one spec, phased inside (routing + sharing, Codex doer tier, Codex host). |
| Who writes tests | Claude, always. `contract-writer.runtime` is pinned to `claude` in every preset and the resolver rejects any other value. |
| Routing rule | Role split + task-shape rule. `split` preset: implementation + mechanical edits on Codex; orchestration, contract, reviews, verify on Claude; escalation on Claude opus. The plan step tags `[claude]` for judgment-heavy tasks. |
| Where Codex doers run | Locally. Parallel only for plan-marked parallel-safe batches, one git worktree per task, created directly by conduct from a batch contract commit on a run-scoped branch. Codex Cloud is out of scope. |
| Dispatch primitive | `runtime-job.mjs`, a VIBE-owned script that spawns `codex exec` or `claude -p` as a child it keeps handles to, in its own process group, with a wall-clock and idle budget, a signal ladder ending in SIGKILL, a pid file, a reaper, and resume by session id. The sandbox is explicit per call: `codex exec -s`, and Claude's OS sandbox through `--settings`. Never `bypassPermissions`. The install step runs before dispatch, outside the sandbox, so sandboxed shells keep network off. |
| Bridge plugins | Used only for the review roles (`cross-check`, `adversarial`) and the review-plan brief (`plan-check`). Never for doers. |
| Canonical files | Tool-neutral: `AGENTS.md` (CLAUDE.md imports it) and `.agents/skills` (per-skill symlinks from `.claude/skills` and `.codex/skills`). |
| Codex host | Codex-runtime roles spawn as Codex-native subagents from generated custom-agent files (their model calls are Codex's own, not a nested shell). Claude-runtime roles need a nested `claude -p`, which only works when the host session allows sandbox network access; P3 decides, first thing in phase 3. |
| Routing config | `routing.json` under `~/.agents/vibe/` (user) and `.agents/vibe/` (project), injected at session start by a hook told its host explicitly. `/vibe:init` writes it with defaults on every question. |
| Egress | Acknowledged per provider and per dispatch class (`review`, `doer`), recorded in the routing file. A user-scope `doer` acknowledgment is never inherited by a project. |
| Shared memory | Researched, parked. Repo files are the shared memory. |

## Goals

1. **One routing file** decides, per role, the *requested* runtime, model, and effort. Changing a model never requires a VIBE change; any model string is accepted for either runtime. Native overrides still apply beneath and are reported.
2. **`/vibe:init`** sets everything up with a default on every question; `--yes` takes the same defaults.
3. **Both tools read the same project context and skills.**
4. **conduct runs doers on Codex** under `split`: a batch contract commit on a run branch, worktrees from it, owned jobs with budgets, Claude reviewing every Codex diff, a bounded attempt ledger with archive-and-reset fallback, and a terminal FAILED state.
5. **`cross-check`, `adversarial`, and `plan-check` are routed roles** on the non-host runtime.
6. **VIBE is installable in Codex** and orchestrates from there when P3 passes; when P3 fails, VIBE's skills still install in Codex and Codex-hosted conduct is reported unsupported.
7. **No cross-provider dispatch without a matching acknowledgment,** on either host.
8. No dated model id in any authored skill, agent, or reference body, and none in presets. The routing file, generated Codex agent files, and the README (dated) may name one.

## Non-goals

- Codex Cloud. Cross-tool memory. Porting superpowers to Codex (`superpowers@openai-curated` exists). Budget-aware failover. Changing the review split. Windows.
- Routing effort into Claude-native subagent dispatch: agent frontmatter pins effort today and keeps doing so; `claude-native` rows accept only `default`.

## Research summary (verified 2026-09-04; sources at the end)

- **Model split.** Codex (Astra) wins on cost per task, terminal work, bounded maintenance, low-interruption runs. Claude (Fable 5.1) wins on judgment, architecture, deep debugging, multi-file refactors, orchestration, tooling. Consensus practice: Claude plans and does the hard parts, Codex does bounded implementation and review; orchestrator/worker split, bounded tasks with pass/fail criteria, worktrees, plan approval, human-curated AGENTS.md.
- **Codex CLI 0.153.2 (help text on this machine).** `codex exec`: prompt from stdin when `-` or absent; `-C <dir>`; `-s read-only|workspace-write|danger-full-access`; `--add-dir`; `-m`; `-c key=value`; `--json` (JSONL events, includes `thread.started` with a thread id); `-o <file>` (last message only, written at the end). `codex exec resume <id> [-]` accepts `-m`, `-c`, `--json`, `-o`, `--skip-git-repo-check` and neither `-s` nor `-C`. `codex login status` exists. `codex plugin list --json` exists. `model_reasoning_effort` accepts `minimal|low|medium|high|xhigh`. In `workspace-write`, model-generated shell commands have **network off by default** (`sandbox_workspace_write.network_access = false`); `codex exec` has no interactive approval path. Custom agent files cannot override sandbox or network settings; subagents inherit the session sandbox.
- **Claude Code 2.1.260.** `claude -p` with `--output-format stream-json` (init event carries `session_id`), `--resume <id>`, `--effort low|medium|high|xhigh|max`, `--permission-mode acceptEdits|auto|bypassPermissions|manual|dontAsk|plan`, `--allowedTools`, `--settings <file-or-json>`, `--worktree`. `plan` mode is not a read-only guarantee (shell commands may run). Since 2.1.251 `CLAUDE_CODE_SUBAGENT_MODEL` is only a default; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` is the override. The OS sandbox (`sandbox.enabled`, `filesystem.allowWrite|denyRead|denyWrite`, `network.allowedDomains`, `autoAllowBashIfSandboxed`) confines Bash and its children on macOS via Seatbelt. Skills: a `<skill-name>` entry may be a symlink (documented); a symlinked container is not documented. `skillOverrides: "user-invocable-only"` can mark a skill user-only without editing it. `claude plugin validate --strict` validates the manifest only.
- **Codex plugins, hooks, skills (docs).** `.codex-plugin/plugin.json` fields `name`, `version`, `description`, `skills`, `hooks`, `interface` (`mcpServers` seen in shipped manifests). Plugin hooks receive `PLUGIN_ROOT` and a compatibility `CLAUDE_PLUGIN_ROOT`. A SessionStart hook returns `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. Plugin hooks are skipped until trusted in `/hooks`; `--dangerously-bypass-hook-trust` runs them for one invocation. Skills load from `.agents/skills` (symlinked folders included) and `~/.agents/skills`; `agents/openai.yaml` with `policy.allow_implicit_invocation: false` makes a skill user-only. Custom agents: `~/.codex/agents/*.toml` or `.codex/agents/*.toml` with required `name`, `description`, `developer_instructions`, optional `model`, `model_reasoning_effort`; spawned with `spawn_agent { agent_type, fork_turns }` where the tool advertises `agent_type`.
- **Bridge companions.** Installed `codex-companion.mjs` 1.0.6: `task --background` detaches its worker and writes the job record after spawning; resume recomputes the sandbox from `--write`; `--effort none|minimal|low|medium|high|xhigh`; `review`/`adversarial-review` take `--scope`, `--base`, `--model`, focus text (adversarial only), no effort, no prompt file, and their `--background` flag is parsed but ignored. Sendbird's `cc` plugin: `codex plugin marketplace add sendbird/codex-marketplace`, `codex plugin add cc@sendbird`, then `$cc:setup` (feature gates, writable roots, may require a Codex restart); its companion exposes `review`, `adversarial-review`, `task --prompt-file`; it runs `claude -p` with `dontAsk` and an OS-sandbox settings file. `/codex:transfer` is a session handoff, not a background runner.
- **Superpowers 6.3.0.** Ships one skill tree with a `.codex-plugin` manifest (skills only) and a marketplace file; its shell hook is not wired into the Codex manifest. `subagent-driven-development` forbids parallel implementers and requires a pre-dispatch conflict table. `using-git-worktrees` prefers the native worktree tool, skips creation when already in a worktree, asks consent, requires `.worktrees/` to be git-ignored, and asks the human on a red baseline. `finishing-a-development-branch` cleans only `.worktrees/`, refuses removal on uncommitted files, and refuses its menu on a red suite. This spec deviates from those rules deliberately and says where.
- **IRIS (`~/Projects/iris/app`), the migration test case.** `.claude/skills` is mixed: 26 symlinks into `../../.agents/skills/` plus 5 real dirs; `.agents/skills` has 27 dirs, two with multi-line `description:` scalars; `.codex/skills/plan-feedback` exists; `.worktreeinclude` copies `.env*` into native Claude worktrees; argent regenerates 18 `argent-*` skills into `.claude/skills`; `.claude/agents/` holds `README.md` and `references/` beside the agent files. This repo has no `CLAUDE.md` or `AGENTS.md`.

## Changes

### A. Routing file, presets, adapters, resolver, session injection (phase 1)

**File** `routing.json`. Requested-routing precedence, highest first: a one-run argument (`/vibe:conduct split <task>`, or `doer=claude <task>`), project `.agents/vibe/routing.json`, user `~/.agents/vibe/routing.json`, then the preset named by `profile`. When neither file exists the profile is `tiered`. Effective routing may still differ, and the resolver's report says so per host: on Claude, a `model` passed at dispatch beats `CLAUDE_CODE_SUBAGENT_MODEL` unless `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` is set; on Codex, the session's sandbox and approval policy bound every child.

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

- **Roles (13):** `doer`, `doer-mechanical`, `escalation`, `exploration`, `contract-writer`, `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians`, `cross-check` (companion `review`), `adversarial` (companion `adversarial-review`), `plan-check` (the `/vibe:review-plan` brief through the companion `task` path).
- **`runtime`:** `claude`, `codex`, `host`, or `cross` (the non-host runtime; valid only for `cross-check`, `adversarial`, `plan-check`). `contract-writer` accepts only `claude`.
- **`model`:** `default` (omit the flag; native resolution decides) or any non-empty string. Claude aliases `sonnet`, `haiku`, `opus`, `fable` are documented, not validated. Presets never contain an explicit id.
- **`effort`:** `default` (omit) or a level, validated per adapter row.
- **`egress`:** per provider, a list of acknowledged dispatch classes: `review` (read-only review roles and the brief), `doer` (write-capable doers, contract-writer, escalation). A project file must carry its own `doer` entry; a user-scope `doer` acknowledgment applies only to user-scope runs of repositories that have no project routing file and is never inherited by a project file. When a run needs a class that is not acknowledged it asks once; "no" reroutes doers to `host` and reports review roles as not performed.
- **Adapters** (`plugins/vibe/routing/adapters.json`, shipped, literal shape):

```json
{
  "claude-native": { "hosts": ["claude"], "runtime": "claude", "efforts": ["default"], "flags": [] },
  "claude-print":  { "hosts": ["claude", "codex"], "runtime": "claude", "efforts": ["default","low","medium","high","xhigh","max"], "flags": ["--model","--effort","--resume"] },
  "codex-exec":    { "hosts": ["claude", "codex"], "runtime": "codex", "efforts": ["default","minimal","low","medium","high","xhigh"], "flags": ["-m","-c model_reasoning_effort","resume"] },
  "codex-agent":   { "hosts": ["codex"], "runtime": "codex", "efforts": ["default","minimal","low","medium","high","xhigh"], "flags": ["model","model_reasoning_effort"] },
  "codex-companion": { "hosts": ["claude"], "runtime": "codex", "paths": { "review": [], "adversarial-review": [], "task": ["default","none","minimal","low","medium","high","xhigh"] } },
  "cc-companion":    { "hosts": ["codex"], "runtime": "claude", "paths": { "review": [], "adversarial-review": [], "task": ["default","low","medium","high","xhigh","max"] } }
}
```

  Role-to-row rule: `cross-check` and `adversarial` use the host's companion row (`codex-companion` on Claude, `cc-companion` on Codex) with the `review` or `adversarial-review` path, whose effort list is empty, so their effort must be `default`; `plan-check` uses the companion `task` path. Every other role resolves by (host, runtime): Claude host + `claude` → `claude-native`; Claude host + `codex` → `codex-exec`; Codex host + `codex` → `codex-agent`; Codex host + `claude` → `claude-print`. A route with no row on the given host is an error naming the role and host.
- **Presets** in `plugins/vibe/routing/presets/{uniform,tiered,split}.json`, each listing all 13 roles. `uniform`: every role `host`/`default`/`default`, except `contract-writer` (`claude`) and the three review roles (`cross`/`default`/`default`). `tiered`: `doer` `claude`/`sonnet`, `doer-mechanical` `claude`/`haiku`, `escalation` `claude`/`opus`, `exploration` `claude`/`sonnet`, `contract-writer` `claude`/`default`, reviewers, verifiers, and `guardians` `claude`/`opus`, the three review roles `cross`/`default`/`default`; all efforts `default` (frontmatter pins them on native dispatch). `split`: `doer` `codex`/`default`/`high`, `doer-mechanical` `codex`/`default`/`medium`, `escalation` `claude`/`opus`/`default`, `exploration` `claude`/`sonnet`/`default`, `contract-writer` `claude`/`default`/`default`, reviewers, verifiers, and `guardians` `claude`/`opus`/`default`, `cross-check` and `adversarial` `cross`/`default`/`default`, `plan-check` `cross`/`default`/`xhigh`. A user file names a preset and overrides only what differs; merge is per role key.
- **Resolver** `plugins/vibe/scripts/routing.mjs`: `resolve --host claude|codex [--cwd <dir>] [--profile <p>] [--set role=runtime:model:effort ...] [--json|--markdown]`. `--host` is always required. Validates roles, runtimes, the `contract-writer` pin, adapter rows and efforts, egress classes; reports the source of every field and the host's native-override note; errors name the offending path.
- **Session injection.** `plugins/vibe/hooks/resolve-routing.mjs --host <host>` runs on SessionStart and emits the nested envelope both harnesses document, with this literal block as `additionalContext` (values illustrative):

```
<VIBE_ROUTING host="claude" profile="split" source="user:~/.agents/vibe/routing.json">
| role | runtime | adapter | model | effort | source |
| doer | codex | codex-exec | default | high | preset:split |
…
max_parallel: 3
task_budget_minutes: 30
task_idle_minutes: 10
egress: openai=review,doer
native-overrides: claude: dispatch model beats CLAUDE_CODE_SUBAGENT_MODEL unless CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1
</VIBE_ROUTING>
```

  `hooks/hooks.json` passes `--host claude`; `hooks-codex.json` passes `--host codex`. Environment variables are never consulted for the host. The hook also runs `runtime-job.mjs reap` (see E) so stale job groups from a killed session are cleaned at the next session start.

### B. `/vibe:init` (phase 1, extended in phase 3)

A user-only skill at `plugins/vibe/skills/init/SKILL.md` (Claude: `disable-model-invocation: true`; Codex: `agents/openai.yaml` with `policy.allow_implicit_invocation: false`), backed by `plugins/vibe/scripts/init.mjs` with `detect --json`, `write`, `bridges`, `show`.

Questions go through the harness's question tool when the session exposes one; otherwise plain conversation with the default marked, one question per message.
1. **Detect.** Claude CLI and version; Codex CLI, version, `codex login status`; bridges (`codex@…` from `~/.claude/plugins/installed_plugins.json`; `cc@sendbird` and `superpowers@openai-curated` from `codex plugin list --json`); tools that write into `.claude/skills` (argent, detected by its `.claude/rules/argent.md` marker); node.
2. **Preset.** Default `split` when the other runtime is installed and logged in, else `tiered`.
3. **Customize roles?** Default no. `contract-writer` is shown but not editable.
4. **Egress.** One question per provider and class the resolved routing needs on this host; default "acknowledged".
5. **Scope.** Default user. Project scope runs the sharing layer (C) as plan, confirmation, apply, and writes a project routing file that carries its own egress entries.
6. **Write and verify.** `init.mjs write --host <host> --yes …`, then `bridges install --host <host>` for anything missing: Claude host `claude plugin install codex@ysainson`; Codex host `codex plugin marketplace add sendbird/codex-marketplace --ref <tag>` (the tag is recorded in `adapters.json` under `cc-companion.pin` and in the README, dated), `codex plugin add cc@sendbird`, `codex plugin add superpowers@openai-curated`, then the `$cc:setup` step and its restart check. Then `show` prints the resolved table, bridge readiness, the hook-trust reminder on Codex, and the list of tools that write into `.claude/skills`. On a Codex host it also ensures `agents.max_concurrent_threads_per_session >= max_parallel + 3` and, when phase 3's P3 requires it, `sandbox_workspace_write.network_access = true`: if `~/.codex/config.toml` has no `[agents]` (or `[sandbox_workspace_write]`) table the block is appended verbatim; if the table exists the exact lines to change are printed for the user, never rewritten in place (plain node has no TOML round-trip).

Re-running shows current values as the defaults. `/vibe:setup` calls this flow as its final step.

### C. Sharing layer (phase 1)

`plugins/vibe/scripts/share.mjs` with `plan` (prints every operation, writes nothing) and `apply` (only after explicit confirmation, at both scopes, after writing a backup).

- **Context.** `AGENTS.md` at the repo root is canonical. `CLAUDE.md` becomes `@AGENTS.md` plus a `## Claude Code only` section. Migration moves the CLAUDE.md body into AGENTS.md byte for byte, or appends it under `## Imported from CLAUDE.md` when AGENTS.md exists. Curation is a human edit afterwards. `.claude/rules/*.md` are untouched.
- **Skills.** `.agents/skills/` is canonical. `share apply` creates one symlink per skill directory from `.claude/skills/<name>` and `.codex/skills/<name>` to `../../.agents/skills/<name>` (the documented per-entry form); replacing the whole container with one symlink is enabled only after P1 passes. The union walk resolves symlinks: an entry already pointing into `.agents/skills` is "migrated, skip"; same-named directories merge only when identical; any differing file aborts with a per-file diff summary unless `--prefer claude|agents|codex`. The backup is a tar under `<repo>/.share-backup-<timestamp>.tar` (git-ignored) or `$TMPDIR` at user scope, never inside `.agents/`. Frontmatter is parsed by a small block parser that handles `key: value`, continuation lines, and `>`/`|` scalars; every shared skill must carry `name` and `description`; a missing `name` becomes the directory name; a missing `description` aborts with the list.
- **Regenerating tools.** `init show` lists tools that write into `.claude/skills` (argent); the phase 1 human gate re-runs argent's skill sync and diffs `.agents/skills` afterwards to confirm writes land through the per-skill symlinks rather than replacing them.
- **Third-party plugins** are not shared by file.
- **Probes before building C:** P1, Claude Code follows a symlinked `.claude/skills` container (start a fresh session, run `/skills`); P2, Codex lists and reads a skill carrying `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `allowed-tools` (`codex exec --skip-git-repo-check -s read-only` one-liner). If Codex rejects any key, the shared dir keeps spec-only keys, the Claude-only keys move under `metadata`, and `share apply` writes `skillOverrides: "user-invocable-only"` into `.claude/settings.json` for user-only skills.

### D. VIBE reads the routing file (phase 1)

- **conduct** drops the `PROFILE:` line and the hardcoded table, reads the injected `<VIBE_ROUTING>` block (fallback: run the resolver with the host it runs in), and rewrites its steps 3 to 5 as described in E. Contract 6 deletes the three existing tests that assert the table.
- **`/vibe:review`** reads `roles.cross-check`, `roles.adversarial`, and `roles.guardians`; `/vibe:quick-check` reads `roles.guardians`. `/vibe:review adversarial [focus]` runs the `adversarial` role through the host's companion `adversarial-review --scope working-tree|--base <default-branch> [focus]`; the default branch is `git symbolic-ref refs/remotes/origin/HEAD`, falling back to `main`. Effort is config-owned there.
- **`/vibe:review-plan`** reads `roles.plan-check` (runtime and effort) for its Step 3 brief.
- **conduct step 6** may run `adversarial` on the final diff when the change is high-stakes or requested. Never per-subtask.
- **profile-policy** is rewritten: the routing file, presets, adapters, `default`, requested vs effective routing with the corrected `CLAUDE_CODE_SUBAGENT_MODEL` semantics, the `contract-writer` pin, egress classes.
- **Egress rule, all commands and both hosts:** an acknowledged class is never asked about again; otherwise one question per run; "no" reroutes doers to `host` and marks review roles not performed (never "performed on host").

### E. Codex doer tier in conduct (phase 2)

**Shared contract** `plugins/vibe/skills/conduct/references/codex-dispatch.md`: locate, assert, requested-routing report, all-stage failure wording, the adapter table, and the note that companion `--background` is a no-op on review paths.

**Job script** `plugins/vibe/scripts/runtime-job.mjs`.

- `run --adapter codex-exec|claude-print --cwd <dir> --prompt-file <file> --mode read-only|write --pid-file <file> --result <file> --budget-ms <n> --idle-ms <n> [--model <id>] [--effort <level>] [--resume <session-id>] --json`
- Spawns the child with `{ cwd, detached: true, stdio: ["pipe","pipe","pipe"] }`, keeps the handles, never calls `unref()`. `detached: true` is what gives the child its own process group; the trade-off is that a SIGKILLed script leaves the group alive, which is why the pid file and reaper exist. Immediately after spawn it writes the pid file `{ pid, pgid, startedAt, nonce, adapter, cwd }` and unlinks it on exit.
- Child stdout is teed to `<result>.jsonl`; the script's own single JSON line is the last line of its stdout: `{ adapter, sessionId, status: done|failed|cancelled|budget-exceeded|idle-exceeded|killed, escalated, exitCode, durationMs, resultPath, logPath }`. `sessionId` is read from `thread.started` (Codex) or the stream-json `init` event (Claude) and may be null when the child died before emitting it. `resultPath` is null when the child did not finish.
- Budget: `--budget-ms` is wall clock (0 kills immediately after spawn, for smokes); `--idle-ms` restarts on every child event. Either elapsing triggers the ladder: `codex-exec` SIGTERM, 10 s, SIGKILL, 5 s reap; `claude-print` SIGINT, 10 s, SIGTERM, 10 s, SIGKILL, 5 s reap; all signals go to the negative pgid. The script returns only after the child is reaped or the reap wait expires (`escalated: true`).
- `cancel --pid-file <file>`: verifies `pgid` and `startedAt` against `ps -o pgid=,lstart=` before signalling, runs the same ladder, waits, unlinks. `reap --dir <dir>`: applies `cancel` to every pid file whose process is gone or whose identity no longer matches.
- `codex-exec`: `codex exec -C <cwd> -s read-only|workspace-write [-m <id>] [-c model_reasoning_effort=<e>] --json -o <result> -`, prompt on stdin; sandbox network stays off (the install already happened); `--resume` runs `codex exec resume <id> -` with `-m`, `-c`, `--json`, `-o` only, cwd set by the spawn. Whether a resumed session keeps its sandbox and root is checked by P4 (below); until proven, redirects on `codex-exec` use a fresh `codex exec` with the redirect prompt plus the archived diff.
- `claude-print`: `claude -p --output-format stream-json --settings <temp settings file> [--model <id>] [--effort <e>] [--resume <id>]`, prompt on stdin, cwd = the worktree, no `--bare` (the repo's AGENTS.md, skills, hooks, and MCP servers load by design; the subscription login is used). Mode `write`: `--permission-mode acceptEdits` with settings `{ sandbox: { enabled: true, autoAllowBashIfSandboxed: true, filesystem: { allowWrite: [".", "<tmp>"], denyRead: ["~/.codex", "~/.claude/**/auth*", "**/.env*"] }, network: { allowedDomains: [] } }, permissions: { deny: ["Read(**/.env*)", "Read(~/.codex/**)"] } }`. Mode `read-only`: `--permission-mode dontAsk --allowedTools Read,Glob,Grep,Bash` with the same settings except `allowWrite: ["<tmp>"]`; Bash is allowed only because the OS sandbox confines it. The settings file is written 0600 in a 0700 dir and removed on exit.

**Plan step (conduct step 3, rewritten).** The plan lists, per task: files (the declared file set), exclusive resources (ports, simulator or device, database, build cache, docker), whether it changes dependencies, lockfiles, generated outputs, or a shared interface, and the runtime tag (`[codex]` under `split`, `[claude]` when the task needs judgment its contract cannot carry, runtime secrets to pass its contract, or was escalated). Two tasks are parallel-safe only when their file sets are disjoint, their resources are disjoint, neither depends on the other, and neither changes dependencies, lockfiles, generated outputs, or a shared interface the other imports; the plan writes the pairwise conflict table superpowers' dispatch scan requires and groups parallel-safe tasks into batches. Everything else is serial.

**Run branch and batch contract (conduct steps 2 and 4, rewritten).** A run creates `vibe/run-<id>` from the working branch; the working branch is never touched until the run integrates green. Per batch: the contract-writer writes the batch's tests, the orchestrator runs them, records the failing test ids as `expected-red.txt` in the run evidence dir (`docs/evidence/vibe/<run>/`, outside every worktree), and commits `test(<batch>): contract for tasks N-M (expected red)` on the run branch. Worktrees are created by conduct itself, `git worktree add .worktrees/vibe-<run>/<task> -b vibe/<run>/<task> <contract-sha>`, a documented exception to the superpowers worktree skill (its native-tool preference, its skip-when-already-in-a-worktree rule, and its consent question do not apply to batch dispatch; `.worktrees/` is added to `.gitignore` by an explicit task). Nothing copies `.worktreeinclude` files: the worktree contains no `.env*`. The orchestrator then runs the project's install step in the worktree, outside any sandbox, with `--frozen-lockfile` or the project's equivalent, and runs the suite: the failing set must equal `expected-red.txt`, otherwise the human gate the worktree skill requires is raised.

**Secrets preflight.** Before the first cross-provider dispatch of a run, the orchestrator scans every worktree (tracked and untracked, `git status --short --untracked-files=all` plus content patterns) with the same credential patterns `/vibe:review` uses, and the prompt file. A hit reroutes the task to `host` and is reported. The doer block gains: "Never read, print, or send secret-bearing files (`.env*`, key or credential files, `~/.claude`, `~/.codex`); if a task seems to need one, stop and report." and "Never commit or run git write commands; the orchestrator stages and commits."

**Dispatch of one Codex task.**
1. Assert the CLI and login; failure enters the attempt ledger as an adapter failure.
2. Prompt file in the session temp dir: goal and why, scope and file set, the contract and how to run it, "conventions are in AGENTS.md", the doer block verbatim, the Codex addendum (the install is done; run the contract and report it red first; the worktree path is the working root; git may be read-only or fail inside the sandbox, report instead of working around it; report in the doer format).
3. `runtime-job.mjs run --adapter codex-exec --mode write --cwd <worktree> …` in a background shell job; completion is the collection mechanism. `--model` only when routing names one.
4. Up to `max_parallel` jobs in flight, all from one batch.

**After a job.** The orchestrator compares `git diff --name-only <contract-sha>` in the worktree with the declared file set; any extra path, and any lockfile or generated output, is an automatic redirect before the review passes. Then baseline-aware diff (`git add -A`, `git diff --cached <contract-sha>`) and the two review passes.

**Attempt ledger.** Per task: `{ attempt, runtime, adapter, sessionId, worktree, status, archivePath }`. A redirect binds to the current attempt and resumes its session (`--resume <session-id> --mode write`; a null session id means a fresh dispatch with the archived diff). Caps: two redirects, then escalation (the `escalation` role, same worktree, new attempt); one fallback per task (below); an escalation failure marks the task FAILED, the batch stops, and the report lists every archive. There is no unbounded loop.

**Failure and fallback.** On adapter failure, `failed`, `budget-exceeded`, `idle-exceeded`, `cancelled`, `killed`, or a rate limit: (1) confirm the job is terminal (the script returned; a stale pid file goes through `cancel`); (2) archive: `git add -A`, `git diff --cached --binary <contract-sha> > docs/evidence/vibe/<run>/<task>-attempt<n>.patch`, plus `<result>.jsonl`, and a ref `refs/vibe/attempts/<run>/<task>-<n>` on the worktree tip; (3) `git reset --hard <contract-sha> && git clean -fd`; (4) dispatch the other runtime (`escalation` if the task was already redirected, else `doer` resolved with runtime swapped to the non-failing one), with the archived patch attached to the prompt as a prior attempt to review before reuse; a crossing whose class is not acknowledged asks, and "no" marks the task FAILED. The report names the stage and reason.

**Integration.** Strictly in plan order, one task at a time, on the run branch: cherry-pick the task's implementation commit (made by the orchestrator in the worktree after acceptance); on conflict, `git cherry-pick --abort` and redirect the task with the conflicting hunks as text and the run branch tip as its new base (fresh worktree). After integrating task K run K's contract subset plus the whole suite minus the contract tests of not-yet-integrated batch tasks; the full suite runs after the batch's last integration. Accepted-but-not-yet-integrable worktrees are held and named in the report. When the run integrates green, the run branch fast-forwards into the working branch; an abandoned run leaves the working branch untouched and the run branch as evidence. Conduct removes its own worktrees (`git worktree remove --force` only after archive or integration) and deletes task branches after the attempt refs exist.

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
| init | init | `[--yes]` | true | false |
| review | review | `[adversarial focus]` | absent | no file |
| quick-check | quick-check | none | absent | no file |
| conduct | conduct | `[task, or preset/role overrides]`; `user-invocable: false` removed; `commands/conduct.md` deleted | absent | no file |

- Skill and agent bodies stop naming Claude tools. `plugins/vibe/skills/conduct/references/harness-tools.md` is the single mapping: subagent dispatch (Agent tool with `model` vs `spawn_agent` with `agent_type` or the inlined-instructions spawn), question tool (AskUserQuestion vs plain conversation), background shell job (Bash `run_in_background` vs a forwarding subagent), waits in 5 to 10 minute stretches, redirects via `--resume`, plugin root variable, the role table from G with modes, the read-only exploration prompt, and "trust the actual tool list over this file". Contract 14's scan excludes `commands/` (task 14 depends on task 13, which deletes it).

### G. Roles on a Codex host (phase 3)

| role | source | Codex-host adapter | mode |
|---|---|---|---|
| doer, doer-mechanical, escalation | `agents/doer.md`, `agents/doer-mechanical.md` | `codex-agent` (generated `~/.codex/agents/vibe-<role>.toml`: `name = "vibe-<role>"`, `description`, `developer_instructions` = body, `model` when not `default`, `model_reasoning_effort` when not `default`) | inherits the session sandbox; the session must be `workspace-write` |
| contract-writer | `agents/contract-writer.md` | `claude-print` | write |
| exploration | the read-only exploration prompt | inlined-instructions spawn of the default agent | inherits |
| reviewer-spec, reviewer-quality, verifier, security-verifier, guardians (overlay and project agents, filtered by frontmatter, not by glob) | the matching agent bodies | `claude-print` under `split`; `codex-agent` under `uniform`, where read-only is instruction-based because custom agents cannot narrow the session sandbox | read-only where enforceable |
| cross-check, adversarial, plan-check | the `cc` companion | `cc-companion` | n/a |

- `gen-codex-agents.mjs` regenerates the `vibe-*.toml` files on every `/vibe:init` run from the routing file, removes stale generated files, never touches hand-written ones. When the installed spawn tool does not advertise `agent_type`, the adapter spawns the default agent with the same instructions inlined.
- **P3 (first task of phase 3, hard gate).** In a Codex session on this repo, with the host's `sandbox_workspace_write.network_access` at its current value and then at `true`: (a) does the spawn tool advertise `agent_type`; (b) does a `codex-agent` spawn of `vibe-doer` edit a scratch worktree; (c) does a forwarding subagent's `runtime-job.mjs run --adapter claude-print --mode read-only` and `--mode write` reach the API and, for write, edit the worktree; (d) which approvals were requested. Pass: (b) and both (c) cells pass with `network_access = true` and no approval. Then init sets `network_access = true` on Codex hosts (with the user's consent, since it widens the host session's own sandbox) and phase 3 proceeds. Fail: phase 3 ships packaging and skills only (tasks 13, 14, 16), the harness-tools reference states that Codex-hosted conduct is unsupported, and tasks 17 and 18 are dropped from this spec.
- **P4 (before task 10).** From a Claude session: `codex exec -C <scratch worktree> -s workspace-write --json` creates a file; `codex exec resume <id> -` is asked to create a second file; pass when the second file lands in the same worktree. Fail: `codex-exec` redirects stay on the fresh-exec path.

### H. Codex packaging (phase 3)

- `plugins/vibe/.codex-plugin/plugin.json`: `name`, `version` (equal to the Claude manifest), `description`, `skills: "./skills/"`, `hooks: "./hooks/hooks-codex.json"`, minimal `interface`. Same for `vibe-swift` and `vibe-expo` (skills only).
- `plugins/vibe/hooks/hooks-codex.json`: SessionStart `node "$PLUGIN_ROOT/hooks/resolve-routing.mjs" --host codex`.
- `.agents/plugins/marketplace.json` at the repo root: `name: "ysainson"`, `interface.displayName`, entries `{ name, source: { source: "local", path: "./plugins/<name>" }, policy: { installation: "AVAILABLE", authentication: "ON_USE" }, category: "Developer Tools" }` for the three plugins; it carries no versions.
- `tools/manifests.ts`: pure `bumpManifests(claude, codex, version)`; `tools/release.ts` reads both, asserts equality, writes and stages both in one commit. The Codex install smoke runs only with `bun release --with-codex-smoke` or in the phase 3 gate, never on every release.
- `tools/codex-install-smoke.sh`: a 0700 temporary `CODEX_HOME` seeded with a 0600 copy of `auth.json` and removed on EXIT/INT/TERM, never archived; `codex plugin marketplace add <repo path>`, `codex plugin add vibe@ysainson`, `codex plugin list --json` shows it enabled; the hook script is executed directly with `--host codex` and its envelope asserted (no model echo check).

### I. Codex-hosted dispatch and the Claude bridge (phase 3, only if P3 passes)

The Codex primary thread orchestrates with the same conduct skill. `codex` roles spawn through `codex-agent`; `claude` roles run `runtime-job.mjs claude-print` inside a forwarding subagent (default agent, `fork_turns: "none"`, medium effort) that runs exactly one command and returns its JSON line; cancel from the orchestrator is through the pid file. Worktrees, batches, the ledger, and the failure rule are identical. `cross-check`, `adversarial`, and `plan-check` go through the `cc` companion. `/vibe:init` on a Codex host installs the bridge and superpowers as in B, runs `$cc:setup`, asserts `claude --version` and a one-line `claude -p` probe, reminds the user to trust the hook, and applies the thread-cap and network settings.

## Resolution log

### Rev 3 to rev 4 (four Claude lenses + Codex pass 3)

Critical findings, all resolved:

| # | source | finding | change |
|---|---|---|---|
| C1 | all | "own process group, never detached" self-contradictory; SIGTERM-only, unbounded wait; no pid-file producer; SIGKILLed script orphans the group | `detached: true` with retained handles, pid file with identity, signal ladder to SIGKILL with bounded reap, `cancel` identity check, `reap` at session start |
| C2 | Codex, arch | Post-integration full suite red until the batch's last task | Per-integration: task subset plus suite minus pending contracts; full suite at batch end |
| C3 | Codex | `bypassPermissions` unbounded | `acceptEdits` plus Claude's OS sandbox settings file, deny rules; read-only is `dontAsk` plus sandbox with write to tmp only |
| C4 | feasibility | `codex exec` sandbox has network off, so "install first" fails; no approval path | Install runs before dispatch outside the sandbox; sandbox network stays off; `--frozen-lockfile` |
| C5 | feasibility | `plan` mode is not read-only | Read-only mode redefined (C3) |
| C6 | feasibility, arch | Forwarding-subagent nested exec dead under the inherited sandbox; P3 late and criterion-less | `codex-agent` (native spawn) for codex roles; nested `claude-print` only with `network_access = true`; P3 first, with pass/fail cells and a fail branch |
| C7 | arch | Redirect on `codex exec resume` lands in the main repo (no `-C`) | Spawn `cwd` is the worktree for every call; P4 proves sandbox and root retention or redirects use fresh exec |
| C8 | arch | Fallback archived an empty patch (HEAD was the doer's commit) and lost work | Doers never commit; archive against the contract sha with an attempt ref before reset; patch handed to the fallback |
| C9 | arch | Global `egress` flag written for a read-only review authorizes whole-worktree doers everywhere | Per provider and class; project files carry their own `doer` entry; re-ask when the class widens |
| C10 | arch | `.worktreeinclude` copies real `.env*` into worktrees; preflight scanned only the prompt | No `.worktreeinclude` copying; worktree-wide scan before the first cross-provider dispatch; tasks needing secrets are `[claude]` on host |
| C11 | consistency | `cross-check` effort both forced `default` and routed | New `plan-check` role for the brief path |
| C12 | consistency | `tiered` undefined for the review roles | `tiered` spelled out, review roles `cross` |
| C13 | consistency, Codex | Fallback to `doer` on `host` re-dispatches the failing runtime on a Codex host | Fallback is the other runtime; unavailable means FAILED |
| C14 | readiness | Fake CLIs need JSON shapes nobody recorded | P0 captures golden transcripts into `tools/fixtures/` |
| C15 | readiness | `--budget-min` integer minutes untestable within bun timeouts; `0` undefined | `--budget-ms`, `--idle-ms`, `0` = immediate |
| C16 | readiness | Contract 6 collides with three green PROFILE tests | Contract 6 deletes them; contract-writer owns the deletion |
| C17 | readiness | Tasks 13 and 14 parallel by default yet conflicting; contract 14 never green while `commands/` exists | 14 depends on 13; scan excludes `commands/` |
| C18 | readiness | README contract has no test file | `tools/readme.test.ts` |
| C19 | readiness | Thread-cap edit needs a TOML round-trip plain node cannot do | Append when the table is absent, print otherwise |

Major findings, all resolved unless marked: attempt ledger with caps and a FAILED state; redirect binds to the current attempt; integration strictly in plan order with held worktrees; `cherry-pick --abort` on conflict and a fresh base; expected-red set equality instead of an eyeballed waiver; abandoned runs never touch the working branch (run-scoped branch); exclusive-resource field and pairwise conflict table; diff-versus-declaration check before review; lockfiles and generated outputs never in a doer diff; idle budget; `--add-dir` not granted, doers never run git writes; `stream-json` for Claude session ids; nullable `resultPath` and `sessionId`; a non-fake orphan check in the phase 2 smoke; P3 covers `claude-print` write; `.worktrees/` git-ignore task; conduct owns worktree removal; per-skill symlinks with the container behind P1; symlink-aware union walk with "already migrated"; backup outside `.agents/`; `.codex/skills` symlinked after merge; multi-line frontmatter parser; argent re-sync at the human gate; `$cc:setup` and restart in init; `CLAUDE_CODE_SUBAGENT_MODEL` semantics corrected in profile-policy; `claude-native` effort `default` only; quick-check reads `guardians`; adapter from `adapters.json`; `--host` always required; `--pid-file` producer; DAG edges (3 on P1/P2; 7 on 1 to 6; 10 on 6, 8, 9; 12 on 10, 11; 14 on 13; 17 on P3, 14, 15; 18 on 15 to 17); every task lists its files; contracts 10 and 17 labeled prose contracts with the live smokes as the behavioral gate and named checklists; task 13 lists all three affected test files; Codex-side detection via `codex plugin list --json`; `cc` tag pinned in `adapters.json`; release smoke opt-in; `claude plugin validate` kept as a check, not a gate; any model string accepted; `adapters.json` literal; `VIBE_ROUTING` literal; fixture harness contract (`FAKE_CLI_MODE=hang|fail|write|trap-term`); `claude-print --result` = captured stdout; the guardrails test consolidates the existing guardrails assertions; estimates re-budgeted to 6, 5, and 6 days; `sandbox_workspace_write.network_access` set by init only on Codex hosts after P3; `minimal` effort for `codex-exec`; JSONL tee; `--bare` decided against and stated; `tools` key corrected to `allowed-tools`; `.claude/agents` filtered by frontmatter; declined egress reports review roles as not performed. Not resolved, by decision: superpowers' no-parallel rule remains deliberately overridden, now bounded by the conflict table, resources, and the diff check.

Minor findings resolved: count corrected (22 of 28 rev 1 items resolved in rev 2), the rev 1 rows 9 and 16 annotated below, naming and `tools/` prefixes unified, the example routing file overrides something, the `commit` row keeps `allowed-tools`, the `init` row is a frontmatter spec, harness-tools has one content list, `--cwd <dir>`, block attributes enumerated, sources extended, effort enums explained, decisions use role names, overlay releases named (`vibe-swift--v1.3.0`, `vibe-expo--v1.3.0` after task 16), default-branch resolution stated, this repo's missing `CLAUDE.md` noted at the human gate, `sessionId: null` valid on early kills, signal ladder per adapter.

### Rev 2 to rev 3 (Codex pass 2)

N1 ownership (finalized in rev 4); N2 cleanup (finalized in rev 4); N3 contract order (finalized in rev 4); N4 sandbox per call (`codex exec -s`; Codex-host read-only is instruction-based under `uniform`, stated); N5 reviewer roles via `claude-print`; N6 generated agents removed then restored for the Codex host only, with `name`; N7 hook envelope and trust; N8 descriptions abort; N9 seeded auth with permissions and cleanup; N10 budget-zero smoke; N11 no companion background jobs on the doer path; rev 1 items 7, 8, 10, 11, 14, 18 as above.

### Rev 1 to rev 2 (Codex pass 1)

1 `--host` from manifests; 2 requested vs effective; 3 `default` omits; 4 per-adapter effort; 5 review effort config-owned; 6 `contract-writer` pin; 7 contract commit (finalized rev 4); 8 job control (finalized rev 4); 9 write on resume, now inherited on `codex-exec` and proven by P4 (rev 4 annotation); 10 fallback state (finalized rev 4); 11 parallel policy (finalized rev 4); 12 secrets rule; 13 merge and backups; 14 commands frontmatter; 15 sandbox table; 16 `default` omits both model and effort, native resolution decides (rev 4 annotation); 17 role inventory; 18 sandbox per call; 19 reverse-bridge source; 20 question fallback and thread cap; 21 `agent_type` not assumed; 22 superpowers on Codex; 23 marketplace shape; 24 `tools/manifests.ts`; 25 DAG and fixtures; 26 generated files exempt; 27 superpowers claim narrowed; 28 symmetric acknowledgment.

## Contracts (bun tests in `tools/`; ★ = failing-first)

Scripts are tested behaviorally against `tools/fixtures/`: a harness (`tools/fixtures/harness.ts`) that creates a temp dir, puts fake `codex` and `claude` executables first on `PATH`, and controls them through `FAKE_CLI_MODE=ok|hang|fail|write|trap-term` and `FAKE_CLI_SESSION=<id>`; the fakes record argv, cwd, and stdin, and replay the golden transcripts captured in P0. Contracts 10 and 17 are prose contracts on `conduct/SKILL.md` and the references; their behavior is gated by the live smokes' named checklists.

0. **P0 goldens** (probe, committed): `tools/fixtures/codex-exec.jsonl` and `tools/fixtures/claude-print.jsonl` captured from one real `codex exec --json` and one `claude -p --output-format stream-json` run, with the session-id field paths noted in a README beside them.
1. **`tools/routing.test.ts`** (task 1): ★ presets list all 13 roles and validate; ★ precedence with per-field sources; ★ per-role merge; ★ `default` valid, explicit ids accepted for both runtimes, ids rejected in presets, `cross` only on the three review roles, `contract-writer` only `claude`; ★ adapter rows and efforts per the literal `adapters.json` (`max` rejected on `codex-exec`, non-`default` rejected on `claude-native` and on companion review paths, `plan-check` accepts the task path list); ★ `--host` always required; ★ egress classes parsed and the project-never-inherits rule; ★ the host's native-override note.
2. **`tools/hooks.test.ts`** (task 2, after 1): ★ nested envelope on both hosts, selected by `--host` with `CLAUDE_PLUGIN_ROOT` set in both runs; ★ the literal block with its attributes and lines; ★ no file means `tiered`; ★ `hooks.json` passes `--host claude`; ★ the hook invokes `reap`.
3. **`tools/share.test.ts`** (task 3, after P1, P2; fixtures include the IRIS mixed layout and the two multi-line-description skills): ★ byte-for-byte move and append-under-heading; ★ CLAUDE.md import plus section; ★ per-skill symlinks, "already migrated" skip, identical-only merge, abort with summary, `--prefer`; ★ tar backup outside `.agents/`; ★ `.codex/skills` symlinked after merge; ★ frontmatter parser handles continuation and block scalars; ★ `name` filled, missing `description` aborts with the list; ★ `plan` writes nothing; ★ `.claude/rules` untouched; ★ `skillOverrides` written on the P2-fail branch.
4. **`tools/init.test.ts`** (task 4, after 1): ★ `write --yes` chooses the preset by detection; ★ `contract-writer` always `claude`; ★ egress entries per class and host, project file carries its own; ★ re-run preserves customizations; ★ `detect` shape (bridges via the named files and `codex plugin list --json`, writing tools); ★ `bridges` prints the exact commands including `$cc:setup` and runs nothing under `--dry-run`; ★ config-table append-or-print behavior.
5. **`tools/init-skill.test.ts`** (task 5, after 4): ★ user-only on both hosts; ★ defaults named; ★ question-tool-or-conversation rule; ★ egress questions per class; ★ scope default user; ★ plan, confirm, apply; ★ `setup.md` hands off.
6. **`tools/conduct-skill.test.ts`, `tools/review-command.test.ts`, `tools/review-plan-command.test.ts`, `tools/quick-check-command.test.ts`, `tools/profile-policy.test.ts`** (task 6, after 1, 2): ★ no `PROFILE:` line or table (the three existing table tests are deleted by the contract-writer); ★ conduct reads the block with the resolver fallback; ★ `/vibe:review adversarial`, default-branch rule, guardians from routing; ★ quick-check reads `guardians`; ★ review-plan reads `plan-check`; ★ step 6 adversarial rule; ★ profile-policy states the routing file, presets, adapters, requested vs effective with the corrected env semantics, the pin, egress classes; no-dated-id guards green.
7. **`tools/readme.test.ts`** (task 7, after 1 to 6): ★ README documents the routing file, `/vibe:init`, the sharing layer.
8. **`tools/codex-dispatch-ref.test.ts`** (task 8): ★ sections present including the adapter table and the review-background note; ★ the review commands reference it.
9. **`tools/runtime-job.test.ts`** (task 9, harness): ★ `codex-exec` argv and stdin, cwd equals `--cwd` (the fake prints `process.cwd()`); ★ `claude-print` argv per mode, settings file content, 0600/0700, removed on exit; ★ session id from the goldens; ★ `--resume` argv per adapter; ★ pid file written with identity and unlinked; ★ `--budget-ms 0` kills immediately and reports `budget-exceeded` with `sessionId: null`; ★ idle budget; ★ the ladder reaches SIGKILL against a `trap-term` fake within the bounded wait and reports `escalated`; ★ `cancel` refuses a mismatched identity and kills a matching one; ★ `reap` cleans a stale file; ★ JSONL tee and the single result line; ★ `resultPath` null on non-`done`.
10. **`tools/conduct-skill.test.ts`** (task 10, after 6, 8, 9; prose): ★ plan fields and the conflict table; ★ run branch and batch contract commit; ★ direct `git worktree add` with the documented exception and the `.worktrees/` ignore; ★ install before dispatch with frozen lockfile; ★ expected-red equality; ★ worktree-wide secrets preflight; ★ dispatch through `runtime-job.mjs`; ★ diff-versus-declaration check; ★ ledger, caps, FAILED; ★ archive with attempt ref before reset; ★ other-runtime fallback with the patch attached; ★ plan-order integration, subset suites, abort on conflict; ★ report fields.
11. **`tools/guardrails.test.ts`** (task 11; absorbs the existing guardrails assertions): ★ the secrets and never-commit bullets; ★ the Codex addendum; contract-writer block unchanged.
12. **Live smoke** (task 12, after P4, 10, 11): a batch of two parallel-safe `[codex]` tasks on a run branch of this repo; one task with `task_budget_minutes: 0` (fallback on a satisfiable contract, patch attached to the fallback prompt); the other with one redirect. Checklist: expected-red equality, session ids, attempt refs and archive patch non-empty, redirect on the same session or the fresh-exec path per P4, plan-order integration with subset suites, working branch untouched until the fast-forward, `pgrep -g <pgid>` empty for every job, no `.env*` in any worktree, evidence under `docs/evidence/vibe/<run>/`.
13. **`tools/skills-layout.test.ts`** (task 13; updates `tools/review-command.test.ts`, `tools/review-plan-command.test.ts`, `tools/init-skill.test.ts` to the new paths): ★ no `commands/`; ★ the frontmatter keys and values from the table; ★ `agents/openai.yaml` only on user-only skills; ★ `conduct` user-invocable.
14. **`tools/harness-neutral.test.ts`** (task 14, after 13): ★ no Claude tool names in skill or agent bodies outside `references/harness-tools.md` and the scripts; ★ the single content list of the reference.
15. **`tools/gen-codex-agents.test.ts`** (task 15, after P3): ★ golden TOML per codex-agent role with `name`, `description`, `developer_instructions`, model and effort emitted only when not `default`; ★ stale generated files removed, hand-written untouched.
16. **`tools/codex-packaging.test.ts` + `tools/manifests.test.ts`** (task 16): ★ the three Codex manifests with equal versions; ★ `hooks-codex.json` uses `$PLUGIN_ROOT` and `--host codex`; ★ marketplace entries in the full shape without versions; ★ `bumpManifests` pure and equal; ★ the smoke script's permissions, cleanup, and direct hook assertion; ★ release runs the smoke only with `--with-codex-smoke`.
17. **`tools/conduct-skill.test.ts` / `tools/harness-neutral.test.ts`** (task 17, after P3, 14, 15; prose): ★ Codex-host rules: `codex-agent` spawn or inlined fallback, forwarding subagent for `claude-print`, pid-file cancel, identical batches and ledger, `cc` companion for the three review roles, network and thread settings by init.
18. **Live smoke hosted in Codex** (task 18, after 15 to 17): the checklist of 12 plus install from the local marketplace with the seeded temporary home, hook trusted, README Codex section.

## Task shape (numbered, test-first, commit per task; each task lists its files)

Bun always. Runtime scripts are plain node `.mjs` under `plugins/vibe/scripts/` and `plugins/vibe/hooks/`. Tasks that share a file are ordered, never parallel.

**Phase 0, probes (about 1 hour, goldens committed)**
- P0: capture the two golden transcripts (one real `codex exec --json`, one `claude -p --output-format stream-json`), commit under `tools/fixtures/` with a README.
- P1: fresh Claude session with a symlinked `.claude/skills` container, `/skills` lists the skill.
- P2: Codex reads a skill carrying the six Claude-only keys; `skillOverrides: "user-invocable-only"` confirmed in Claude.

**Phase 1, routing + init + sharing (about 6 days, release `vibe--v1.6.0`)**
1. `plugins/vibe/routing/presets/*.json`, `plugins/vibe/routing/adapters.json`, `plugins/vibe/scripts/routing.mjs`. Run: `bun test tools/routing.test.ts`.
2. `plugins/vibe/hooks/resolve-routing.mjs`, `plugins/vibe/hooks/hooks.json`, `plugins/vibe/.claude-plugin/plugin.json` (hooks key). After 1. Run: `bun test tools/hooks.test.ts`.
3. `tools/fixtures/harness.ts` (shared with 9), `plugins/vibe/scripts/share.mjs`, `.gitignore` (`.share-backup-*.tar`). After P1, P2. Run: `bun test tools/share.test.ts`.
4. `plugins/vibe/scripts/init.mjs`. After 1. Run: `bun test tools/init.test.ts`.
5. `plugins/vibe/skills/init/SKILL.md`, `plugins/vibe/skills/init/agents/openai.yaml`, `plugins/vibe/commands/setup.md`. After 4. Run: `bun test tools/init-skill.test.ts`.
6. `plugins/vibe/skills/conduct/SKILL.md` (routing block, steps rewritten), `plugins/vibe/commands/review.md`, `plugins/vibe/commands/review-plan.md`, `plugins/vibe/commands/quick-check.md`, `plugins/vibe/skills/profile-policy/SKILL.md`; the contract-writer deletes the three PROFILE tests. After 1, 2. Run: `bun test tools/conduct-skill.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts tools/quick-check-command.test.ts tools/profile-policy.test.ts`.
7. `README.md`, `.gitignore` (`.worktrees/`), then `bun release plugins/vibe`. After 1 to 6. Run: `bun test tools/readme.test.ts`. **Human gate:** `/vibe:init` here (user scope; this repo has no CLAUDE.md, so only the routing path is exercised) and on `iris/app` (project scope: `share plan`, read, confirm, `apply`); curate IRIS's Claude-only section; ask Claude in IRIS for an AGENTS.md-only convention; re-run argent's skill sync and diff `.agents/skills`; open IRIS in Codex, confirm the shared skills and one convention; `/vibe:review` in Claude still dispatches `.claude/agents`.

**Phase 2, Codex doer tier (about 5 days, release `vibe--v1.7.0`)**
8. `plugins/vibe/skills/conduct/references/codex-dispatch.md`, `plugins/vibe/commands/review.md`, `plugins/vibe/commands/review-plan.md`. Run: `bun test tools/codex-dispatch-ref.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts`.
9. `plugins/vibe/scripts/runtime-job.mjs`, `tools/fixtures/` (fakes). After 3 (harness), P0. Run: `bun test tools/runtime-job.test.ts`.
- P4: resume retention probe (one real `codex exec`, one `resume`).
10. `plugins/vibe/skills/conduct/SKILL.md` (steps 2 to 6). After 6, 8, 9, P4. Run: `bun test tools/conduct-skill.test.ts`.
11. `plugins/vibe/skills/conduct/guardrails.md`; `tools/guardrails.test.ts` absorbs the guardrails assertions from `tools/conduct-skill.test.ts`. After 10 (shares the test file). Run: `bun test tools/guardrails.test.ts tools/conduct-skill.test.ts`.
12. Live smoke per contract 12; evidence under `docs/evidence/vibe/<run>/`. After 10, 11. Then `bun release plugins/vibe`.

**Phase 3, Codex host (about 6 days if P3 passes, about 2 if it fails; releases `vibe--v1.8.0`, `vibe-swift--v1.3.0`, `vibe-expo--v1.3.0`)**
- P3 first: the hard gate in G. Records pass/fail per cell and the approvals seen.
13. `plugins/vibe/commands/*` moved to `plugins/vibe/skills/*/SKILL.md`, `agents/openai.yaml` for the six user-only skills, `plugins/vibe/skills/conduct/SKILL.md` (frontmatter), and the three test files it updates. Run: `bun test tools/skills-layout.test.ts tools/review-command.test.ts tools/review-plan-command.test.ts tools/init-skill.test.ts`.
14. `plugins/vibe/skills/conduct/references/harness-tools.md`, all skill and agent bodies, `plugins/vibe/skills/clarify/SKILL.md`, `plugins/vibe/skills/fable-safe-authoring/SKILL.md`. After 13. Run: `bun test tools/harness-neutral.test.ts`.
15. `plugins/vibe/scripts/gen-codex-agents.mjs`. After P3 pass. Run: `bun test tools/gen-codex-agents.test.ts`.
16. `plugins/*/.codex-plugin/plugin.json`, `plugins/vibe/hooks/hooks-codex.json`, `.agents/plugins/marketplace.json`, `tools/manifests.ts`, `tools/release.ts`, `tools/codex-install-smoke.sh`. Run: `bun test tools/codex-packaging.test.ts tools/manifests.test.ts`; `claude plugin validate . --strict`; `tools/codex-install-smoke.sh`.
17. `plugins/vibe/scripts/init.mjs` (Codex-host steps), `plugins/vibe/skills/conduct/references/harness-tools.md`, `plugins/vibe/skills/conduct/SKILL.md` (Codex-host rules). After P3 pass, 14, 15, 16. Run: `bun test tools/init.test.ts tools/conduct-skill.test.ts tools/harness-neutral.test.ts`.
18. Live smoke hosted in Codex per contract 18. After 15 to 17. Then the three releases.

## Verification

- `bun test` and `bun run typecheck` green after every task; ★ assertions red before their task, green after. Baseline: 121 tests across 22 files, all green.
- `claude plugin validate . --strict` stays green (it validates manifests only; the layout tests are the gate).
- Probe results (P0 to P4) recorded here before the dependent task starts.
- Live smokes 12 and 18 leave the named checklists as evidence under `docs/evidence/vibe/`.
- Each phase ends with its release(s).

## Risks

- **P3 may fail.** Then Codex-hosted conduct is unsupported in this spec and phase 3 shrinks to packaging and skills.
- **Resumed Codex sessions** may not keep sandbox or root (P4); the fresh-exec redirect path costs the doer's context.
- **Parallel doers** deviate from superpowers' rule; bounded by the conflict table, resources, the diff check, and serial integration.
- **Egress.** Every cross-provider run sends repo content to the other provider. Mitigations: per-class acknowledgment, worktree-wide preflight, no `.env*` in worktrees, sandbox network off for shells, the doer block's rules.
- **Headless Claude doers under `acceptEdits` plus the OS sandbox** cannot answer prompts; anything outside the allowlist fails and is reported, which is the intended behavior.
- **Rate limits and cost.** `max_parallel` 3, wall and idle budgets, a bounded ledger.
- **Undocumented internals.** `installed_plugins.json`, Codex `[agents]` keys, hook trust, the compatibility `CLAUDE_PLUGIN_ROOT`, the `thread.started` event shape (frozen in P0 goldens). Each is asserted at run time and reported.

## Parked: shared memory across tools

Claude auto-memory is Markdown per project; Codex memory is SQLite and off on this machine; the formats do not interoperate. Codex has an `external_agent_memory_import` flag under development. MCP memory servers (OpenMemory by Mem0, mcp-memory-service, basic-memory, agentmemory) work in both harnesses, but durable shared knowledge belongs in git-tracked, human-curated files: AGENTS.md, `docs/specs`, `docs/plans`. Revisit only if personal cross-tool facts become a real need.

## Sources (verified 2026-09-04)

- Benchmarks and cost: Artificial Analysis, "Benchmarking GPT-6 Astra"; Vellum. Task-type observations: Composio "100+ hours", Leanware, Firecrawl, Superblocks, Addy Osmani "The Code Agent Orchestra". Launch coverage: 9to5Mac, VentureBeat, Lenny's Newsletter (2026-09-03).
- Codex docs: config reference (`sandbox_workspace_write.*`, `model_reasoning_effort`, `[agents]`), agent approvals and security (network off by default), subagents, hooks, build-skills (`agents/openai.yaml`, skill paths, symlinks), build-plugins, AGENTS.md guide; openai/codex issues 14579, 15250.
- CLIs on this machine: `codex --help`, `codex exec --help`, `codex exec resume --help`, `codex login --help`, `codex plugin marketplace add --help`, `codex plugin add --help`, `codex plugin list --help`, `claude --help`, `claude plugin validate --help`.
- Claude Code docs: headless mode, permission modes, permissions (rule syntax, `--settings`), sandboxing, env vars (`CLAUDE_CODE_SUBAGENT_MODEL` semantics since 2.1.251), skills (`skillOverrides`, symlinked entries), plugins reference.
- Bridges: `openai/codex-plugin-cc` v1.0.6 (installed copy inspected, including `spawnDetachedTaskWorker`), `sendbird/cc-plugin-codex` and `sendbird/codex-marketplace` (README, marketplace manifest, `scripts/lib/claude-cli.mjs` sandbox presets).
- Precedent: `obra/superpowers` 6.3.0 (`.codex-plugin`, marketplace file, `hooks/session-start`, `using-superpowers/references/codex-tools.md`, `subagent-driven-development`, `using-git-worktrees`, `finishing-a-development-branch`, `test-driven-development`, `executing-plans`).
- IRIS repo layout inspected on disk (`.claude/skills`, `.agents/skills`, `.codex/skills`, `.worktreeinclude`, `.claude/agents`).
