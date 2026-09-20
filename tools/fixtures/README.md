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

## `harness.ts` — `makeHarness()`

A throwaway HOME + git-repo project for the routing/dispatch contracts, so
tests never shell out to the real `codex`/`claude` CLIs:

- `root`/`home`/`project` — a temp dir, `<root>/home` (HOME), `<root>/project`
  (a git repo with one commit, `-b main`).
- `userRoutingDir` / `projectRoutingDir` — `<home>/.agents/vibe` and
  `<project>/.agents/vibe`; `writeUserRouting`/`writeProjectRouting` write
  `routing.json` into them, `writeCodexConfig` writes `<home>/.codex/config.toml`.
- `env` — `PATH` with `<root>/bin` first (or, under `no-cli`, `<root>/bin` alone
  — the real machine's `codex`/`claude` must not answer), `HOME=<home>`, and the
  `FAKE_CLI_*` variables below.
- Fake `codex`/`claude` executables at `<root>/bin/<name>` (node scripts). Each
  invocation appends one JSON line (`{ argv, cwd, env, stdin }`) to
  `FAKE_CLI_LOG`, readable back via `calls()`, then behaves per `FAKE_CLI_MODE`:

  | mode | behavior |
  |---|---|
  | `ok` | exit 0; `--version`/`login status`/`plugin list --json`/`exec` (replays `codex-exec.jsonl`, `thread_id` swapped for `FAKE_CLI_SESSION` when set, writes `ok` to `-o`) all answer realistically |
  | `login-out` | same as `ok`, except `login status` prints `Not logged in` and exits 1 |
  | `no-cli` | the executable isn't created at all |
  | `fail` | exit 1 (after logging) |
  | `write` | writes `written.txt` in cwd, exit 0 |
  | `hang` | sleeps forever |
  | `trap-term` | ignores `SIGTERM` and sleeps forever |

  Other variables the fakes read:

  | variable | effect |
  |---|---|
  | `FAKE_CLI_SESSION` | `thread_id` substituted into the `exec` replay |
  | `FAKE_CODEX_PLUGINS` | comma-separated plugin ids (e.g. `cc@sendbird,superpowers@openai-curated`); `codex plugin list --json` then prints one entry per id in the real shape `{"pluginId","name","marketplaceName","version":"1.5.0","installed":true,"enabled":true}`; unset prints `{"installed":[]}` |

`cleanup()` removes the whole temp dir.
