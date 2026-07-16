# Codex overlay + model-routing coverage

**Date:** 2026-07-17 (rev 3 — resolution pass: 21/23 Resolved, 2 Partially + 1 new Major, all folded in below)
**Status:** ready
**Motivation:** A routing audit found dispatch points the PROFILE table doesn't cover (exploration, contract writing), a profile-policy violation (`gpt-5.6-sol` pinned in `review-plan.md` prose), and a better integration surface for the Codex cross-check: OpenAI's official plugin (`openai/codex-plugin-cc`) instead of a hand-rolled `codex exec` incantation.

## Goals

1. Every dispatch point in the conduct flow has an explicit routing rule in the PROFILE table (or a stated fallback rule).
2. No dated model id (matching `/claude-[a-z]+-\d|gpt-\d/`) appears in these files: `conduct/SKILL.md`, `profile-policy/SKILL.md`, `commands/review-plan.md`, `commands/review.md`. Model choice lives in config (codex: the codex CLI's own layered config; Claude: `model:` frontmatter / PROFILE / `CLAUDE_CODE_SUBAGENT_MODEL`). Tier-name fragments (`sonnet`, `haiku`, `spark`, `mini`) are aliases, not dated ids, and are allowed.
3. The Codex cross-check runs through the pinned `codex` plugin re-export — optional for consumers, never a hard dependency of `vibe` core.
4. Cross-checks assert what they can verify and report what they asserted — the *config-derived model expectation*, labeled as such, never a claim about the runtime model (no companion output field reports the resolved model; see Contracts note).
5. Repo content never leaves the machine without the user having said yes to that specific egress.

## Non-goals

- No Codex call in conduct's per-subtask review loop (step 5). The optional cross-check lives at the spec gate (review-plan) and the final-diff gate (/vibe:review, referenced from conduct step 6).
- Never enable the codex plugin's stop-review-gate for consumers (it defaults off; we leave it off).
- Don't add `codex` to any plugin's `dependencies` — installing vibe must not force an OpenAI account on anyone.
- No change to `tools/pins.ts` semantics (its same-tag-sha-drift blind spot is noted in Risks as a future improvement, out of scope here).

## Changes

### A. Marketplace: re-export `codex`, pinned (git-subdir)

`openai/codex-plugin-cc` is a **marketplace-at-root** repo — the plugin lives at `plugins/codex` (root `.claude-plugin/` holds only `marketplace.json`). So the entry uses the repo's git-subdir pattern (same as the `expo` entry), not the superpowers root-plugin pattern:

```json
{
  "name": "codex",
  "description": "Re-exported and pinned: openai/codex-plugin-cc - OpenAI's official Codex plugin (managed app-server broker, /codex:review, /codex:adversarial-review, background job control, /codex:setup auth story). OPTIONAL cross-model overlay: requires the Codex CLI and an OpenAI login; not a dependency of any VIBE plugin. Ships SessionStart/SessionEnd hooks and a Stop-hook review gate that is OFF by default; VIBE never enables it. Model policy: cross-checks run at the consumer's codex-configured model (VIBE requests high reasoning effort explicitly where the invocation path allows); see README for setup guidance.",
  "source": {
    "source": "git-subdir",
    "url": "openai/codex-plugin-cc",
    "path": "plugins/codex",
    "ref": "v1.0.6",
    "sha": "db52e28f4d9ded852ab3942cea316258ae4ef346"
  }
}
```

Facts verified 2026-07-17: `v1.0.6` is the latest tag and equals HEAD; the upstream marketplace declares `"source": "./plugins/codex"`; `tools/pins.ts` classifies tag-ref git-subdir pins as tag pins (`isBranchPin` checks ref format only), so this is tracked/bumpable like the others.

README: add `codex` to the re-exports paragraph (eighth entry), update the Status paragraph's re-export enumeration (it currently hard-codes "the seven `ref`+`sha` re-exports" with a list — bump or de-number it), and add a short subsection: what it adds, that it's optional and never auto-installed, the egress caveat (cross-checks send content to OpenAI), and setup guidance — point the consumer's codex config `model` at the strongest model their account allows and keep `model_reasoning_effort` at `high` or above; if a login rejects `codex-*` model aliases, use a general GPT model id and verify with a quick `/codex:setup` + task run. No specific model name is required anywhere; a dated example may appear here only, marked with its date.

### B. Conduct: cover exploration + contract writing

In `plugins/vibe/skills/conduct/SKILL.md`:

1. Add two rows to the routing table:

| Role | Agent | tiered | uniform |
|------|-------|--------|---------|
| Exploration | `Explore` (built-in) | sonnet | inherit |
| Contract writing | `vibe:contract-writer` | inherit | inherit |

2. **New agent** `plugins/vibe/agents/contract-writer.md` (`model: inherit`): writes/edits **test files only**, never implementation files — the exact inverse of the doer's scope. This resolves the standing contradiction: `doer.md` and the guardrails block categorically forbid doers from touching test files, so test-writing can never be a doer dispatch. `guardrails.md` gains a **contract-writer block** (tests only; no implementation files; the contract validates the spec, not an implementation; report an unsatisfiable contract rather than bending it), included verbatim in every contract-writing dispatch. The doer block and `doer.md` stay untouched — their invariant stays absolute.
3. Flow step 2 wording: "write them yourself or dispatch test-writing to `vibe:contract-writer` at the contract-writing tier and review the result against the spec."
4. Prose after the table: exploration dispatches (codebase search/summarize fan-outs) take the profile's model as the per-invocation override, exactly like doers; the orchestrator still verifies load-bearing claims itself.
5. Fallback sentence: overlay guardians and project-local agents are not in this table — they route by their own `model:` frontmatter (all VIBE-shipped guardians say `inherit`).
6. Flow step 6 (Verify): for a high-stakes change, the optional cross-model check from `/vibe:review` may be run on the final diff — never per-subtask.

### C. review-plan Step 3: assert-and-dispatch through the plugin

Rewrite `plugins/vibe/commands/review-plan.md` Step 3 ("Independent cross-check (optional)"):

- **Locate:** resolve the installed codex plugin from `~/.claude/plugins/installed_plugins.json` — the `codex@<marketplace>` entry's `installPath`, preferring (1) an entry whose scope covers the current project, then (2) the entry installed from **this marketplace** (`codex@ysainson` — the copy our sha pin actually governs), then any other. Fall back to the cache only if that file is unreadable: pick the newest version *within* each `~/.claude/plugins/cache/<marketplace>/codex/` directory (semver-aware; non-semver dir names count as oldest), never `sort -V` across full paths (the marketplace segment would dominate the version); if multiple marketplaces still tie, prefer this marketplace's, else report the ambiguity and skip. Echo the resolved path, version, and marketplace origin into the report so a wrong pick is visible. If nothing resolves: report the optional cross-check unavailable, point at installing the `codex` plugin from this marketplace, and skip.
- **Assert (pre-flight):** `node <companion> setup --json` must report the CLI installed and authenticated (it reports readiness/auth only — it has **no model field**). Derive the *model expectation* best-effort from codex config, reading only top-level scalar keys (the lines **before the first `[` table header**) of each file: project `.codex/config.toml` first — but it only applies when the project has a trusted `[projects."<dir>"]` entry in the user config — then `~/.codex/config.toml`. Keys per dispatch path: the `task` path reads `model` + `model_reasoning_effort`; the native-review path (section D) reads `review_model` first, falling back to `model` ("codex review default" if neither) — codex's native reviewer is governed by `review_model`, not `model`. If a `profile` key is active, do **not** attempt to resolve it (both the legacy `[profiles.*]` tables and the v2 `$CODEX_HOME/<name>.config.toml` layering are beyond a text read) — report the source as "base user config; profile active, not resolved". If no model resolves, proceed and report "codex CLI default" — do not block a healthy default setup. If the resolved name signals a speed tier (a name segment like `spark`, `mini`, or `nano` — a heuristic, not a guarantee), warn and ask before proceeding — a cross-check on a weak model is a false signal.
- **Consent:** the cross-check sends the spec and whatever repo content Codex reads to OpenAI. Ask once per run (one AskUserQuestion line, per `vibe:clarify`) before the first dispatch; an explicit user request for the cross-check counts as that consent.
- **Dispatch:** write the review brief to a file; run `node <companion> task --prompt-file <file> --effort xhigh` as a **Claude background task** (Bash `run_in_background`) — read-only (no `--write`), no `--model` flag (config owns the model; the effort request is explicit and this is the one path that accepts it).
- **Collect:** the background task's completion notification is the collection mechanism. Wait budget: up to 10 minutes after the lens agents have returned. On timeout, the report says "cross-check still running — verdict issued without it; collect later via /codex:status" and the verdict proceeds.
- **Report:** the synthesis (Step 4) names the resolved companion path/version, the config-derived model expectation *and its source* (project config / user config / CLI default), and the requested effort. Never phrase it as the model that actually ran.
- **Failure rule (all stages):** any failure at any stage — locate, assert, consent declined, dispatch, collect — is reported (stage + reason) and skipped; the cross-check never fails or blocks the review.

Delete the `codex exec -m … -c …` line. No dated model id remains anywhere in the command body.

Note for authors: the codex plugin's own commands (`/codex:review`, `/codex:adversarial-review`) carry `disable-model-invocation: true` — VIBE skills cannot fire them via the SlashCommand tool, which is why the integration drives the companion script via Bash. Users can still run the slash commands directly.

### D. /vibe:review: optional final-diff cross-check

Restructure `plugins/vibe/commands/review.md`: the cross-check launches **at the beginning of Step 2** (before dispatching the VIBE agents, so it runs concurrently), and a new numbered step before the verdict collects it.

- **Gate:** only when the change is high-stakes (auth, migrations, concurrency, crypto, payment/data-handling paths) or the user asks for it.
- **Egress guard, in order:** (1) explicit user consent via one AskUserQuestion line — the auto-trigger never sends a diff to OpenAI silently; (2) a quick secrets pre-scan of the diff (credential/token patterns) — on any hit, skip the cross-check and let `vibe:security-verifier` report; only then (3) dispatch.
- **Dispatch:** same locate/assert/report/failure contract as C, but via the companion's `review` subcommand: `review --scope working-tree` when the tree is dirty, `review --base <default-branch>` for a clean branch review (`--base` alone reviews the branch comparison and can miss dirty-tree changes). The `review` subcommand takes **no effort flag** — its effort is config-owned and reported from the config expectation. Companion-level `--background` is a no-op on the review path in v1.0.6, so backgrounding is Bash-level, same as C.
- **Collect:** new numbered step before the verdict; wait budget up to 10 minutes after the VIBE agents return; same timeout wording as C.
- If the plugin is absent, say so in the report and skip — mirroring the existing overlay-guardian rule.

`/vibe:quick-check` stays untouched — no cross-model call on the fast path.

### E. profile-policy: external cross-check models

In `plugins/vibe/skills/profile-policy/SKILL.md`:

1. Add a section: external cross-check models (Codex) have no alias layer, so they are **config-owned** — the consumer's codex config decides; dispatch steps assert and report the model expectation but never name a model. A concrete model name may appear only in setup-layer docs (README), dated.
2. Reword the existing negative example on the "Tiers are aliases" line from the literal dated id to a placeholder (`claude-<family>-<n>`), so the no-dated-id contract (Goal 2) is satisfiable over this file while the sentence keeps its meaning.

## Contracts (bun tests in `tools/`, one per task; regression guards labeled)

Failing-first applies to the **starred** assertions; guards marked (born green) are regression locks, not gates.

1. **`tools/conduct-skill.test.ts` (new — gates task B):**
   - ★ PROFILE table has an `Exploration` row (`sonnet` tiered / `inherit` uniform) and a `Contract writing` row routing `vibe:contract-writer` on `inherit`.
   - ★ `agents/contract-writer.md` exists, `model: inherit`, scope = test files only / never implementation.
   - ★ `guardrails.md` contains a contract-writer block.
   - The doer block still forbids test files (born green — regression guard).
   - ★ Body states the frontmatter fallback rule for guardians/project-local agents; step 6 references the optional cross-model check and forbids it per-subtask.
   - No dated model id (`/claude-[a-z]+-\d|gpt-\d/`) in `conduct/SKILL.md` (born green — regression guard).
2. **`tools/profile-policy.test.ts` (new — gates task E):**
   - ★ The external-cross-check section exists (config-owned wording, assert-and-report).
   - ★ No dated model id in `profile-policy/SKILL.md` (red today via the line-20 example; green after E.2).
3. **`tools/review-plan-command.test.ts` (extend — gates task C):**
   - ★ No `gpt-` and no `codex exec` in the body; locate via `installed_plugins.json`; assert-before-dispatch; dispatch via `codex-companion.mjs` with `--effort xhigh` and no `--model`; consent line; timeout wording; model-expectation (not actual-model) report wording; the all-stage failure rule sentence.
   - Existing assertions ("codex", "optional", lenses, verdicts) must stay green.
4. **`tools/review-command.test.ts` (new — gates task D):**
   - ★ Optional cross-check step: gated (high-stakes/user request), consent before egress, secrets pre-scan before dispatch, `--scope working-tree` vs `--base` rule, Bash-level background, numbered collection step with timeout wording, plugin-absent skip, all-stage failure rule, and the `review_model`-first expectation wording for the native-review path.
   - No dated model id in `review.md` (born green — regression guard).
   - `quick-check.md` contains no `codex` (born green — regression guard).
5. **`tools/marketplace-codex.test.ts` (new — gates task A):**
   - ★ Marketplace has a `codex` entry: `git-subdir` source, `url` `openai/codex-plugin-cc`, `path` `plugins/codex`, ref satisfying `isStableTag()` (import from `tools/pins.ts`), 40-hex sha. **No version literal** — `bun tools/pins.ts --yes` must be free to bump it.
   - ★ README mentions the codex re-export and "optional".
   - No `codex` in any `plugins/*/.claude-plugin/plugin.json` `dependencies` (correct manifest path, reusing `deps.test.ts`'s discovery; born green — regression guard).

Contract note (Goal 4): the companion's `setup --json` and task output expose no resolved-model field, so no test can assert the runtime model; the contracts pin the honest *wording* instead.

## Task shape (for conduct's plan step)

Five independently committable tasks, each gated by its own contract file: A (marketplace + README), B (conduct skill + contract-writer agent + guardrails), C (review-plan), D (review), E (profile-policy). No contract spans two tasks. Suggested order: E → B → A → C → D (C and D reference the entry A creates in prose only, so any order works; this one keeps red windows shortest).

## Verification

- `bun test` / `bun run typecheck` green; starred assertions red before their task, green after.
- `claude plugin validate . --strict` passes with the new marketplace entry.
- `bun tools/pins.ts --dry-run` lists the codex pin without an unreachable/no-stable-tags failure (requires `gh` auth + network for **all** pins — it fails closed on any unreachable upstream, unrelated to this change; "behind" on a future v1.0.7 is fine, exit 0).
- Live smoke: **already done 2026-07-17** — `codex-companion.mjs task --prompt-file <brief> --effort xhigh` (no `--model`) driven from a skill-context Bash background task returned a full structured review (exit 0) against the consumer config (`gpt-5.6-sol`/`high`). This is the feasibility evidence for C; D's `review --scope` path is exercised at first real use (its failure rule makes that safe).
- Ship: after merge, cut a `vibe` release (`bun release plugins/vibe`) — repo policy requires a version bump for plugin changes; the release tool owns the bump, so it is process, not a contract here.

## Risks

- **Locate drift:** `installed_plugins.json` is undocumented internal state; layout changes break the primary path. Mitigations: per-marketplace glob fallback, resolved path/version echoed in every report, all-stage soft-fail.
- **Config-expectation mismatch (Goal 4):** codex resolves model through layers a TOML read can't fully replicate (env, CLI defaults, future keys); the report therefore labels the value as an expectation with its source, never as the runtime model.
- **Data egress:** cross-checks send repo content to OpenAI — mitigated by per-run consent, the secrets pre-scan in D, and the high-stakes auto-trigger never firing silently.
- **Upstream drift:** hooks or defaults could change in a future plugin version — the sha pin mitigates this **only for installs made from this marketplace**; a consumer whose codex came from OpenAI's own marketplace tracks upstream directly (the locate step's this-marketplace preference and origin echo make which copy ran visible). `pins.ts` does not detect a same-tag sha move (moved-tag detection is a possible future pins.ts improvement, out of scope).
- **Account variance:** consumers' codex entitlements differ; assert-and-report surfaces (rather than hides) a weak-model cross-check.
