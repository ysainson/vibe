# Probe results (spec: docs/specs/2026-09-04-multi-runtime-vibe.md, phase 0)

| Probe | Date | Result | Evidence |
|---|---|---|---|
| P0 | 2026-09-20 | pass | `tools/fixtures/codex-exec.jsonl`; session id at `thread.started` → `thread_id` (codex-cli 0.153.2) |
| P1 | — | pending (human gate) | run `tools/probes/p1.sh`, open a fresh Claude session in the printed dir, run `/skills`, look for `p1-symlinked-container`. Gates only the optional whole-container symlink mode of `share apply`, disabled in phase 1. |
| P2 (Codex half) | 2026-09-20 | pass | `tools/probes/p2.sh`: `codex exec --skip-git-repo-check -s read-only` listed `p2-six-keys` among its skills and replied `SIXKEYS`; no frontmatter error for `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `allowed-tools`. |
| P2 (Claude half) | — | not needed | `skillOverrides: "user-invocable-only"` only matters when Codex rejects a key; it did not. |
| P3 | — | not run | phase 3 gate |
| P4 | — | not run | before phase 2 task 10 |

Contract 3's `skillOverrides` assertion stays disabled: P2 recorded `pass`.
