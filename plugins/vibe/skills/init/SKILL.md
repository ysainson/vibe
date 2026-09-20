---
name: init
description: Set up VIBE routing, bridges, and shared project context with a default on every question; --yes takes the same defaults.
argument-hint: "[--yes]"
disable-model-invocation: true
---

# Init — routing, bridges, shared context

Sets up VIBE for this machine and project: which runtime and model each role uses, the bridge plugins each host needs, and — at project scope — the shared `AGENTS.md` / `.agents/skills` context. Every question below has a default, so `--yes` takes those same defaults: scope stays `user` under `--yes` (the project-scope share plan/confirm gate never runs unattended), and a `--yes` re-run takes the current values of an existing routing file, the preset defaults otherwise. User-only; never model-invoked.

Questions go through the harness's question tool when the session exposes one (Claude's AskUserQuestion tool); otherwise plain conversation, one question per message, with the default marked. Re-running interactively shows current values as the defaults instead of the preset default — this flow is idempotent, not a one-time wizard.

## Outcomes

1. **Detect.** Runs `init.mjs detect --host <host> --json` — reads the Claude CLI and its version, the Codex CLI/version/login status, the bridge plugins already installed (`codex@…` on Claude, `cc@sendbird` / `superpowers@openai-curated` on Codex), which tools write into `.claude/skills` (e.g. argent), and the node version. No question here — this is evidence for the defaults below.

2. **Preset.** Default `split` when the other runtime is installed and logged in, else `tiered`.

3. **Customize roles?** Default no; `contract-writer` is shown but read-only — its pin comes from the preset, never from this question.

4. **Egress.** One question per provider (`openai`, `anthropic`) and class (`review`, `doer`) the resolved routing needs on this host; default acknowledged. Declining a `doer` question reroutes those doer-class roles to `host` instead. On a Codex host, declining `doer` also means `contract-writer` cannot be satisfied, so the run stops as unsupported before any contract is written. Declining a `review` question leaves those review roles reported as not performed instead of dispatched.

5. **Scope.** Default scope is `user`. Project scope runs `node "${CLAUDE_PLUGIN_ROOT}"/scripts/share.mjs plan --scope project`, the human reads and confirms, then `node "${CLAUDE_PLUGIN_ROOT}"/scripts/share.mjs apply --scope project --yes`; it then writes the project routing file (`.agents/vibe/routing.json`) with its own egress entries — a project file never inherits the user file's `doer` acknowledgment — plus a `project` block whose `install` and `test` default from the lockfile and `package.json`, confirmed before writing.

6. **Write and verify.** Writes with `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" write --host <host> --scope <scope> --profile <preset> --set role=runtime[:model[:effort]] --egress <provider>=<class>[,<class>] --project-install <cmd> --project-test <cmd> --yes` on Claude (the same command with `${PLUGIN_ROOT}` in place of `${CLAUDE_PLUGIN_ROOT}` on Codex) — `--set` only when outcome 3 customized roles, one `--egress` per question acknowledged in outcome 4, and `--project-install`/`--project-test` only at project scope (outcome 5). Then bridge installs: `init.mjs bridges --host <host>` prints what is missing; interactively, one explicit confirmation question (default yes, naming the third-party plugins it will install) and then `init.mjs bridges --host <host> --yes` installs them; under `--yes` (unattended) the commands are only printed for the human to run, because third-party installs always need an explicit human confirmation.mjs show --host <host>` to print the resolved table, bridge readiness, the tools that write into `.claude/skills`, and (on Codex) the hook-trust reminder. On a Codex host it also runs `init.mjs agents-cap --max-parallel <n>` — appending a `[agents]` table to the Codex config when the config has none, or printing the exact lines to add when one already exists. Init never changes `sandbox_workspace_write.network_access`.

## Boundaries

- Never write `network_access` anywhere, on either host.
- `contract-writer` is never customizable in outcome 3, and outcome 4's Codex-host consequence above is the only way its resolution changes.
- `/vibe:setup` calls this flow as its final step.

Done when `init.mjs show --host <host>` reflects the choices made above and, at project scope, the sharing layer's apply has completed.
