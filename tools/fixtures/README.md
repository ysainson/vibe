# Fixtures

## `codex-exec.jsonl` (probe P0, captured 2026-09-20)

One real `codex exec --json` run (codex-cli 0.153.2, `-s read-only`, prompt
"Reply with exactly the single word: ok", `-o last.txt`):

```
printf 'Reply with exactly the single word: ok\n' \
  | codex exec --skip-git-repo-check -s read-only -C <dir> --json -o <dir>/last.txt -
```

Event stream (one JSON object per line): `thread.started`, `turn.started`,
`item.completed`, `turn.completed`.

**Session id field path (frozen by this golden):** the first event has
`type: "thread.started"` and the id is its top-level `thread_id` field.
`runtime-job.mjs` reads `sessionId` from exactly that path; `-o` writes the
last agent message only when the run finishes.
