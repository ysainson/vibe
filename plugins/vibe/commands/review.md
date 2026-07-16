---
description: Comprehensive review of changed files - VIBE's quality + security agents, the enabled stack overlay's guardians, and any project-local agents, plus a manual convention check.
---

# Code Review

Review the changed files with every agent that applies, then a manual convention check.

## Step 1 — Get changes
```!
git diff
```
```!
git diff --cached
```

## Step 2 — Optional cross-model check, then dispatch the agents that apply (in parallel, on the changed files)

**Cross-model check (optional, gated):** launch this before the agent dispatch below so it runs concurrently with them.
- Gate: only for a high-stakes change (auth, migrations, concurrency, crypto, payment/data-handling paths) or when the user asks for it. Otherwise skip silently — no dispatch, no report line.
- Egress guard, in order — the high-stakes auto-trigger never sends a diff to OpenAI without asking:
  1. Consent — one AskUserQuestion line before the first dispatch (an explicit user request counts as consent).
  2. Secrets pre-scan — scan the diff for credential/token patterns; any hit skips the cross-check and leaves it to `vibe:security-verifier` to report.
  3. Only then dispatch.
- Locate/assert/report/failure: same contract as `/vibe:review-plan`'s cross-check step — resolve the installed `codex` plugin via `~/.claude/plugins/installed_plugins.json` (preferring a project-scoped entry, then this marketplace's), echo the resolved path/version/origin, and confirm `setup --json` reports the CLI installed and authenticated (the companion script is `<installPath>/scripts/codex-companion.mjs`). Any failure at any stage — locate, assert, consent declined, secrets pre-scan hit, dispatch, collect — is reported (stage + reason) and skipped; the cross-check never fails or blocks the review.
- Dispatch: via the companion's `review` subcommand — `review --scope working-tree` when the tree is dirty, `review --base <default-branch>` for a clean branch review (`--base` alone reviews the branch comparison and can miss dirty-tree changes). The `review` subcommand takes no effort flag — effort is config-owned and reported from the config expectation. Companion-level `--background` is a no-op on the review path (as of v1.0.6); background it at the Bash level (`run_in_background`) instead.
- Model expectation: read the codex config's `review_model` key first, falling back to `model`, else report "codex review default" — codex's native reviewer is governed by `review_model`, not `model`.
- If the `codex` plugin isn't installed, say so in the report and skip — mirroring the overlay-guardian rule below.

**VIBE core (always):**
- `vibe:reviewer-quality` — craft: simplicity, idioms, conventions, scope creep, correctness smells.
- `vibe:security-verifier` — secrets, injection, authz, unsafe data handling, dependency risk.

**Stack overlay (by changed file type):**
- If `.swift` files changed: `vibe-swift:swift-concurrency` and `vibe-swift:swift-testability`; add `vibe-swift:swift-signing` only when signing, entitlements, or release config changed. Consult the `swiftui-expert-skill` / `swift-testing-expert` skills for specifics.
- In an Expo project (`expo` present in `package.json` dependencies — file extension alone is not the key, `.ts` is ambiguous), changed `.ts`/`.tsx` files dispatch `vibe-expo:expo-ui-performance` and `vibe-expo:expo-testability`; add `vibe-expo:expo-a11y` when screens or components changed; add `vibe-expo:expo-release` only when app config, eas.json, config plugins, or native modules changed. Consult the `callstack-react-native:react-native-best-practices`, `swmansion-react-native:react-native-best-practices`, `vercel-react-native:vercel-react-native-skills`, and the `expo` plugin's skills for specifics.
- If the matching overlay plugin isn't installed or enabled, say so in the report and skip its guardians — never dispatch missing agent ids.
- Other overlays add their guardians here as they ship.

**Project-local (discover, then dispatch what applies):**
List the project's `.claude/agents/` (all subdirectories) and dispatch any review-relevant local guardians on the same changed files. Skip silently if the project has none.

## Step 3 — Manual verification
Check the project's CLAUDE.md conventions (naming, structure, content rules) against the changed files; report any rule the agents don't cover.

## Step 4 — Collect the cross-model check
If the cross-check was launched in Step 2, wait up to 10 minutes after the VIBE agents above return. On timeout, report "cross-check still running — verdict issued without it; collect later via `/codex:status`" and proceed to the verdict. If the cross-check was gated off or skipped, this step is a no-op.

## Step 5 — Consolidate

## Output Format
```markdown
## Code Review Report

### Agent Results
| Agent | Issues | Notes |
|-------|--------|-------|
| (one row per agent dispatched) | X | |

### Cross-model check
- skipped (reason) / findings — resolved companion path/version, the `review_model`-derived model expectation, and the config-owned effort. Section appears only when the cross-check was attempted or explicitly requested.

### Critical (must fix)
- [file:line] [issue] [fix]

### Should fix
- [file:line] [issue] [fix]

### Conventions (CLAUDE.md)
- [ ] [rule]: PASS / FAIL

### Verdict
- Approved — no critical issues
- Changes requested — fix the critical issues first
```
