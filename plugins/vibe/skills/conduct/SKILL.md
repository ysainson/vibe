---
name: conduct
description: Orchestrate a coding task end-to-end - consume the spec, write failing test contracts, plan it as numbered commit-per-task work, delegate implementation to model-tiered doer subagents, review every diff in two passes, and gate completion through an independent fresh-context verifier. Wraps the superpowers phase skills and layers model-tiering, mandatory review, and independent verification on top. Use for features, fixes, or refactors with more than a couple files of work, or whenever the user asks to orchestrate, delegate, or build something test-first.
user-invocable: false
---

# Conduct — orchestrate, delegate, verify

You are the orchestrator and reviewer. You own the thinking: spec, contracts, plan, decomposition, dispatch, review verdicts, and the final report. You do not write implementation code yourself, with one exception: edits so small that writing a dispatch prompt would cost more than the edit (a one-line fix, a single-file tweak).

This flow **wraps [superpowers](https://github.com/obra/superpowers)** — it is the phase engine. Use its skills at the steps marked below rather than reinventing them; `conduct` adds the three things superpowers does not: model-tiering by task, review of every diff, and an independent fresh-context verifier as a separate final pass. Everything you write — dispatch prompts, redirects, this skill — follows `vibe:fable-safe-authoring`: contracts not recipes, evidence not introspection.

## Model routing

Routing is read from the `<VIBE_ROUTING>` block the SessionStart hook injects into context — one row per role (role, runtime, adapter, model, effort, source) plus the run-level lines. If the block is missing (session started before the hook ran, or hook failed), fall back to running the resolver directly: `node "${CLAUDE_PLUGIN_ROOT}/scripts/routing.mjs" resolve --host claude --markdown`.

Each role binds to a fixed agent id: `doer` and `escalation` → `vibe:doer` (escalation at the escalation row's model); `doer-mechanical` → `vibe:doer-mechanical`; `exploration` → the built-in `Explore` agent; `contract-writer` → `vibe:contract-writer`; `reviewer-spec`, `reviewer-quality`, `verifier`, `security-verifier` → the agents of the same name; `guardians` → overlay and project-local agents discovered at dispatch, taking the `guardians` row. Each dispatch takes its `model` from the matching role's row, omitted entirely when the row's value is `default` (session model); guardian agents fall back to their own frontmatter (`model: inherit` or similar) for dispatches that bypass VIBE's flows and read no routing block.

A role whose row resolves to the `codex` runtime is dispatched on that role's host-native agent instead, and the substitution is reported; codex-runtime dispatch lands in phase 2 (spec section E).

One-run override: `/vibe:conduct <preset> ...` sets the profile for this run; `role=runtime[:model[:effort]]` arguments override a single row the same way. Precedence across argument, project file, user file, and preset is defined in `vibe:profile-policy`.

The flow is model-agnostic: routing is config, not prose — changing models or runtimes is an edit to `routing.json`, never to this skill.

Routing binds every dispatch mechanism, not just the Agent tool. If any phase runs through the Workflow tool (ultracode, or an explicit workflow request), workflow `agent()` calls inherit the session model unless told otherwise — carry the routing row's `model` as each call's `model` option and name the role with `agentType`. Self-check before launching a workflow script: no `agent()` call for a non-`default` role omits `model`.

Escalation means: a subtask failed two review redirects, or is genuinely hard in isolation (deep debugging, a complex algorithm) and worth a stronger doer from the start.

## Engineering defaults

These bind every spec, plan, and dispatch unless the spec explicitly overrides them:

- **Simplest that fully meets the requirement.** No speculative abstraction, configuration, or indirection for needs that do not exist yet.
- **Long-term by subtraction, not anticipation.** Don't ship a stopgap that is meant to be replaced, and don't build ahead of the requirement — the simple version that will still be right in a year is the architecture.
- **Grow in layers.** Smallest end-to-end working version first; add each capability on top of a product that already works. Never trade a working product for unfinished complexity.
- **Remove obsolete paths.** A change that supersedes a path also deletes it, in the same task — no compatibility layers or migrations, except where the old path has consumers outside this codebase (a published API, released plugin versions, persisted data).
- **Prefer existing capability over new code.** Established, well-maintained libraries — and above all the dependencies already in the project — beat hand-rolled implementations; verify a library's docs or types before concluding it lacks a capability.

## Flow

1. **Spec.** If the request is underspecified in ways that change the outcome, ask before building — via the AskUserQuestion tool; the `vibe:clarify` skill defines the bar for asking vs proceeding. If a spec already exists under `docs/specs/`, read it and confirm it still holds; otherwise state your assumptions and proceed. Write verifiable success criteria — things a test or command can check.

2. **Contract.** Tests first, before any implementation is dispatched, and confirm they fail. The failing test is the gate: no implementation begins until the contract exists and is red. You own the tests: write them yourself or dispatch test-writing to `vibe:contract-writer` at the `contract-writer` row's model — carry the contract-writer block from [guardrails.md](guardrails.md), verbatim — and review the result against the spec. Tests validate contracts, not implementations. Doers never touch test files — state it in every dispatch, check it in every review. Use the `test-driven-development` skill for the RED→GREEN→REFACTOR inner loop each doer runs.

3. **Plan.** Use the `writing-plans` skill to turn the spec into a numbered, commit-per-task plan under `docs/plans/` — each task with its exact files, the command to run, and the test that proves it. The plan is the durable trail and the dispatch backlog. Skip only for changes small enough that a plan would cost more than the work.

4. **Dispatch.** Work the plan task by task. Per-task execution uses the `subagent-driven-development` skill (a fresh doer per task) or `executing-plans` (batch with human checkpoints) — pick by task coupling and token budget. Use the `using-git-worktrees` skill for isolation only when parallel doers would touch the same files. Subagents see none of this conversation, so every dispatch prompt carries:
   - the goal and the why behind it (intent, not just instructions)
   - exact scope: which files, what is out of bounds
   - the contract: which tests must pass and how to run them
   - pointers to the project conventions that apply (CLAUDE.md sections, docs)
   - the doer block from [guardrails.md](guardrails.md), verbatim

   Keep working while doers run; intervene if one goes off track or is missing context.

5. **Review — every diff, two passes.** Read every returned diff yourself against contract, scope, and conventions — this is non-optional. Diff against a pre-dispatch baseline (`git add -A` or a stash before dispatching) — plain `git diff` misses files the doer created. For any non-trivial subtask, run the two-stage review the `requesting-code-review` / `receiving-code-review` skills frame, but keep it as **two separate passes**: dispatch `vibe:reviewer-spec` (does it meet the contract and spec, nothing gamed?) and `vibe:reviewer-quality` (is the code well-made?). Also dispatch the enabled stack overlay's guardians that match the changed files, per `/vibe:review`'s overlay table. The split is deliberate — a blended review is easier to game. Verdict per subtask: accept; redirect with specific, actionable feedback (say what acceptance looks like, not "try again"); or escalate the model tier after two failed redirects.

6. **Verify — independent, fresh context.** Run the project's full check suite yourself (tests, lint, typecheck — whatever the project defines). Then dispatch `vibe:verifier` with the spec and the final diff only — never the implementation history; its value is having no stake in the work. This is a separate pass from review: the reviewers were inside the loop, the verifier is not. Add `vibe:security-verifier` when the change touches auth, user-input handling, endpoints, storage of user data, secrets/config, or dependencies. A FAIL verdict goes back to dispatch/review — refute it with evidence or fix it, never argue it away. Optionally run the cross-model check: run `/vibe:review adversarial` (the `adversarial` role) on the final diff — it carries the consent and secrets pre-scan contract — for a high-stakes change or on request, never per-subtask.

7. **Finish & report.** Once verification passes, use the `finishing-a-development-branch` skill to wrap the branch (commits, merge/PR, cleanup). Then report: outcome first. Every claim backed by a tool result from this session; anything unverified is labeled as such.
