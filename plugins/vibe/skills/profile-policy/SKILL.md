---
name: profile-policy
description: How model routing works across this marketplace - the PROFILE tiers, the one global Opus<->Fable switch, and the rule that no role is ever tied to a model name. Background knowledge for orchestrating, authoring agents, or switching the whole kit to a different model.
user-invocable: false
---

# Model routing policy

Routing lives in **one place**: the `PROFILE` line and table in the `vibe:conduct` skill. No agent, command, or skill names a model in prose; roles map to tiers there, so changing models is a config change, not a rewrite.

## The two profiles

- **`uniform`** — every role runs on the session model (whatever `/model` is set to). The safe default when cost-tiering isn't wanted, or when the smaller tiers / a target model aren't available yet.
- **`tiered`** — turns on cost routing: implementation on a mid tier, mechanical edits on the cheapest, escalation and all review/verification on the strong tier. Reviewers and verifiers stay on `inherit` because judgment wants the strongest model.

Switch by editing the `PROFILE:` line in `vibe:conduct`. Override for a single run with the skill argument: `/vibe:conduct uniform ...`.

## Tiers are aliases, never dated ids

Set each agent's tier through its `model:` frontmatter using an alias — `sonnet`, `haiku`, `opus`, `fable`, or `inherit` (the session model). Never bake a dated id like `claude-opus-4-8` into a role; aliases survive model changes, dated ids rot.

## The one global switch: `CLAUDE_CODE_SUBAGENT_MODEL`

To flip the entire kit to a different model (e.g. Opus 4.8 today → Fable 5 when it returns), set the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable. It is the highest-priority override for subagent model selection, so it takes effect with zero file edits.

Resolution order (highest priority first):

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var
2. the per-invocation model parameter (the PROFILE column applied at dispatch)
3. the agent's `model:` frontmatter
4. the main conversation model

Set it to `inherit` for normal resolution (let the lower levels decide). Set it to an alias to force every subagent onto that model regardless of profile or frontmatter.

See `vibe:fable-safe-authoring` for why no role is tied to a model name in prose, and how to keep authored prompts from silently falling back off the model you targeted.
