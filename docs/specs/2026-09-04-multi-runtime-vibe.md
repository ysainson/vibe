# Multi-runtime VIBE: Claude + Codex as routed runtimes, one kit for both hosts

**Date:** 2026-09-04 (rev 3. Rev 1 Codex verdict `needs-rework` with 28 findings; rev 2 folded them in and drew 11 new findings plus 6 partial or open ones; rev 3 resolves those by changing the dispatch primitive. Both resolution tables are at the end. The Codex pass on rev 3 was interrupted by the Codex usage limit at 14:16 CEST and is to be re-run after 15:18 CEST with the brief kept at `$TMPDIR/vibe-multi-runtime-review-brief-rev3.md`; rev 3 is therefore self-verified against the CLIs' help text, not yet Codex-verified.)
**Status:** draft (next gate is `/vibe:review-plan`)
**Motivation:** GPT-6 Astra (2026-09-03) makes Codex a second, cheaper, separately-metered coding runtime that is competitive with Claude on bounded implementation and terminal work. VIBE today is a Claude Code plugin that uses Codex only as an optional read-only cross-check at two gates. This spec turns VIBE into a harness-neutral kit: every role is routed by a config file to a runtime (`claude` or `codex`), both tools read the same project context and skills, conduct can run doers on Codex locally and in parallel, the Codex review commands become routed roles, and VIBE installs into and orchestrates from Codex with the same skill tree. A new model means one line in config, not a VIBE release.

## Decisions taken during the brainstorm and the review passes

| Decision | Choice |
|---|---|
| Scope | All three sub-projects in one spec, phased inside (routing + sharing, Codex doer tier, Codex host). |
| Who writes tests | Claude, always. `contract-writer.runtime` is pinned to `claude` in every preset and the resolver rejects any other value. The contract is the judgment step and a cross-model gate: Codex implements against tests it did not write. |
| Routing rule | Role split + task-shape rule. `split` preset: implementation + mechanical edits on Codex; orchestration, contract, reviews, verify on Claude; escalation on Claude opus. The plan step tags `[claude]` for judgment-heavy tasks. |
| Where Codex doers run | Locally, in parallel only for plan-marked parallel-safe tasks, one git worktree per task branched from a committed batch contract. Codex Cloud is out of scope. |
| Dispatch primitive (changed in rev 3) | A VIBE-owned job script that spawns `codex exec` or `claude -p` as a child process it owns, with an explicit sandbox or permission mode per call, a hard budget, cancel by kill, and resume by session id. The bridge plugins' companions are used only for the review roles (`review`, `adversarial-review`) and `/vibe:review-plan`'s existing read-only brief. No generated Codex role files: the sandbox is set per invocation, so no `agent_type` dependency. |
| Canonical files | Tool-neutral: `AGENTS.md` (CLAUDE.md imports it) and `.agents/skills` (`.claude/skills` is a symlink). |
| What Codex gets from VIBE | The whole kit, hosted natively: one source tree, per-harness manifests, user-only policy through `agents/openai.yaml` (approach A). |
| Routing config | `routing.json` under `~/.agents/vibe/` (user) and `.agents/vibe/` (project), injected at session start by a hook that is told its host explicitly. `/vibe:init` writes it with defaults on every question. |
| Cross-runtime dispatch | Symmetric through the job script: Claude host runs Codex doers with `codex exec`; Codex host runs Claude-routed roles with `claude -p`. Review roles cross through the `codex` plugin (Claude host) or the `cc` plugin (Codex host, marketplace `sendbird/codex-marketplace`). |
| Review commands | `/codex:review` and `/codex:adversarial-review` (and `$cc:review`, `$cc:adversarial-review`) become the routed roles `cross-check` and `adversarial`. Their effort is config-owned on the companion review paths. |
| Shared memory | Researched, parked. Repo files are the shared memory; per-tool auto-memory stays private. |

## Goals

1. **One routing file** decides, per role, the *requested* runtime (`claude`, `codex`, `host`, `cross`), model, and effort. Changing a model never requires a VIBE change. Native overrides still apply beneath it and are reported as such.
2. **`/vibe:init`** sets everything up: detects CLIs, logins, and bridges; asks each question with a preselected default so Enter-through works; writes the file; installs missing bridges; scaffolds the sharing layer after showing an exact plan; prints the resolved table. `--yes` on the writer takes the same defaults.
3. **Both tools read the same project context and skills.** `AGENTS.md` and `.agents/skills` are canonical.
4. **conduct runs doers on Codex** under the `split` preset: a committed batch contract, worktrees branched from it, owned child jobs with a hard budget, Claude reviewing every Codex diff, write-capable resumes for redirects, a confirmed-terminated and hard-reset fallback to a Claude doer on any Codex failure.
5. **`cross-check` and `adversarial` are routed roles.** `/vibe:review` and conduct's verify step can run either on the non-host runtime (`cross`), with the existing egress guard.
6. **VIBE is installable in Codex** (`codex plugin marketplace add ysainson/vibe`, `codex plugin add vibe@ysainson`) and orchestrates from there with the same skills and the same routing file; init makes sure superpowers is installed there too.
7. **No cross-provider dispatch without acknowledgment,** on either host.
8. No dated model id in any authored skill, agent, or reference body, and none in presets. The routing file and the README (dated) may name one.

## Non-goals

- Codex Cloud. Local worktrees only.
- Cross-tool memory (see the parked note).
- Porting superpowers to Codex (`superpowers@openai-curated` exists; init checks it is installed).
- Budget-aware failover.
- Changing the review split. Under `split`, reviewers and the verifier stay on Claude.
- Generated Codex custom-agent TOML files. Dropped in rev 3; the sandbox is explicit per `codex exec` call. Reconsidered only if P3 fails (see G).
- Windows.

## Research summary (verified 2026-09-04, sources at the end)

- **Codex (Astra) wins on cost per task** (about one fifth of the tokens of Opus 5 at xhigh; equals Fable 5 on the Coding Agent Index at less than half the cost), **terminal work** (Terminal-Bench 4.0: Astra 57.7, Fable 5.1 55.8, Opus 5 52.3), **bounded maintenance**, and **predictable low-interruption runs**.
- **Claude (Fable 5.1) wins on judgment** (Coding Agent Index 70 vs 67, Intelligence Index 65.7 vs 61.2, cleaner code in 67% of blind head-to-heads), architecture, deep debugging, multi-file refactors, greenfield, orchestration, and tool ecosystem.
- **Community consensus:** Claude plans and does the hard parts, Codex does bounded implementation, maintenance, extra coverage, and review; orchestrator/worker split, bounded tasks with pass/fail criteria, worktrees, plan approval, hooks, human-curated AGENTS.md. conduct already does all of them except having a non-Claude worker.
- **Interop facts (verified against installed artifacts and official docs):** both harnesses implement the Agent Skills spec. Codex reads `AGENTS.md` root-to-cwd, `.agents/skills` (symlinked folders included), `~/.agents/skills`; Claude reads `CLAUDE.md`, `.claude/skills`, `~/.claude/skills`. A skill's `agents/openai.yaml` may set `policy.allow_implicit_invocation: false`, which makes it user-only in Codex (`$skill` still works). Codex plugin manifests support `skills`, `hooks`, `mcpServers`, `interface`; plugin hooks receive `PLUGIN_ROOT` and a compatibility `CLAUDE_PLUGIN_ROOT`; a Codex SessionStart hook returns the same nested envelope Claude uses, `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`; plugin-bundled hooks are skipped until the user trusts them in `/hooks`, and `--dangerously-bypass-hook-trust` runs them for one invocation. Superpowers ships one skill tree with a `.codex-plugin` manifest (skills only, `hooks: {}`) and a `.agents/plugins/marketplace.json`; its shell hook is not wired into that manifest.
- **CLIs (verified on this machine):** `codex exec` (0.153.2) accepts `-C <dir>`, `-s read-only|workspace-write|danger-full-access`, `-m <model>`, `-c model_reasoning_effort=<level>`, `--json`, `-o <file>`, a prompt from an argument or stdin, and `codex exec resume <session-id> [prompt]` continues a session. `claude -p` (2.1.260) accepts `--model`, `--effort low|medium|high|xhigh|max`, `--permission-mode acceptEdits|auto|bypassPermissions|manual|dontAsk|plan`, `--output-format json`, `--resume <session-id>`, `--worktree`.
- **Bridge companions (verified against the installed `codex-companion.mjs` 1.0.6):** `task --background` spawns a detached, unreferenced worker and writes the job record after spawning; a resumed `task` recomputes its sandbox from its own `--write`; `--effort` accepts `none|minimal|low|medium|high|xhigh`; `review` and `adversarial-review` take `--scope`, `--base`, `--model`, focus text (adversarial only), and no effort or prompt-file flag. These facts are why doers no longer go through the companion. Sendbird's `cc` plugin installs with `codex plugin marketplace add sendbird/codex-marketplace` then `codex plugin add cc@sendbird` and exposes the same review surface. `/codex:transfer` is a session handoff, not a background runner.
- Superpowers' `subagent-driven-development` skill says never to run implementation subagents in parallel and scans for shared interfaces, generated outputs, and producer-consumer edges before dispatch; this spec deviates deliberately and only for tasks the plan marks parallel-safe under the same criteria.

## Changes

### A. Routing file, presets, resolver, session injection (phase 1)

**File** `routing.json`. Requested-routing precedence, highest first: a one-run argument (`/vibe:conduct split <task>`, or `doer=claude <task>`), project `.agents/vibe/routing.json`, user `~/.agents/vibe/routing.json`, then the preset named by `profile`. No file resolves to `tiered`. **Effective** routing may still differ: Claude's `CLAUDE_CODE_SUBAGENT_MODEL` overrides every Claude subagent model, and a Codex session's own sandbox and approval policy bound what a child `codex exec` may do. The resolver reports the requested value and its source for every field plus a fixed note of the native overrides for the given host; reports never claim the effective runtime model.

```json
{
  "version": 1,
  "profile": "split",
  "max_parallel": 3,
  "task_budget_minutes": 30,
  "egress": { "openai": "acknowledged" },
  "roles": {
    "doer":            { "runtime": "codex",  "model": "default", "effort": "high" },
    "doer-mechanical": { "runtime": "codex",  "model": "default", "effort": "medium" },
    "escalation":      { "runtime": "claude", "model": "opus",    "effort": "high" }
  }
}
```

- **Roles:** `doer`, `doer-mechanical`, `escalation`, `exploration`, `contract-writer`, `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier`, `guardians`, `cross-check`, `adversarial`.
- **`runtime`:** `claude`, `codex`, `host`, or `cross` (the non-host runtime; valid only for `cross-check` and `adversarial`). `contract-writer` accepts only `claude`. Resolving `host`, `cross`, or egress requires `--host`; the resolver errors without it.
- **`model`:** `default` means omit the model flag and let the runtime's native resolution decide. Claude aliases `sonnet`, `haiku`, `opus`, `fable`. Codex: an explicit model id string. Presets never contain an explicit id.
- **`effort`:** `default` (omit) or a level, validated per adapter from `plugins/vibe/routing/adapters.json`: `claude-native` and `claude-print` accept `low`, `medium`, `high`, `xhigh`, `max`; `codex-exec` accepts `low`, `medium`, `high`, `xhigh` (passed as `-c model_reasoning_effort=`; the CLI's own error surfaces anything a model rejects); the companion review paths accept no effort, so `cross-check` and `adversarial` must be `default`; the review-plan brief path (`codex` companion `task`) accepts `none|minimal|low|medium|high|xhigh`.
- **`egress`:** per provider, `acknowledged` or absent. `openai` covers any role on `codex` from a Claude host; `anthropic` covers any role on `claude` from a Codex host.
- **Adapters** (`adapters.json`, one row per host and runtime): Claude host + `claude` → the harness's native subagent dispatch; Claude host + `codex` → `runtime-job codex-exec`; Codex host + `codex` → a forwarding subagent running `runtime-job codex-exec` (P3 confirms; see G for the fallback); Codex host + `claude` → a forwarding subagent running `runtime-job claude-print`; `cross-check` and `adversarial` → the `codex` companion on a Claude host, the `cc` companion on a Codex host; `/vibe:review-plan`'s brief → the `codex` companion `task` path, unchanged. Each row lists the flags it accepts; the resolver rejects a route with no row on the given host.
- **Presets** in `plugins/vibe/routing/presets/{uniform,tiered,split}.json`. `uniform`: every role `host`/`default`/`default`, except `contract-writer` (`claude`) and the two review roles (`cross`/`default`/`default`). `tiered`: today's table with `runtime: claude` (on a Codex host it crosses over; init says so). `split`: `doer` `codex`/`default`/`high`, `doer-mechanical` `codex`/`default`/`medium`, `escalation` `claude`/`opus`/`high`, `exploration` `claude`/`sonnet`/`high`, `contract-writer` `claude`/`default`/`high`, all review and verify roles and `guardians` `claude`/`opus`/`high`, `cross-check` and `adversarial` `cross`/`default`/`default`. A user file names a preset and overrides only what differs; merge is per role key.
- **Resolver** `plugins/vibe/scripts/routing.mjs` (plain node, no dependencies): `resolve --host claude|codex [--cwd <dir>] [--profile <p>] [--set role=runtime:model:effort ...] [--json|--markdown]`. Validates roles, runtimes, aliases, adapter efforts, the `contract-writer` pin, and that every role has an adapter row on the given host. Errors name the offending path.
- **Session injection.** `plugins/vibe/hooks/resolve-routing.mjs --host <host>` runs on SessionStart on both hosts and emits `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<VIBE_ROUTING …>…</VIBE_ROUTING>"}}`, the one envelope both harnesses document. The block carries the table, `max_parallel`, `task_budget_minutes`, egress state, and the native-override note. The host comes only from the `--host` flag: `hooks/hooks.json` passes `--host claude`, `hooks-codex.json` passes `--host codex`; environment variables are never consulted because Codex sets `CLAUDE_PLUGIN_ROOT` as well. On Codex the hook runs only after the user trusts it in `/hooks`; init says so.

### B. `/vibe:init` (phase 1, extended in phase 3)

A user-only skill at `plugins/vibe/skills/init/SKILL.md` (Claude: `disable-model-invocation: true`; Codex: `agents/openai.yaml` with `policy.allow_implicit_invocation: false`), backed by `plugins/vibe/scripts/init.mjs` with `detect --json`, `write`, `bridges`, `show`.

Questions go through the harness's question tool when the session exposes one; otherwise the skill asks in plain conversation with the default marked, one question per message.
1. **Detect.** Claude CLI and version; Codex CLI, version, login (`codex login status`); installed bridges (`codex@…` on Claude, `cc@sendbird` on Codex); superpowers on the host (`superpowers@ysainson` on Claude, `superpowers@openai-curated` on Codex); node. Printed as a table.
2. **Preset.** Default `split` when the other runtime is installed and logged in, else `tiered`.
3. **Customize roles?** Default no. Yes walks each role with the preset value preselected; `contract-writer` is shown but not editable.
4. **Egress.** Shown only when a resolved role crosses providers on this host; default "acknowledged".
5. **Scope.** Default user. Project scope runs the sharing layer (C) as plan, confirmation, apply.
6. **Write and verify.** `init.mjs write --host <host> --yes …`, then `bridges install --host <host>` for anything missing (Claude host: `claude plugin install codex@ysainson`; Codex host: `codex plugin marketplace add sendbird/codex-marketplace --ref <tag pinned at build time>`, `codex plugin add cc@sendbird`, `codex plugin add superpowers@openai-curated` when absent), then `show` prints the resolved table, the native-override note, bridge readiness, and on Codex the reminder to trust the VIBE hook in `/hooks`. On a Codex host it also raises `agents.max_concurrent_threads_per_session` to at least `max_parallel + 3` and says when a restart is needed.

Re-running shows current values as the defaults. `/vibe:setup` calls this flow as its final step.

### C. Sharing layer (phase 1)

`plugins/vibe/scripts/share.mjs` (plain node) with `plan` (prints every operation, writes nothing) and `apply` (runs only after explicit confirmation, at both scopes, and writes a backup first).

- **Context.** `AGENTS.md` at the repo root is canonical. `CLAUDE.md` becomes `@AGENTS.md` plus a `## Claude Code only` section. Migration moves the CLAUDE.md body into AGENTS.md byte for byte; when an AGENTS.md already exists the body is appended under `## Imported from CLAUDE.md`, never overwritten. Deciding what is Claude-only is a human edit afterwards (a gate in the task list). `.claude/rules/*.md` are untouched. The phase 1 human gate asks Claude to state a convention that lives only in AGENTS.md.
- **Skills.** `.agents/skills/` is canonical; `.claude/skills` becomes a relative symlink to it (user level: `~/.claude/skills` to `~/.agents/skills`). Merge takes the union of `.claude/skills`, `.agents/skills`, and `.codex/skills`. Same-named directories merge only when their contents are identical; any differing file aborts the apply with a per-file diff summary unless `--prefer claude|agents|codex` is passed. Before replacing a directory with the symlink, its contents are copied to `.agents/.share-backup-<timestamp>/` (git-ignored). Every shared skill must carry `name` and `description`: a missing `name` is set to the directory name; a missing `description` aborts the apply with the list of skills to fix, since a description is a judgment the script must not invent.
- **Third-party plugins** are not shared by file. `init show` prints a checklist of the enabled overlays' Codex equivalents where known.
- **Probes before building C:** P1, Claude Code follows a symlinked `.claude/skills`; P2, Codex tolerates the six remaining Claude-only keys (`disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `tools`) in a SKILL.md, and Claude Code's `skillOverrides` can mark a skill user-only. If Codex rejects any key, the shared dir keeps spec-only keys, the Claude-only keys move under `metadata`, and Claude-only behavior is restored through `skillOverrides` written by `share apply`.

### D. VIBE reads the routing file (phase 1)

- **conduct** drops the `PROFILE:` line and the hardcoded table. It reads the injected `<VIBE_ROUTING>` block; if absent it runs the resolver itself with `--host` set from the harness it knows it is running in. Row semantics are unchanged. The skill argument still overrides for one run.
- **`/vibe:review`** reads `roles.cross-check` and `roles.adversarial`. `/vibe:review adversarial [focus]` runs the `adversarial` role through the host's companion `adversarial-review --scope working-tree|--base <default-branch> [focus]` with the same egress guard as the cross-check. Effort is config-owned there and reported as such.
- **`/vibe:review-plan`** reads `roles.cross-check` for the runtime of its Step 3 brief; that path uses the `codex` companion `task`, so a routed effort applies.
- **conduct step 6** may run the `adversarial` role on the final diff when the change is high-stakes or the run was started with `adversarial` in its argument. Findings are handled like a verifier FAIL. Never per-subtask.
- **profile-policy** is rewritten: the routing file, presets, `default`, requested vs effective routing, the `contract-writer` pin, adapters, external models remain config-owned.
- **Egress rule, all commands and both hosts:** a provider marked `acknowledged` is never asked about again; otherwise one question per run, and a "no" reroutes every affected role to `host` for that run and says so in the report.

### E. Codex doer tier in conduct (phase 2)

- **Shared contract** `plugins/vibe/skills/conduct/references/codex-dispatch.md`: the locate (installed_plugins.json, marketplace preference, cache fallback), assert (`setup --json`), requested-routing report, and all-stage failure wording that the review commands carry today, moved to one file they and conduct reference, plus the adapter table from `adapters.json`.
- **Job script** `plugins/vibe/scripts/runtime-job.mjs` (plain node; tested against fake `codex` and `claude` executables placed first on `PATH`): `run --adapter codex-exec|claude-print --cwd <worktree> --prompt-file <file> --mode read-only|write [--model <id-or-alias>] [--effort <level>] [--resume <session-id>] --budget-min <n> --result <file> --json`. It spawns the child in its own process group, owns it (never detached), forwards SIGINT and SIGTERM to the group, kills the group when the budget elapses, waits for the child to exit before returning, and prints one JSON line: `{ adapter, sessionId, status: done|failed|cancelled|budget-exceeded|killed, exitCode, durationSec, resultPath }`. `cancel --pid-file <file>` kills a running job's group from another process and waits for exit. Adapter mapping:
  - `codex-exec`: `codex exec -C <cwd> -s read-only|workspace-write [-m <id>] [-c model_reasoning_effort=<e>] --json -o <result> -` with the prompt on stdin; the session id is read from the JSON event stream; `--resume` runs `codex exec resume <session-id> -` with `-m`, `-c`, `--json`, `-o` only, because `resume` accepts neither `-s` nor `-C` (verified from `codex exec resume --help`) and the session keeps the sandbox and working root it was created with. Task 9's fake asserts the resume argv and the live smoke checks that a resumed doer still writes inside its worktree.
  - `claude-print`: `claude -p --output-format json --permission-mode plan|bypassPermissions [--model <alias>] [--effort <e>]` with cwd = the worktree and the prompt on stdin; `plan` for `read-only`, `bypassPermissions` for `write` (a headless doer cannot answer permission prompts; the worktree, the doer block, and the secrets rule bound it); `--resume <session-id>` for resumes; the session id is read from the JSON result.
- **Task-shape rule** at plan time: a task is tagged `[claude]` when it needs judgment its contract cannot carry: deep debugging, a cross-file architecture change, a visual-hero UI task, or anything already escalated. Under `split` every other task is `[codex]`. A one-run `doer=claude` overrides all tags.
- **Parallel-safe marking** at plan time, following the superpowers dispatch scan: two tasks may run in parallel only when their declared file sets are disjoint, neither depends on the other's output, neither adds or changes dependencies, lockfiles, or generated outputs, and neither changes a shared interface (types, schemas, contracts) the other imports. The plan groups parallel-safe tasks into batches; everything else is serial.
- **Contract lifecycle (batch).** conduct's step order becomes: spec, plan (with file sets, dependency edges, batches), then per batch: the contract-writer writes the batch's tests, the orchestrator runs them and confirms red, and commits them as `test(<batch>): contract for tasks N-M (expected red)`. Worktrees branch from that commit, so the tests exist in every worktree. The superpowers worktree skill's green-baseline expectation is waived for exactly the batch's contract tests; everything else must be green. The dispatch prompt's first instruction is to run the contract and report it red; a doer that reports green before changing anything stops and the orchestrator investigates. On acceptance each task's implementation is committed in its worktree (`feat|fix(<task>): …`), integrated serially, and the run's history is one contract commit per batch followed by one implementation commit per task: commit-per-task holds.
- **Dispatch of one Codex task:**
  1. Assert the `codex` CLI and login (`codex login status`); failure falls back (below) and is reported.
  2. Secrets preflight: the prompt file passes the credential/token scan `/vibe:review` uses; a hit aborts the dispatch and reroutes the task to `host`.
  3. One git worktree per task from the batch contract commit, via the superpowers worktrees skill. The prompt tells the doer to run the project's install step first.
  4. The prompt file, in the session temp dir: goal and why, exact scope and file set, the contract and how to run it, "conventions are in AGENTS.md", the doer block from guardrails.md verbatim, the Codex addendum (install first, run the contract red first, never commit, never read or send secret-bearing files, report in the doer format).
  5. `runtime-job.mjs run --adapter codex-exec --mode write …` inside a background shell job of the host; its completion is the collection mechanism. `--model <id>` only when the routing file names one.
  6. At most `max_parallel` jobs in flight, all from one batch.
- **Review and redirect.** Baseline-aware diff in the worktree (`git add -A` then `git diff --cached` against the contract commit), then the two review passes as today, reviewers reading the worktree path. A redirect resumes the same session (`--resume <session-id> --mode write`). Two failed redirects escalate to the `escalation` role in the same worktree. On acceptance the orchestrator commits in the worktree, integrates it, and removes the worktree.
- **Integration.** In plan order, one task at a time: fast-forward or rebase onto the working branch, then rerun the full contract suite. A conflict or a red suite after integration sends that task back as a redirect with the integrated branch as its new base. Parallel tasks are never integrated concurrently.
- **Failure rule.** CLI missing or unauthenticated, secrets hit, job `failed`, `budget-exceeded`, `cancelled`, `killed`, or a rate limit: first confirm the job is terminal (the script only returns after the child exits; a stale pid file is killed through `cancel`), then archive the attempt (`git add -A && git diff --cached --binary > <evidence>/<task>.patch`, plus the job's result and log files), then `git reset --hard <contract-commit> && git clean -fd` in the worktree, then dispatch the fallback runtime: the `escalation` role's runtime and model if the task was already redirected, otherwise `doer` on `host`. Fallback obeys the same egress rule. The report names the stage and reason. Codex never blocks a run.
- **Reporting** per task: adapter, session id, requested model and effort with their sources, sandbox or permission mode, duration, worktree, integration result.
- **guardrails.md**: the shared doer block gains one bullet, "Never read, print, or send secret-bearing files (`.env*`, key or credential files, `~/.claude`, `~/.codex`); if a task seems to need one, stop and report." It gains a Codex addendum block (install first; run the contract red first; never commit; the worktree path is the working root; report in the doer format). The contract-writer block is unchanged.

### F. Commands become skills; harness-neutral prose (phase 3)

- Every `plugins/vibe/commands/*.md` moves to `plugins/vibe/skills/<name>/SKILL.md`. Exact frontmatter and policy per skill:

| skill | name | argument-hint | Claude `disable-model-invocation` | Codex `agents/openai.yaml` `policy.allow_implicit_invocation` |
|---|---|---|---|---|
| brainstorm | brainstorm | `[idea]` | true | false |
| commit | commit | `[scope hint]` (keeps `allowed-tools`) | true | false |
| fix | fix | `[paths]` | true | false |
| review-plan | review-plan | `[spec path]` | true | false |
| setup | setup | `[brief path]` | true | false |
| init | init | `[--yes]` | true | false |
| review | review | `[adversarial focus]` | absent | file absent (implicit allowed) |
| quick-check | quick-check | none | absent | file absent |
| conduct | conduct | `[task, or preset/role overrides]` | absent; `user-invocable: false` removed; `commands/conduct.md` deleted | file absent |

  Descriptions stay as they are today. Each user-only skill gets a committed `agents/openai.yaml` with the policy line; Claude ignores that file.
- Skill and agent bodies stop naming Claude tools: "the harness's subagent dispatch", "the harness's question tool", "a background shell job", "the plugin root". `plugins/vibe/skills/conduct/references/harness-tools.md` maps each phrase per harness: Agent tool with `model` param vs a Codex forwarding subagent that runs `runtime-job.mjs`; AskUserQuestion vs a plain-conversation question when no question tool exists; Bash `run_in_background` vs the forwarding subagent; waits in 5 to 10 minute stretches; redirects via `--resume`; `${CLAUDE_PLUGIN_ROOT}` vs `$PLUGIN_ROOT`; and "trust the actual tool list over this file". `vibe:clarify` and `vibe:fable-safe-authoring` are updated to the neutral wording.

### G. Roles on a Codex host (phase 3)

Codex-hosted dispatch uses the same role table for prompts and sandbox modes; no role files are generated.

| role | prompt source | mode |
|---|---|---|
| doer, doer-mechanical, escalation | `agents/doer.md` or `agents/doer-mechanical.md` body, inlined at the top of the prompt file | write |
| contract-writer | `agents/contract-writer.md` (always `claude`, so always `claude-print` on a Codex host) | write |
| exploration | a fixed read-only exploration prompt in the harness-tools reference | read-only |
| reviewer-spec, reviewer-quality, verifier, security-verifier | the matching `agents/*.md` body | read-only |
| guardians | every enabled overlay `agents/*.md` and project `.claude/agents/**/*.md` body | read-only |
| cross-check, adversarial | the `cc` companion `review` / `adversarial-review` | n/a |

- A forwarding subagent (Codex's default agent, spawned without `agent_type`, `fork_turns: "none"`, medium effort) runs one `runtime-job.mjs` command and returns its JSON line unchanged, the pattern the `cc` plugin uses. The sandbox of the child `codex exec` is set by `-s`, independent of the spawn tool; `claude -p`'s permission mode is set by `--permission-mode`.
- **P3, run before task 15:** from inside a Codex session, a forwarding subagent runs `runtime-job.mjs run --adapter codex-exec --mode read-only` and `--mode write` on a scratch worktree, and `--adapter claude-print --mode read-only`; the probe records whether the nested processes reach the network and write inside the worktree under the session's sandbox and approval policy, and what the user had to approve. If the sandbox blocks nested execution, phase 3 adds an appendix adapter: generated Codex custom-agent files (`name = "vibe-<role>"`, `sandbox_mode` from this table, effort emitted whenever routed, model omitted for `default`) spawned with `agent_type`, with its own contract; that appendix is written only if P3 fails.

### H. Codex packaging (phase 3)

- `plugins/vibe/.codex-plugin/plugin.json`: `name`, `version` (equal to the Claude manifest), `description`, `skills: "./skills/"`, `hooks: "./hooks/hooks-codex.json"`, a minimal `interface` (`displayName`, `shortDescription`, `category: "Developer Tools"`). Same for `vibe-swift` and `vibe-expo` (skills only).
- `plugins/vibe/hooks/hooks-codex.json`: the SessionStart entry `node "$PLUGIN_ROOT/hooks/resolve-routing.mjs" --host codex`.
- `.agents/plugins/marketplace.json` at the repo root: `name: "ysainson"`, `interface.displayName`, and for each of `vibe`, `vibe-swift`, `vibe-expo` an entry `{ name, source: { source: "local", path: "./plugins/<name>" }, policy: { installation: "AVAILABLE", authentication: "ON_USE" }, category: "Developer Tools" }`.
- `tools/manifests.ts`: a pure `bumpManifests(claude, codex, version)` returning both documents; `tools/release.ts` reads both, asserts equality before the bump, writes and stages both in the same commit, and runs the Codex install smoke before creating the tag. `claude plugin validate . --strict` must keep passing.
- **Codex install smoke** `tools/codex-install-smoke.sh`: creates an isolated `CODEX_HOME`, seeds it with a copy of the real `auth.json` (deleted at exit; authentication lives in that home), runs `codex plugin marketplace add <repo path>`, `codex plugin add vibe@ysainson`, `codex plugin list` (installed and enabled), and one `codex exec --dangerously-bypass-hook-trust` session whose output contains the `<VIBE_ROUTING host="codex"` block. The bypass flag is CI-only; users trust the hook once in `/hooks`.

### I. Codex-hosted dispatch and the Claude bridge (phase 3)

- In the harness-tools reference: the Codex primary thread orchestrates. Every routed role goes through a forwarding subagent running `runtime-job.mjs` with the adapter from `adapters.json` (`codex-exec` for `codex`, `claude-print` for `claude`), one worktree per parallel doer from the batch contract commit, the same secrets preflight, the same failure rule. `cross-check` and `adversarial` go through the `cc` companion's `review` and `adversarial-review`. Nothing depends on VIBE being installed on the Claude side.
- `/vibe:init` on a Codex host installs the `cc` bridge and superpowers as in B, asserts `claude` CLI readiness (`claude --version` and a one-line `claude -p` probe), reminds the user to trust the VIBE hook, and applies the thread-cap rule.

## Codex cross-check resolution, rev 2 to rev 3

Companion 1.0.6, `task --effort xhigh`, requested model per user config (`gpt-5.6-sol`, `high`), thread `01a06c43-f1fd-7942-aeb9-b37417c548e7`. Verdict on rev 2: `needs-rework`; 23 of 28 rev-1 findings resolved, 4 partial, 2 not, 11 new.

| # | sev | finding | resolution | where |
|---|---|---|---|---|
| N1 | Critical | Companion detaches its worker; a killed orchestrator leaves a write-capable job running | Resolved: doers no longer use the companion; `runtime-job.mjs` owns the child, kills the process group on budget or signal, returns only after exit | E |
| N2 | Critical | Failure cleanup archived unstaged diff and kept the index | Resolved: confirm terminal, `git diff --cached --binary` archive, `reset --hard` + `clean -fd` | E |
| N3 | Critical | Contract-commit order contradictory | Resolved: plan first, one contract commit per batch (expected red, waived baseline), implementation commit per task, serial integration | E |
| N4 | Critical | Prompt-based spawn has no sandbox argument | Resolved: sandbox is a per-call `codex exec -s` flag; no spawn-based dispatch for routed roles | E, G |
| N5 | Major | Companion review paths take no prompt file | Resolved: reviewer roles use `claude-print` read-only with the role prompt; companions only for `cross-check` and `adversarial` | A, G, I |
| N6 | Major | Generated agents lacked `name` | Resolved by removal: no generated role files (appendix only if P3 fails, with `name`) | G, non-goals |
| N7 | Major | Codex hook envelope and trust | Resolved: nested envelope on both hosts, trust step in init, bypass flag in the smoke only | A, B, H |
| N8 | Major | Missing skill descriptions undefined | Resolved: abort with the list | C |
| N9 | Major | Isolated `CODEX_HOME` is unauthenticated | Resolved: seeded `auth.json`, removed at exit | H |
| N10 | Major | Fallback smoke used an unsatisfiable contract | Resolved: `--budget-min 0` on a satisfiable task | contracts 12 |
| N11 | Major | Companion enqueue race | Resolved by removal: no companion background jobs on the doer path | E |
| 7 | Partially → Resolved | per-task vs shared contract commit | Batch contract commit | E |
| 8 | Partially → Resolved | `status --wait` granularity | Owned child, timer-based kill | E |
| 10 | Not → Resolved | Fallback left the index | See N2 | E |
| 11 | Partially → Resolved | Disjoint files insufficient | Parallel-safe criteria from the superpowers scan | E |
| 14 | Not → Resolved | "Codex has no user-only mechanism" was wrong | `agents/openai.yaml` `policy.allow_implicit_invocation: false` | F |
| 18 | Partially → Resolved | Read-only guarantees unchecked | Explicit `-s read-only` / `--permission-mode plan` per call | E, G |

## Codex cross-check resolution, rev 1 to rev 2

Thread `01a06c30-add4-77d0-9fa2-c8812ffff6be`. Verdict on rev 1: `needs-rework`.

| # | sev | finding | resolution in rev 2 |
|---|---|---|---|
| 1 | Critical | Host detection via `CLAUDE_PLUGIN_ROOT` | `--host` from each hook manifest |
| 2 | Major | Precedence vs native override; `--host` optional | Requested vs effective; `--host` required |
| 3 | Major | Codex `default` semantics | Omit and inherit native resolution |
| 4 | Critical | `max` effort rejected | Per-adapter effort validation |
| 5 | Major | Review paths have no effort flag | Config-owned, `default` enforced |
| 6 | Major | `uniform` lets Codex write tests | `contract-writer` pinned to `claude` |
| 7 | Critical | Worktrees without contract tests | Contract commit before worktrees (finalized in rev 3) |
| 8 | Critical | No job id, no cancel | Job script (finalized in rev 3) |
| 9 | Critical | Read-only resume | Always `--write` / `--mode write` on resume |
| 10 | Major | Fallback state | Archive, reset, routed fallback (finalized in rev 3) |
| 11 | Major | Parallel policy | Disjoint sets, serial integration (finalized in rev 3) |
| 12 | Major | `.env` rule absent | Bullet in the doer block, prompt preflight |
| 13 | Major | Merge and backups | Identical-only merge, abort, backups, confirm |
| 14 | Major | Command `name`s, `conduct` collision, user-only on Codex | Frontmatter table (finalized in rev 3) |
| 15 | Critical | Sandbox inference reversed | Role table (rev 3: per-call flag) |
| 16 | Critical | `default` dropped effort | Effort always emitted |
| 17 | Critical | Role inventory incomplete | Total role table |
| 18 | Major | Sandbox not authoritative | Per-call flag (rev 3) |
| 19 | Critical | Reverse-bridge source | `sendbird/codex-marketplace`, `cc@sendbird` |
| 20 | Major | Question tool, thread cap | Plain-conversation fallback, `max_parallel + 3` |
| 21 | Major | `agent_type` assumed | No spawn-based dispatch (rev 3); P3 probes nesting instead |
| 22 | Major | Superpowers on Codex | Init installs `superpowers@openai-curated` |
| 23 | Major | Marketplace schema, validation | Full entry shape, install smoke |
| 24 | Major | Release bump function | `tools/manifests.ts` |
| 25 | Major | Task DAG, prose contracts | Dependencies stated, fixture-based tests |
| 26 | Minor | Generated model ids | Moot in rev 3 (no generated files) |
| 27 | Minor | Superpowers hook claim | Narrowed |
| 28 | Minor | No-file default wording | Symmetric acknowledgment rule |

## Contracts (bun tests in `tools/`; ★ = failing-first, others are regression guards born green)

Scripts are tested behaviorally against `tools/fixtures/`: fake `codex` and `claude` executables placed first on `PATH` that record their argv and stdin, emit the JSON shapes the real CLIs emit (session id included), and can be told to hang, fail, or write files; sample skill trees; sample agent Markdown.

1. **`tools/routing.test.ts`** (task 1): ★ presets validate; ★ precedence with per-field sources; ★ per-role merge; ★ `default` valid everywhere, Claude aliases rejected on `codex`, explicit ids rejected in presets, `cross` rejected outside the review roles, `contract-writer` rejected unless `claude`; ★ adapter effort validation (`max` rejected on `codex-exec`, non-`default` rejected on the review roles); ★ `--host` required for `host`/`cross`/egress; ★ every role has an adapter row on both hosts; ★ the native-override note is host-specific.
2. **`tools/hooks.test.ts`** (task 2, depends on 1): ★ the nested envelope on both hosts, selected by `--host`, with `CLAUDE_PLUGIN_ROOT` set in both runs; ★ the block carries host, profile, source, table, limits, egress, override note; ★ missing file resolves to `tiered`; ★ `hooks/hooks.json` passes `--host claude` and `plugin.json` points at it.
3. **`tools/share.test.ts`** (task 3): ★ AGENTS.md byte-for-byte move, append-under-heading when it exists; ★ CLAUDE.md becomes import plus section; ★ identical-only merge, abort with per-file summary, `--prefer`; ★ backup before replacement; ★ relative symlink, idempotent; ★ `name` filled, missing `description` aborts with the list; ★ `plan` writes nothing; ★ `.claude/rules` untouched.
4. **`tools/init.test.ts`** (task 4, depends on 1): ★ `write --yes` produces `split` when the other runtime is ready, `tiered` otherwise; ★ `contract-writer` always `claude`; ★ egress key only when a role crosses on the given host; ★ re-run preserves customizations; ★ `detect` shape includes bridges and superpowers; ★ `bridges` prints the exact commands for the missing side and runs nothing under `--dry-run`.
5. **`tools/init-skill.test.ts`** (task 5, depends on 4): ★ user-only on both hosts (Claude key and `agents/openai.yaml`); ★ each question names its default; ★ question-tool-or-plain-conversation rule; ★ egress conditional; ★ scope default user; ★ project scope is plan, confirm, apply; ★ `setup.md` hands off to init.
6. **`tools/conduct-skill.test.ts`, `review-command.test.ts`, `review-plan-command.test.ts`, `profile-policy.test.ts`** (task 6, depends on 1 and 2): ★ no `PROFILE:` line and no table; ★ conduct reads `<VIBE_ROUTING>` with the `--host` resolver fallback; ★ `/vibe:review adversarial`, config-owned effort wording, egress guard reuse; ★ review-plan reads `roles.cross-check`; ★ conduct step 6 adversarial rule and never-per-subtask; ★ profile-policy names the routing file, presets, requested vs effective, adapters, the `contract-writer` pin; no-dated-id guards stay green.
7. **README** (task 7): ★ documents the routing file, `/vibe:init`, the sharing layer.
8. **`tools/codex-dispatch-ref.test.ts`** (task 8): ★ the reference exists with locate, assert, requested-routing report, failure, and adapter sections; ★ the review commands reference it and no longer inline the contract.
9. **`tools/runtime-job.test.ts`** (task 9, fake CLIs): ★ `codex-exec` argv: `-C`, `-s` from `--mode`, `-m` only when given, `-c model_reasoning_effort=` only when given, `--json`, `-o`, prompt on stdin; ★ `claude-print` argv: `-p`, `--output-format json`, `--permission-mode plan|bypassPermissions` from `--mode`, `--model`/`--effort` only when given; ★ session id captured from each fake's output and `--resume` produces `codex exec resume <id>` without `-s`/`-C` (only `-m`, `-c`, `--json`, `-o`) / `claude --resume <id>`; ★ budget elapsed kills the process group, reports `budget-exceeded`, and returns only after the child is gone; ★ SIGTERM to the script kills the child; ★ `cancel --pid-file` from another process kills and waits; ★ one JSON result line with every field; ★ a hanging fake never leaves an orphan (checked by pid after the test).
10. **`tools/conduct-skill.test.ts`** (task 10, depends on 8 and 9): ★ task-shape rule and file-set declaration; ★ parallel-safe criteria and batches; ★ batch contract commit with the waiver and the red-first instruction; ★ secrets preflight; ★ dispatch through `runtime-job.mjs` with the adapter from the routing block; ★ `max_parallel` within one batch; ★ serial integration with suite rerun; ★ redirect via `--resume`; ★ escalation after two redirects; ★ fallback: confirm terminal, archive staged diff, hard reset and clean, routed fallback, egress rule; ★ per-task report fields.
11. **`tools/guardrails.test.ts`** (task 11): ★ the secrets bullet in the doer block; ★ the Codex addendum with install-first, red-first, never-commit; the contract-writer block unchanged (born green).
12. **Live smoke** (task 12): a batch of two parallel-safe `[codex]` tasks via `/vibe:conduct split`; one runs with `task_budget_minutes` overridden to 0 for that task so `budget-exceeded` triggers the fallback on a satisfiable contract; the other gets one redirect. Evidence under `docs/evidence/vibe/`: session ids, the archived attempt patch, redirect continuity (same session id), integration order, suite results, and a `ps` check after the run showing no leftover `codex` processes.
13. **`tools/skills-layout.test.ts`** (task 13): ★ no `commands/` directory; ★ every skill in the table has exactly the listed frontmatter; ★ each user-only skill has `agents/openai.yaml` with `allow_implicit_invocation: false` and no other skill has one; ★ `conduct` user-invocable with its argument hint; existing command tests updated to the new paths.
14. **`tools/harness-neutral.test.ts`** (task 14): ★ no literal `AskUserQuestion`, `Agent tool`, `run_in_background`, `spawn_agent`, `CLAUDE_PLUGIN_ROOT` in any skill or agent body except `references/harness-tools.md` and the scripts; ★ the reference covers dispatch, question, background, wait, redirect, plugin root, the forwarding-subagent pattern, the exploration prompt, and the trust-your-tool-list rule.
15. **`tools/codex-packaging.test.ts` + `tools/manifests.test.ts`** (task 15): ★ `.codex-plugin/plugin.json` for the three plugins with versions equal to the Claude manifests; ★ `hooks-codex.json` uses `$PLUGIN_ROOT` and `--host codex`; ★ marketplace entries have the full shape; ★ `bumpManifests` is pure and keeps both equal; ★ the smoke script exists, seeds and removes `auth.json`, uses the bypass flag, checks the routing block, and the release tool calls it before tagging.
16. **`tools/init.test.ts`** (task 16): ★ Codex-host steps: marketplace add with `--ref`, `cc@sendbird`, `superpowers@openai-curated`, `claude` readiness probe, hook-trust reminder, thread-cap raise to `max_parallel + 3`; all dry-runnable.
17. **`tools/conduct-skill.test.ts` / `harness-neutral.test.ts`** (task 17): ★ Codex-hosted rules present: forwarding subagent running `runtime-job.mjs`, adapter per runtime, role table with modes, worktree per doer from the batch contract commit, `cc` companion for the review roles, same preflight and failure rule.
18. **Live smoke hosted in Codex** (task 18): evidence as in 12, plus the README Codex install section.

## Task shape (numbered, test-first, commit per task)

Each task: write the ★ tests, confirm red, implement, green, commit. Bun always. Runtime scripts that consumers execute live under `plugins/vibe/scripts/` and `plugins/vibe/hooks/` as plain node `.mjs` with no dependencies; tests in `tools/` execute them against `tools/fixtures/`. Anything not listed as depending on another task may run in parallel.

**Phase 0, probes (about 30 minutes, nothing committed)**
- P1. Symlink a throwaway `.claude/skills` to a folder with one skill and confirm Claude Code lists it.
- P2. Put a throwaway skill with the six remaining Claude-only keys in `~/.agents/skills/` and confirm Codex lists and reads it (`codex exec --skip-git-repo-check -s read-only` one-liner). Confirm whether `skillOverrides` can mark a skill user-only in Claude Code. Record both outcomes in Verification; P2 decides the branch in C.

**Phase 1, routing + init + sharing (about 3.5 days, release `vibe--v1.6.0`)**
1. Presets, `adapters.json`, `scripts/routing.mjs`. Test: `tools/routing.test.ts`.
2. SessionStart hook with `--host`, `hooks/hooks.json`, `plugin.json` hooks key. Depends on 1. Test: `tools/hooks.test.ts`.
3. `scripts/share.mjs`. Independent. Test: `tools/share.test.ts`.
4. `scripts/init.mjs`. Depends on 1. Test: `tools/init.test.ts`.
5. `skills/init/SKILL.md` + `agents/openai.yaml` + `commands/setup.md` hand-off. Depends on 4. Test: `tools/init-skill.test.ts`.
6. conduct, review, review-plan, profile-policy read routing; adversarial role. Depends on 1 and 2. Tests: the four existing files, extended.
7. README + `bun release plugins/vibe`. Then the **human gate**: `/vibe:init` on this repo (user scope) and on `iris/app` (project scope: `share plan`, read it, confirm, `apply`), curate IRIS's `CLAUDE.md` Claude-only section, ask Claude in IRIS for a convention that lives only in AGENTS.md, open IRIS in Codex and confirm it lists the shared skills and states one AGENTS.md convention, run `/vibe:review` in Claude and confirm `.claude/agents` guardians still dispatch.

**Phase 2, Codex doer tier (about 3 days, release `vibe--v1.7.0`)**
8. `references/codex-dispatch.md` + the review commands pointing at it. Test: `tools/codex-dispatch-ref.test.ts` plus the two command tests.
9. `scripts/runtime-job.mjs` + the fake `codex` and `claude` fixtures. Independent of 8. Test: `tools/runtime-job.test.ts`.
10. conduct split dispatch (plan marking, batch contract commit, preflight, worktrees, parallel rule, integration, redirect, fallback). Depends on 8 and 9. Test: `tools/conduct-skill.test.ts`.
11. guardrails: secrets bullet + Codex addendum. Independent. Test: `tools/guardrails.test.ts`.
12. **Live smoke:** the two-task batch described in contract 12, on a branch of this repo, evidence committed under `docs/evidence/vibe/`. Release.

**Phase 3, Codex host (about 4 days, release `vibe--v1.8.0`)**
13. Commands to skills per the table, `agents/openai.yaml` for user-only skills, `conduct` user-invocable. Test: `tools/skills-layout.test.ts` and updated command tests.
14. Harness-neutral prose + `references/harness-tools.md` (with the role table from G and the exploration prompt), `vibe:clarify` and `fable-safe-authoring` wording. Test: `tools/harness-neutral.test.ts`.
- P3. From a Codex session in this repo, a forwarding subagent runs `runtime-job.mjs` for `codex-exec` read-only and write and for `claude-print` read-only on a scratch worktree; record network reachability, worktree writes, and approvals. If nesting is blocked, write the appendix adapter from G before 17.
15. Codex packaging: manifests, `hooks-codex.json`, marketplace, `tools/manifests.ts`, release tool, install smoke. Test: `tools/codex-packaging.test.ts`, `tools/manifests.test.ts`; `claude plugin validate . --strict`; `tools/codex-install-smoke.sh` green.
16. `/vibe:init` Codex-host steps. Depends on 15. Test: `tools/init.test.ts`.
17. Codex-hosted dispatch rules in the references. Depends on 14 and P3. Tests: task 14's and 10's files.
18. **Live smoke hosted in Codex:** install from the local marketplace with the seeded isolated `CODEX_HOME`, trust the hook, `$vibe:conduct split` on this repo with one batch of one Codex doer task and review crossing to Claude. Evidence committed. README Codex section. Release.

## Verification

- `bun test` and `bun run typecheck` green after every task; ★ assertions red before their task, green after. Baseline today: 121 tests across 22 files, all green (re-confirmed by the first Codex cross-check).
- `claude plugin validate . --strict` passes after tasks 2, 5, 13, 15.
- Probe results (P1, P2, P3) recorded here before the dependent task starts.
- The phase 1 human gate and the two live smokes leave evidence files under `docs/evidence/vibe/`, including the no-orphan process check.
- `bun tools/pins.ts --dry-run` unaffected.
- Each phase ends with `bun release plugins/vibe` (and the overlays after task 15).

## Risks

- **Codex rejects Claude-only frontmatter keys** (P2). Fallback in C adds about a day and depends on `skillOverrides`.
- **Nested execution inside a Codex session** (P3): the session's sandbox may block network or worktree writes for a child `codex exec` or `claude -p`, or require approvals. The appendix adapter (generated custom agents) is the fallback, scoped and contracted only if P3 fails.
- **Headless Claude doers run with `bypassPermissions`.** Bounded by the worktree, the doer block, the secrets rule, and review before integration. Read-only roles use `plan` mode.
- **Egress.** Every `split` run sends repo content to OpenAI from a Claude host and to Anthropic from a Codex host. Mitigations: per-provider acknowledgment, the secrets preflight, the doer block's secret-file rule, reroute to `host` on declined consent.
- **Parallel doers.** Deliberate deviation from superpowers' no-parallel rule, bounded by the parallel-safe criteria, one batch contract commit, serial integration with a suite rerun. Overlap the plan missed shows up red at integration and becomes a redirect.
- **Rate limits and cost.** `max_parallel` defaults to 3; budgets kill runaway jobs; the fallback rule keeps the run moving.
- **Worktree install cost.** One dependency install per Codex task; `.worktreeinclude` covers untracked config.
- **Resumed Codex sessions inherit sandbox and cwd.** `codex exec resume` has no `-s`/`-C`; a redirect relies on the original session's `workspace-write` and worktree root. If a resumed session turns out read-only or rooted elsewhere in the live smoke, redirects fall back to a fresh `codex exec` with the redirect prompt plus the diff so far.
- **CLI flag drift.** `adapters.json` records the flag surface per CLI version; `runtime-job.mjs` surfaces the CLI's own error verbatim on an unknown flag, and the failure rule handles it.
- **Codex-hosted conduct is unproven.** Last phase, gated by P3 and its own live smoke; phases 1 and 2 deliver the usage split without it.
- **Undocumented internals.** `installed_plugins.json`, Codex's `[agents]` keys, hook trust behavior, the compatibility `CLAUDE_PLUGIN_ROOT`. Each is asserted at run time and reported, never assumed.

## Parked: shared memory across tools (research only)

Claude auto-memory is Markdown per project; Codex memory is SQLite and off on this machine; the formats do not interoperate. Codex has an `external_agent_memory_import` feature flag under development. MCP memory servers (OpenMemory by Mem0, mcp-memory-service, basic-memory, agentmemory) work in both harnesses today, but durable shared knowledge belongs in git-tracked, human-curated files. The sharing layer already gives both tools that: AGENTS.md, `docs/specs`, `docs/plans`. Revisit only if personal cross-tool facts become a real need; basic-memory is the option where files stay canonical.

## Sources (verified 2026-09-04)

- Benchmarks and cost: Artificial Analysis, "Benchmarking GPT-6 Astra"; Vellum, "GPT-6 Astra benchmarks explained".
- Task-type observations: Composio, "Claude Code vs Codex: 100+ hours"; Leanware, Firecrawl, Superblocks 2026 comparisons; Addy Osmani, "The Code Agent Orchestra".
- Astra launch: 9to5Mac 2026-09-03; VentureBeat 2026-09-03; Lenny's Newsletter hands-on.
- Codex docs: subagents (learn.chatgpt.com/docs/agent-configuration/subagents), hooks (learn.chatgpt.com/docs/hooks), skills and `agents/openai.yaml` (learn.chatgpt.com/docs/build-skills), plugins (learn.chatgpt.com/docs/build-plugins), AGENTS.md guide (developers.openai.com/codex/guides/agents-md); openai/codex issues 14579 and 15250.
- CLIs: `codex --help`, `codex exec --help`, `codex exec resume --help`, `codex plugin marketplace add --help`, `codex plugin add --help`, `claude --help` on this machine.
- Bridges: github.com/openai/codex-plugin-cc (v1.0.6, installed copy inspected), github.com/sendbird/cc-plugin-codex and github.com/sendbird/codex-marketplace (marketplace `sendbird`, plugin `cc`).
- Precedent: github.com/obra/superpowers (`.codex-plugin`, `.agents/plugins/marketplace.json`, `hooks/session-start`, `references/codex-tools.md`, `subagent-driven-development/SKILL.md`), `superpowers@openai-curated`.
- Claude Code docs: skills (code.claude.com/docs/en/skills), Agent Skills spec fields, `skillOverrides`.
