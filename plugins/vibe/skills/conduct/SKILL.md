---
name: conduct
description: Orchestrate a coding task end-to-end - consume the spec, write failing test contracts, plan it as numbered commit-per-task work, delegate implementation to model-tiered doer subagents, review every diff in two passes, and gate completion through an independent fresh-context verifier. Wraps the superpowers phase skills and layers model-tiering, mandatory review, and independent verification on top. Use for features, fixes, or refactors with more than a couple files of work, or whenever the user asks to orchestrate, delegate, or build something test-first.
user-invocable: false
---

# Conduct — orchestrate, delegate, verify

You are the orchestrator and reviewer. You own the thinking: spec, contracts, plan, decomposition, dispatch, review verdicts, and the final report. You do not write implementation code yourself, with one exception: edits so small that writing a dispatch prompt would cost more than the edit (a one-line fix, a single-file tweak).

This flow **wraps [superpowers](https://github.com/obra/superpowers)** — it is the phase engine. Use its skills at the steps marked below rather than reinventing them; `conduct` adds the three things superpowers does not: model-tiering by task, review of every diff, and an independent fresh-context verifier as a separate final pass. Everything you write — dispatch prompts, redirects, this skill — follows `vibe:fable-safe-authoring`: contracts not recipes, evidence not introspection.

## Model routing

`PROFILE: tiered`

| Role | Agent | tiered | uniform |
|------|-------|--------|---------|
| Implementation | `vibe:doer` | sonnet | inherit |
| Mechanical edits | `vibe:doer-mechanical` | haiku | inherit |
| Escalation | `vibe:doer` | opus | inherit |
| Exploration | `Explore` (built-in) | sonnet | inherit |
| Contract writing | `vibe:contract-writer` | inherit | inherit |
| Spec-compliance review | `vibe:reviewer-spec` | inherit | inherit |
| Code-quality review | `vibe:reviewer-quality` | inherit | inherit |
| Final verification | `vibe:verifier` | inherit | inherit |
| Security verification | `vibe:security-verifier` | inherit | inherit |

Dispatch each agent with the model override from the active profile column. `inherit` means the session model. The flow is model-agnostic: if the session model changes (Fable 5, Opus 4.8, ...), nothing here changes. Switch `PROFILE` to `uniform` to run every role on the session model — for when cost-tiering isn't wanted or smaller models aren't available. The skill argument overrides the profile for one run (`/vibe:conduct uniform ...`). The policy and the global Opus↔Fable switch live in `vibe:profile-policy`; this table is the operational source.

The table binds every dispatch mechanism, not just the Agent tool. If any phase runs through the Workflow tool (ultracode, or an explicit workflow request), workflow `agent()` calls inherit the session model unless told otherwise — carry the profile override as each call's `model` option and name the role with `agentType`. Self-check before launching a workflow script: no `agent()` call for a non-`inherit` role omits `model`.

Exploration dispatches (codebase search/summarize fan-outs) take the profile's model as the per-invocation override, exactly like doers; the orchestrator still verifies load-bearing claims itself. Overlay guardians and project-local agents are not in this table — they route by their own `model:` frontmatter (all VIBE-shipped guardians say `inherit`).

Escalation means: a subtask failed two review redirects, or is genuinely hard in isolation (deep debugging, a complex algorithm) and worth a stronger doer from the start.

## Flow

1. **Spec.** If the request is underspecified in ways that change the outcome, ask before building — via the AskUserQuestion tool; the `vibe:clarify` skill defines the bar for asking vs proceeding. If a spec already exists under `docs/specs/`, read it and confirm it still holds; otherwise state your assumptions and proceed. Write verifiable success criteria — things a test or command can check.

2. **Contract.** Tests first, before any implementation is dispatched, and confirm they fail. The failing test is the gate: no implementation begins until the contract exists and is red. You own the tests: write them yourself or dispatch test-writing to `vibe:contract-writer` at the contract-writing tier — carry the contract-writer block from [guardrails.md](guardrails.md), verbatim — and review the result against the spec. Tests validate contracts, not implementations. Doers never touch test files — state it in every dispatch, check it in every review. Use the `test-driven-development` skill for the RED→GREEN→REFACTOR inner loop each doer runs.

3. **Plan.** Use the `writing-plans` skill to turn the spec into a numbered, commit-per-task plan under `docs/plans/` — each task with its exact files, the command to run, and the test that proves it. The plan is the durable trail and the dispatch backlog. Skip only for changes small enough that a plan would cost more than the work.

4. **Dispatch.** Work the plan task by task. Per-task execution uses the `subagent-driven-development` skill (a fresh doer per task) or `executing-plans` (batch with human checkpoints) — pick by task coupling and token budget. Use the `using-git-worktrees` skill for isolation only when parallel doers would touch the same files. Subagents see none of this conversation, so every dispatch prompt carries:
   - the goal and the why behind it (intent, not just instructions)
   - exact scope: which files, what is out of bounds
   - the contract: which tests must pass and how to run them
   - pointers to the project conventions that apply (CLAUDE.md sections, docs)
   - the doer block from [guardrails.md](guardrails.md), verbatim

   Keep working while doers run; intervene if one goes off track or is missing context.

5. **Review — every diff, two passes.** Read every returned diff yourself against contract, scope, and conventions — this is non-optional. Diff against a pre-dispatch baseline (`git add -A` or a stash before dispatching) — plain `git diff` misses files the doer created. For any non-trivial subtask, run the two-stage review the `requesting-code-review` / `receiving-code-review` skills frame, but keep it as **two separate passes**: dispatch `vibe:reviewer-spec` (does it meet the contract and spec, nothing gamed?) and `vibe:reviewer-quality` (is the code well-made?). Also dispatch the enabled stack overlay's guardians that match the changed files, per `/vibe:review`'s overlay table. The split is deliberate — a blended review is easier to game. Verdict per subtask: accept; redirect with specific, actionable feedback (say what acceptance looks like, not "try again"); or escalate the model tier after two failed redirects.

6. **Verify — independent, fresh context.** Run the project's full check suite yourself (tests, lint, typecheck — whatever the project defines). Then dispatch `vibe:verifier` with the spec and the final diff only — never the implementation history; its value is having no stake in the work. This is a separate pass from review: the reviewers were inside the loop, the verifier is not. Add `vibe:security-verifier` when the change touches auth, user-input handling, endpoints, storage of user data, secrets/config, or dependencies. A FAIL verdict goes back to dispatch/review — refute it with evidence or fix it, never argue it away. For a high-stakes change, run the optional cross-model check from `/vibe:review` on the final diff — never per-subtask.

7. **Finish & report.** Once verification passes, use the `finishing-a-development-branch` skill to wrap the branch (commits, merge/PR, cleanup). Then report: outcome first. Every claim backed by a tool result from this session; anything unverified is labeled as such.
