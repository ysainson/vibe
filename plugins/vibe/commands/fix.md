---
description: Auto-fix only the safe, mechanical issues in changed files - formatters/linters and project-local auto-fixers. Never touches security or behavior.
disable-model-invocation: true
---

# Auto Fix

Apply only safe, mechanical fixes to the changed files. Run `/vibe:review` first to see everything.

## Workflow
1. Changed files: `git diff --name-only HEAD`.
2. Run the project's own safe auto-fixers as defined in its CLAUDE.md — the formatter and the linter's `--fix` (e.g. `bun run lint --fix`, `swiftformat`). Resolve the exact commands from CLAUDE.md; don't invent them.
3. **Project-local fixers.** List the project's `.claude/agents/` and dispatch any auto-fix-capable guardians on the changed files — each fixes only what it documents as safe (exact, mechanical substitutions). Skip silently if none.
4. Report what changed and what was left for manual review. If the project defines no safe fixers and has no local fixer agents, report "nothing safe to auto-fix here" and stop.

## Never auto-fix (report only)
- Security issues.
- Anything that changes behavior, or has no exact safe replacement.
- Judgment-dependent issues.

## Output Format
```markdown
## Auto Fix Results

**Files processed**: X changed files

### Auto-fixed (Y)
| File | Issue | Fix |
|------|-------|-----|

### Needs manual review (Z)
| File | Issue | Suggestion |
|------|-------|------------|
```
