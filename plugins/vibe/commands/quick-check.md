---
description: Fast pre-commit sanity check on changed files - a secrets scan plus the enabled overlay's quick guardians and project-local lightweight checks. Use /vibe:review for the full pass.
---

# Quick Check

Fast pre-commit validation on changed files only. Use `/vibe:review` for a comprehensive pass.

## Workflow
1. Changed files: `git diff --name-only HEAD`.
2. Filter to code files (skip docs and assets). If none, report "nothing to check" and stop.
3. Run, in parallel, only the lightweight checks:
   - `vibe:security-verifier` — quick secrets / credential scan of the diff.
   - Stack overlay quick guardian by file type: if `.swift` changed, `vibe-swift:swift-concurrency` (isolation / correctness); in an Expo project (`expo` in `package.json` dependencies) with changed `.tsx`, `vibe-expo:expo-ui-performance` (re-render discipline). If the matching overlay plugin isn't installed or enabled, say so and skip its guardian.
   - Project-local lightweight guardians from `.claude/agents/`. Skip silently if none.
4. Report.

## Output Format
```markdown
## Quick Check

**Files checked**: X

### <one section per agent>
- No issues
OR
- [file:line] — issue

### Verdict
- Ready to commit
- Fix X issue(s) first
```
