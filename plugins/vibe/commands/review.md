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

## Step 2 — Dispatch the agents that apply (in parallel, on the changed files)

**VIBE core (always):**
- `vibe:reviewer-quality` — craft: simplicity, idioms, conventions, scope creep, correctness smells.
- `vibe:security-verifier` — secrets, injection, authz, unsafe data handling, dependency risk.

**Stack overlay (by changed file type):**
- If `.swift` files changed: `vibe-swift:swift-concurrency` and `vibe-swift:swift-testability`; add `vibe-swift:swift-signing` only when signing, entitlements, or release config changed. Consult the `swiftui-expert-skill` / `swift-testing-expert` skills for specifics.
- Other overlays add their guardians here as they ship.

**Project-local (discover, then dispatch what applies):**
List the project's `.claude/agents/` (all subdirectories) and dispatch any review-relevant local guardians on the same changed files. Skip silently if the project has none.

## Step 3 — Manual verification
Check the project's CLAUDE.md conventions (naming, structure, content rules) against the changed files; report any rule the agents don't cover.

## Step 4 — Consolidate

## Output Format
```markdown
## Code Review Report

### Agent Results
| Agent | Issues | Notes |
|-------|--------|-------|
| (one row per agent dispatched) | X | |

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
