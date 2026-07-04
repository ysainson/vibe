---
description: Adversarially review a spec/plan against the codebase before code is written, iterating to a ready verdict - the gate between /vibe:brainstorm and /vibe:conduct.
argument-hint: "[spec path] (defaults to the newest docs/specs/*.md)"
disable-model-invocation: true
---

# Review-Plan — adversarial spec review

Tear apart a spec/plan **before** a line of code is written: verify its claims against the real codebase, then iterate to a `ready` verdict. `/vibe:review` reviews diffs against a spec; this reviews the spec itself.

## Step 1 — Target
Resolve the spec: `$ARGUMENTS` if given, else the newest file under `docs/specs/*.md`. Read it in full and note every concrete claim it makes about the codebase (files, APIs, deployment targets, data shapes) — the lenses below verify these against the actual code, not against the spec's own prose.

## Step 2 — Fan out adversarial lenses (parallel)
Dispatch independent reviewer agents, one per lens, in parallel. Each is a skeptic: no praise, verify every claim against the real code, and report only findings it can justify concretely — a file:line, an API's actual semantics, or a math/consistency check. Default lenses (adapt them to the spec's domain rather than using these verbatim):
- **Feasibility / runtime APIs** — do the cited APIs, libraries, and platform behaviors actually work as claimed?
- **Math / internal consistency** — do the spec's own numbers, formulas, and cross-references agree with each other?
- **Architecture / performance** — is the design sound at the scale and shape the spec implies?
- **Build & conduct-readiness** — is this shaped as test-first, numbered, commit-per-task work that `/vibe:conduct` can pick up directly?

For a Swift/iOS spec, also route the relevant lens through the `swiftui-expert-skill` / `swift-testing-expert` skills.

## Step 3 — Independent cross-check (optional)
For a high-stakes spec, run Codex as a second, different-model reviewer on the same brief: `codex exec -m gpt-5.5 -c model_reasoning_effort=high -c sandbox_mode=read-only -c approval_policy=never - < prompt` (run it in the background, redirect output to a file). On a ChatGPT-account Codex login the codex-family models are rejected — use the general `gpt-5.5`, not a `codex-*` alias. Strong agreement between Codex and the lenses is a high-confidence signal; skip this step for low-stakes specs.

## Step 4 — Synthesize
Dedup the lens (and Codex) findings into one prioritized report: Critical / Major / Minor, each with the spec section, the concrete problem, and a fix. Where lenses disagree, flag it as "verify empirically" rather than picking a side.

## Step 5 — Gate and iterate
Verdict: `ready` / `ready-with-fixes` / `needs-rework`, plus the single biggest risk.
- `needs-rework` or `ready-with-fixes`: revise the spec, then re-run Steps 2-4 as a **resolution pass** — for every prior finding, report `Resolved / Partially / Not`, and separately call out any new issue the rewrite introduced.
- Loop until `ready`. Stop once remaining items are implementation-level detail (the build's test-first tasks will catch them) rather than spec-level redesign — don't chase Minors forever.

## Output Format
```markdown
## Plan Review — <spec>

### Resolution (re-reviews only)
| # | prior finding | Resolved / Partially / Not | why |

### Findings
| sev | §section | problem | fix |

### Verdict
ready / ready-with-fixes / needs-rework — biggest risk: …
```

Once the verdict is `ready`, point the user at `/vibe:conduct` to build from the hardened spec.
