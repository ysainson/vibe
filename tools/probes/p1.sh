#!/usr/bin/env bash
# Probe P1: does Claude Code list skills from a SYMLINKED `.claude/skills` container?
# Prepares a scratch repo; the human then opens a fresh Claude session there and runs `/skills`.
# Pass: the skill `p1-symlinked-container` is listed. Fail: it is not.
set -euo pipefail
dir="${1:-$(mktemp -d "${TMPDIR:-/tmp}/vibe-p1.XXXXXX")}"
mkdir -p "$dir/.agents/skills/p1-symlinked-container" "$dir/.claude"
cat > "$dir/.agents/skills/p1-symlinked-container/SKILL.md" <<'SKILL'
---
name: p1-symlinked-container
description: Probe skill living under .agents/skills, reached through a symlinked .claude/skills container.
---
If you can read this, the symlinked container works.
SKILL
ln -sfn ../.agents/skills "$dir/.claude/skills"
( cd "$dir" && git init -q && git add -A && git -c user.name=probe -c user.email=probe@example.com commit -qm "p1 scratch" )
echo "P1 scratch repo: $dir"
echo "Now: cd \"$dir\" && claude   # then run /skills and look for p1-symlinked-container"
