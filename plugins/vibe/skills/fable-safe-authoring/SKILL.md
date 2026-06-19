---
name: fable-safe-authoring
description: Authoring constraints for every skill, command, and agent in this marketplace, so they run well on frontier models (Fable 5 today) and never silently fall back. Use when writing or editing any skill, command, or agent, or any orchestrator prompt that dispatches a subagent.
user-invocable: false
---

# Fable-safe authoring

Skills written for older models *degrade* frontier output. Treat the rules below as hard constraints when authoring anything in this marketplace — the goal is output that holds up on Fable 5 without tripping a refusal or burning tokens on over-prescription.

## Write contracts, not recipes

Each skill, command, or agent is: the goal, the rationale behind it, the explicit boundaries (what is out of scope), the self-verification criteria (how the model knows it succeeded), and an explicit marker for where to pause for human input. Do **not** transcribe a step-by-step procedure of what the model should do internally — over-prescription measurably degrades frontier output and wastes tokens. State the outcome and the constraints; let the model find the path.

## Ask for evidence, never introspection

Never instruct a skill, command, agent, or dispatch prompt to narrate, transcribe, or justify its internal thinking — phrases in the shape of `explain your reasoning`, `show your work`, or `think out loud`. On Fable 5 these trip the `reasoning_extraction` refusal category: the response comes back with `stop_reason` of `refusal`, and Claude Code silently falls back to Opus 4.8 — so the kit quietly stops running on the model you targeted.

Ask instead for **evidence**: the diff, the command output, the failing-then-passing test, the file:line. Evidence is verifiable and model-safe; introspection is neither.

## Handle a refusal as a first-class outcome

When wiring any code that consumes model output (the release sidecar, a hook, a generated app's API client), branch on **`stop_reason == "refusal"`** and treat it as a non-result — surface it, retry with a reworded prompt, or fall back deliberately. Do not treat a refusal as valid content.

- Branch on `stop_reason`, **not** on `stop_details`. `stop_details` (`{ type: "refusal", category, explanation }`) is informational only: `category` and `explanation` can be `null`, and `stop_details` is absent entirely on the Message Batches API. The refusal categories include `reasoning_extraction`, `cyber`, `bio`, and `frontier_llm`.
- There is no API knob to disable or expand thinking on Fable 5. Its adaptive thinking is summarized-only and cannot be turned off; `showThinkingSummaries` is a Claude Code CLI setting, not a request parameter. Do not author any skill that assumes a `thinking` display/expansion request field exists.

## Lead with the outcome, stay terse

A subagent's final message is data for the orchestrator, not prose for a human — structure it outcome-first (what changed, then evidence). A user-facing summary re-grounds the same way: the result first, the path second. Terseness is a feature; padding is tokens the orchestrator has to read.

## Self-check before shipping a skill/agent/command

- No instruction to explain, narrate, or justify reasoning — anywhere.
- Every "do" is paired with a verifiable signal of done.
- Agent `model:` is an alias (`sonnet` / `haiku` / `opus` / `fable` / `inherit`), never a dated id.
- The `description` is the trigger ("what + when"), tight enough to route on.
