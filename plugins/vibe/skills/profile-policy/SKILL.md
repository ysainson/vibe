---
name: profile-policy
description: How model routing works across this marketplace - the routing file, its presets and adapters, and the rule that no role is ever tied to a model name in prose. Background knowledge for orchestrating, authoring agents, or switching the whole kit to a different model or runtime.
user-invocable: false
---

# Model routing policy

Routing lives in config, not prose: `routing.json` — user scope at `~/.agents/vibe/routing.json`, project scope at `.agents/vibe/routing.json` (project overrides user, per role key). No agent, command, or skill names a model in prose; roles map to routing rows there, so changing models or runtimes is a config change, not a rewrite. A SessionStart hook resolves the file and injects it into every session as a `<VIBE_ROUTING>` block — one row per role (role, runtime, adapter, model, effort, source) — that `vibe:conduct`, `/vibe:review`, `/vibe:review-plan`, and `/vibe:quick-check` read directly; `plugins/vibe/scripts/routing.mjs resolve` is the fallback when the block is missing.

## The three presets

- **`uniform`** — every role runs on the session host's own model, the safe default when cost-tiering isn't wanted or other runtimes/tiers aren't available yet.
- **`tiered`** — cost-routes doer and review work across model tiers on the `claude` runtime, so the strong tier carries review while the session model is reserved for orchestration.
- **`split`** — moves doer work to the other installed runtime, keeping escalation, exploration, and review on `claude`.

Every preset still sends the three cross-check roles (`cross-check`, `adversarial`, `plan-check`) to the other runtime's companion. The shipped rows live in `plugins/vibe/routing/presets/*.json`. A user routing file names one of these presets and overrides only the roles that differ. Precedence, highest first: a one-run argument, the project file, the user file, the preset; with neither a project nor a user routing file present, the profile is `tiered`. `/vibe:init` picks `split` when the other runtime is installed and logged in, else `tiered`; `contract-writer` is pinned to the `claude` runtime under every preset. Override for a single run with the skill argument: `/vibe:conduct <preset> ...`, or override one role with `role=runtime[:model[:effort]]`.

## Tiers are aliases, never dated ids

Set each row's model through an alias — `sonnet`, `haiku`, `opus`, `fable`, or `default` (the session/host model). Never bake a dated id like `claude-<family>-<n>` into a role; aliases survive model changes, dated ids rot.

**Effort follows the adapter.** On the `claude` runtime, the `claude-native` row accepts only `default` — effort is pinned instead by each agent's own `effort: high` frontmatter, so the session `/effort` setting steers only the orchestrator, never a dispatched role. On the codex and companion rows (`codex-exec`, `codex-agent`, `cc-companion`, `codex-companion`), the routing row's effort is passed explicitly at dispatch and validated against that row's accepted effort list.

## Adapters and `default`

Adapters are the five named rows in `plugins/vibe/routing/adapters.json`: `claude-native`, `codex-exec`, `codex-agent`, `cc-companion`, `codex-companion`. Every role resolves to an adapter by `(host, resolved runtime)` — `claude-native` for Claude host + `claude` runtime, `codex-exec` for Claude host + `codex` runtime, `codex-agent` for Codex host + `codex` runtime, `cc-companion` for Codex host + `claude` runtime. The three `cross` roles (`cross-check`, `adversarial`, `plan-check`) are the exception: they always take the host's own companion row instead — `codex-companion` on a Claude host, `cc-companion` on a Codex host — dispatched on that row's `review`, `adversarial-review`, or `task` path respectively. Each row lists the effort values it accepts; the resolver validates a row's effort against its adapter's list before dispatch. A row's `model` or `effort` value of `default` means "let that layer decide" — omit the override at dispatch rather than passing an explicit value.

## Requested vs effective

The routing row states the **requested** model; what actually runs is the **effective** model, and the two can differ under `CLAUDE_CODE_SUBAGENT_MODEL`. On the Claude host, resolution order is:

1. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` set → `CLAUDE_CODE_SUBAGENT_MODEL` wins outright, overriding every dispatch `model`.
2. Otherwise a dispatch `model` from the routing row wins when the row is not `default`; when the row is `default`, `CLAUDE_CODE_SUBAGENT_MODEL` decides if it is set.
3. Otherwise the agent's own `model:` frontmatter.
4. Otherwise the main conversation model.

Flipping every role at once requires `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` alongside the env var; a routed dispatch `model` wins over the bare env var.

Report both when they diverge (e.g. a `FORCE`d env override silently changing a `sonnet` row to something else) so the requested vs effective gap is never silent.

## Egress

Roles don't carry an egress class themselves. `egress` in the routing file is an **acknowledgment**, per provider key (`openai`, `anthropic`), of the dispatch classes allowed to cross to that provider. `review` covers `cross-check`, `adversarial`, and `plan-check`. `doer` covers every other role that crosses runtimes to reach that provider (e.g. `egress: openai=review,doer anthropic=-` on a Claude host running `split`).

A run that needs a class the provider hasn't acknowledged asks once. On "no", `doer`-class roles reroute to the host runtime instead. The exception is `contract-writer`: its `claude` pin can't be satisfied on a Codex host, so that run stops as unsupported before contracts are written. `review`-class roles are reported as not performed rather than silently skipped.

A project routing file must carry its own `doer` acknowledgment. A user-scope `doer` acknowledgment applies only to repositories with no project routing file.

## External cross-check models (Codex) are config-owned

The external cross-check used by `/vibe:review-plan` and `/vibe:review` (Codex, via its CLI) is **config-owned** the same way any `cross`-adapter role is: dispatch steps assert readiness and report the config- or routing-derived model expectation, but never name a model themselves. The consumer's own codex config decides the model when the routing row is `default`.

A concrete model name may appear only in setup-layer docs (the README), and only dated to when it was verified.

See `vibe:fable-safe-authoring` for why no role is tied to a model name in prose, and how to keep authored prompts from silently falling back off the model you targeted.
