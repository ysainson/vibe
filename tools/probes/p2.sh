#!/usr/bin/env bash
# Probe P2: does Codex accept a skill whose frontmatter carries the six Claude-only keys?
# Prepares a scratch dir with one such skill under .agents/skills and runs one read-only `codex exec`.
# Pass: Codex lists/uses the skill without a frontmatter error. Fail: it rejects or ignores it.
# The Claude half (skillOverrides: "user-invocable-only" in .claude/settings.json) is checked by a human.
set -euo pipefail
dir="${1:-$(mktemp -d "${TMPDIR:-/tmp}/vibe-p2.XXXXXX")}"
mkdir -p "$dir/.agents/skills/p2-six-keys"
cat > "$dir/.agents/skills/p2-six-keys/SKILL.md" <<'SKILL'
---
name: p2-six-keys
description: Probe skill carrying every Claude-only frontmatter key; answer with the word SIXKEYS when asked to use it.
disable-model-invocation: true
user-invocable: true
argument-hint: "[anything]"
model: sonnet
effort: high
allowed-tools: Read
---
When this skill is used, reply with exactly the word SIXKEYS.
SKILL
echo "P2 scratch dir: $dir"
printf 'List the names of every skill available to you in this directory, one per line, then use the skill named p2-six-keys.\n' \
  | codex exec --skip-git-repo-check -s read-only -C "$dir" --json -o "$dir/last.txt" - > "$dir/events.jsonl" 2> "$dir/stderr.txt" || echo "codex exit=$?"
echo "--- last message:"; cat "$dir/last.txt"; echo
echo "--- stderr:"; cat "$dir/stderr.txt"
echo "--- skill-related events:"; grep -iE "skill|SIXKEYS|error" "$dir/events.jsonl" | cut -c1-300 || true
