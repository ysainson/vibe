# Plan: Codex overlay + model-routing coverage

Spec: `docs/specs/2026-07-17-codex-overlay-and-routing-coverage.md` (rev 3, ready — review-plan: 4 lenses + Codex cross-check, then a resolution pass).
One commit per task; each task's contract test file lands in the same commit as its implementation, red-first within the task window. Order: E → B → A → C → D (independent files; order keeps red windows shortest).

| # | Task | Files | Contract (proves it) | Command |
|---|------|-------|----------------------|---------|
| 0 | Plan + contracts | `docs/plans/…`, `tools/conduct-skill.test.ts` (new), `tools/profile-policy.test.ts` (new), `tools/review-command.test.ts` (new), `tools/marketplace-codex.test.ts` (new), `tools/review-plan-command.test.ts` (extend) | starred assertions red pre-implementation | `bun test` |
| 1 (E) | profile-policy: external cross-check section + reword the dated-id example to `claude-<family>-<n>` | `plugins/vibe/skills/profile-policy/SKILL.md` | `tools/profile-policy.test.ts` | `bun test tools/profile-policy.test.ts` |
| 2 (B) | conduct: Exploration + Contract-writing PROFILE rows, fallback sentence, step-2/step-6 prose; new `contract-writer` agent; guardrails contract-writer block | `plugins/vibe/skills/conduct/SKILL.md`, `plugins/vibe/agents/contract-writer.md` (new), `plugins/vibe/skills/conduct/guardrails.md` | `tools/conduct-skill.test.ts` | `bun test tools/conduct-skill.test.ts` |
| 3 (A) | marketplace: `codex` git-subdir re-export pinned v1.0.6 @ `db52e28f…`; README re-exports paragraph + Status enumeration + optional-overlay subsection | `.claude-plugin/marketplace.json`, `README.md` | `tools/marketplace-codex.test.ts` | `bun test tools/marketplace-codex.test.ts` + `claude plugin validate . --strict` |
| 4 (C) | review-plan Step 3: locate (installed_plugins.json) → assert (layered config, path-keyed) → consent → dispatch (`task --prompt-file --effort xhigh`, background) → collect (10-min budget) → report (expectation + source); all-stage failure rule; delete `codex exec` + model pin | `plugins/vibe/commands/review-plan.md` | `tools/review-plan-command.test.ts` | `bun test tools/review-plan-command.test.ts` |
| 5 (D) | review: gated cross-check at start of Step 2 (consent → secrets pre-scan → dispatch `review --scope working-tree`/`--base`), `review_model`-first expectation, numbered collect step, plugin-absent skip | `plugins/vibe/commands/review.md` | `tools/review-command.test.ts` | `bun test tools/review-command.test.ts` |
| 6 | Verify + finish | — | full suite green; `claude plugin validate . --strict`; `bun tools/pins.ts --dry-run` (gh+network assumption noted); `vibe:verifier` + `vibe:security-verifier` | `bun test && bun run typecheck` |

Ship (post-merge, process not contract): `bun release plugins/vibe`.
