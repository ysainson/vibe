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
For a high-stakes spec, cross-check with Codex as a second, differently-configured reviewer on the same brief — driven through the `codex` plugin's companion script, never a raw CLI incantation. Skip this step entirely for low-stakes specs; strong agreement between Codex and the lenses is a high-confidence signal when you do run it.

- **Locate** the installed plugin: read `~/.claude/plugins/installed_plugins.json` for the `codex@<marketplace>` entry's `installPath`, preferring (1) an entry whose scope covers this project, then (2) the entry installed from this marketplace (`codex@ysainson` — the copy this repo's sha pin governs), then any other. If that file is unreadable, fall back to the cache: take the newest version directory within each `~/.claude/plugins/cache/<marketplace>/codex/`, then the newest of those across marketplaces (semver-aware; non-semver directory names sort oldest — compare version directory names only, never full paths). On a tie prefer this marketplace's copy, else report the ambiguity and skip. Echo the resolved installPath, version, and marketplace origin into the report so a wrong pick is visible. Nothing resolves → report the cross-check unavailable, point at installing the `codex` plugin from this marketplace, and skip. The companion script lives at `<installPath>/scripts/codex-companion.mjs` — call it `<companion>` below.
- **Assert** readiness before dispatching: `node <companion> setup --json` must report the CLI installed and authenticated (setup output carries no model field); then derive a best-effort *model expectation* from the codex config's top-level scalar keys — the lines before the first `[` table header: project `.codex/config.toml` first (only when the project has a trusted `[projects."<dir>"]` entry in the user config), then `~/.codex/config.toml`, reading `model` + `model_reasoning_effort`. If a `profile` key is active, don't attempt to resolve it — report the config that set it with a "profile active, not resolved" caveat. No model resolves → proceed and report "codex CLI default", don't block a healthy default setup. A resolved name with a segment signaling a speed tier (`spark`, `mini`, `nano` — heuristic, not a guarantee) → warn and ask before proceeding; a cross-check on a weak model is a false signal.
- **Consent**: the cross-check sends the spec and whatever repo content Codex reads to OpenAI. Ask once per run — one AskUserQuestion line, per `vibe:clarify` — before the first dispatch; an explicit user request for the cross-check counts as that consent.
- **Dispatch**: write the review brief to a file, then run `node <companion> task --prompt-file <file> --effort xhigh` as a Claude background task (Bash `run_in_background`) — read-only (no `--write`), no `--model` flag: config owns the model; `task` is the invocation that accepts an explicit `--effort`.
- **Collect**: the background task's completion notification is the collection mechanism. Wait budget: up to 10 minutes after the lens agents have returned. On timeout, report that the cross-check is still running — issue the verdict without it, and note it can be collected later via `/codex:status`.
- **Failure rule**, all stages: any failure — locate, assert, consent declined, dispatch, collect — is reported (stage + reason) and skipped. The cross-check never fails or blocks the review.

Note for authors: the codex plugin's own commands (`/codex:review`, `/codex:adversarial-review`) carry `disable-model-invocation: true`, so VIBE commands drive the companion script via Bash rather than firing those commands through the SlashCommand tool; users can still run the slash commands directly.

## Step 4 — Synthesize
Dedup the lens (and Codex) findings into one prioritized report: Critical / Major / Minor, each with the spec section, the concrete problem, and a fix. Where lenses disagree, flag it as "verify empirically" rather than picking a side. When the cross-check ran, include the values echoed in Step 3 (installPath, version, marketplace origin), the config-derived model expectation and its source (project config / user config / CLI default), and the requested effort — never phrase it as the model that actually ran.

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
