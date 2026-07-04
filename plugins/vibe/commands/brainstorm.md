---
description: Turn a rough idea into a written spec - wraps superpowers' brainstorming, applies VIBE's project heuristics, and saves the result to docs/specs/.
argument-hint: [idea or topic]
disable-model-invocation: true
---

# Brainstorm — idea to spec

## Date
```!
date +%Y-%m-%d
```

Turn the idea in `$ARGUMENTS` (ask for it if empty) into a durable spec. The `brainstorming` skill (from the superpowers dependency) is the engine; this command adds VIBE's output convention and heuristics.

- **Engine.** Run superpowers' `brainstorming` to explore the idea, surface decisions and trade-offs, and converge on a spec. When a choice changes the outcome, ask via `vibe:clarify` (the AskUserQuestion tool).
- **Output.** Write the spec to `docs/specs/<date>-<slug>.md` using the date above — the durable trail `/vibe:setup` and `/vibe:conduct` build from.
- **Heuristics.**
  - For a visual-hero app (the look *is* the product), propose a **two-phase build** — a native sandbox to nail the look first, then integration — and validate the visual before layering features.
  - Shape the build as numbered, **test-first, commit-per-task** steps, so `/vibe:conduct` can pick it up directly.

The spec is the deliverable, not code. End by pointing the user at `/vibe:setup <spec>` for a new project, or `/vibe:review-plan <spec>` to harden the spec before `/vibe:conduct` builds it.
