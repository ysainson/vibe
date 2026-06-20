---
description: Generate a conventional commit message from the staged (or unstaged) changes and copy it to the clipboard.
allowed-tools: Bash(pbcopy *)
disable-model-invocation: true
---

## Status
```!
git status -s
```

## Staged changes
```!
git diff --cached
```

## Unstaged changes (fallback if nothing staged)
```!
git diff
```

## Recent commits (match style)
```!
git log --oneline -5
```

## Instructions

Generate a conventional commit message from the changes above:

1. Use **staged changes** if available, otherwise **unstaged changes**. If both are empty, say "nothing to commit" and stop.
2. Follow this format — scope optional, body bullets only when they add information:
   ```
   <type>(<scope>): <short summary>

   - Detail 1
   - Detail 2
   ```
   **Types**: feat, fix, refactor, docs, style, test, chore
3. Copy to the clipboard with a quoted heredoc (safe from shell expansion):
   ```
   pbcopy <<'EOF'
   <message>
   EOF
   ```
4. Display the message.

**Do NOT include** "Co-Authored-By" lines.
