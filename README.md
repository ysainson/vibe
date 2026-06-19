# VIBE

> It looks like vibe coding. It's the opposite.

A personal Claude Code plugin marketplace that turns "vibe coding" into a disciplined, model-adaptive pipeline: idea → brief → scaffold → test-first build, where **every diff is reviewed** and an **independent fresh-context verifier signs off** before anything is called done. Same casual, one-command surface as vibe coding — TDD-first, mandatory review, and a separate verifier underneath.

The bet is on process, not a bigger model: tight contracts, staged review, and model-tiering are what make it good, and the whole kit flips from Opus 4.8 today to Fable 5 later with one environment variable and zero file edits.

## Install

```
/plugin marketplace add ysainson/vibe
/plugin install vibe@ysainson
```

Local development of the plugins themselves:

```
/plugin marketplace add /absolute/path/to/vibe
```

## Plugins

### `vibe` — the core (stack-agnostic)

The orchestration engine. Pure process — no framework knowledge.

| Component | What it is |
|---|---|
| `/vibe:conduct` | Orchestrated coding flow: the session model plans, writes a failing test contract, lays out a numbered commit-per-task plan, delegates implementation to model-tiered doer subagents, reviews **every** diff in two passes, and gates completion through an independent fresh-context verifier. A thin command wrapper over the `conduct` skill — commands display namespaced (`/vibe:*`) in autocomplete while the backing skill carries `user-invocable: false` to stay model-invocable without a duplicate menu entry. |
| `vibe:doer` | Implementation subagent (Sonnet by default). |
| `vibe:doer-mechanical` | Mechanical-edit subagent (Haiku by default) — renames, codemods, boilerplate. |
| `vibe:reviewer-spec` | Review pass 1: spec compliance — does the diff meet the contract, nothing gamed? |
| `vibe:reviewer-quality` | Review pass 2: craft — simplicity, idioms, conventions, no scope creep. Kept separate from pass 1 because a blended review is easier to game. |
| `vibe:verifier` | Fresh-context final gate — adversarial spec check on the diff with no implementation history. |
| `vibe:security-verifier` | Security lens: secrets, injection, authz, data handling, dependencies. |
| `vibe:clarify` | Hidden behavior skill: clarifying questions go through the AskUserQuestion tool (concrete options, recommended default, self-contained); defines when to ask vs state an assumption and proceed. |
| `vibe:profile-policy` | Hidden knowledge skill: how model routing works — the PROFILE tiers and the one global Opus↔Fable switch. |
| `vibe:fable-safe-authoring` | Hidden knowledge skill: authoring constraints so every skill/command/agent runs well on frontier models and never silently falls back. |

## The build pipeline

`vibe:conduct` wraps [superpowers](https://github.com/obra/superpowers) as the phase engine and layers on three distinctives it doesn't provide: model-tiering by task, review of every diff, and an independent fresh-context verifier as a separate final pass.

```
brainstorm → spec → test-contract → plan (numbered, commit-per-task) → tiered doers → review×2 → fresh-context verify → finish
```

`docs/specs/` and `docs/plans/` are the durable trail.

## Model routing

Routing lives in **one place**: the `PROFILE` line + table in `plugins/vibe/skills/conduct/SKILL.md`. `tiered` routes doers to Sonnet/Haiku with Opus as escalation; `uniform` runs every role on the session model — switch to it when cost-tiering isn't wanted or smaller tiers aren't available. No role is ever tied to a model name, so changing the session model needs no edits here. To flip the whole kit to a different model, set the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable (highest-priority override, zero file edits). See `vibe:profile-policy`.

## Conventions

- Skills are goals, contracts, and constraints — not step-by-step recipes. Frontier models degrade under over-prescription; the `description` frontmatter is the trigger, written as "what + when".
- Agents: `description` tells the orchestrator when to delegate; `model:` uses aliases (`sonnet`, `haiku`, `opus`, `fable`, `inherit`), never dated model ids.
- Never instruct an agent to echo or explain its internal reasoning — ask for evidence (output, diffs). See `vibe:fable-safe-authoring`.
- Bump `version` in a plugin's `plugin.json` when changing it.

## Requirements

Claude Code **2.1.154+** for the full feature set used here: dependency version constraints (2.1.110+), `displayName` and the enable/disable dependency cascade (2.1.143+), and `defaultEnabled` (2.1.154+).

## Status

Built and validated: the marketplace skeleton and the `vibe` core orchestration engine (`conduct` + the doer/reviewer/verifier agents + the `clarify`/`profile-policy`/`fable-safe-authoring` skills).

Planned: `/vibe:setup` (brief-driven scaffolder), `/vibe:brainstorm`, the `/vibe:review` · `/vibe:commit` · `/vibe:fix` · `/vibe:quick-check` suite, the `vibe-swift` overlay with pinned third-party expert skills, and the Bun/TypeScript release sidecar.
