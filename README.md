# VIBE

> It looks like vibe coding. It's the opposite.

A personal Claude Code plugin marketplace that turns "vibe coding" into a disciplined, model-adaptive pipeline: idea → brief → scaffold → test-first build, where **every diff is reviewed** and an **independent fresh-context verifier signs off** before anything is called done. Same casual, one-command surface as vibe coding — TDD-first, mandatory review, and a separate verifier underneath.

The bet is on process, not a bigger model: tight contracts, staged review, and model-tiering are what make it good, and a `routing.json` config file — not a code edit — is what points every role at whichever model and runtime you want, today or later.

## Install

The core:

```
/plugin marketplace add ysainson/vibe
/plugin install vibe@ysainson
```

Installing `vibe` pulls in `superpowers` automatically (the dependency cascade — see Requirements). Add the overlay for your stack the same way; each pulls its own pinned third-party skills:

```
/plugin install vibe-swift@ysainson   # Swift / macOS
/plugin install vibe-expo@ysainson    # Expo / React Native, phones (also auto-loads Expo's hosted MCP server)
```

Optional — Emil Kowalski's web-focused design-engineering skills, per project where you do web/UI design work (see the `emil-design-eng` section below):

```
/plugin install emil-design-eng@ysainson
```

Optional — the cross-model check `/vibe:review-plan` and `/vibe:review` can drive (see the `codex` section below for what it sends to OpenAI before installing):

```
/plugin install codex@ysainson
/codex:setup
```

`/codex:setup` checks for the Codex CLI, offers to install it, and walks through `codex login`. Without this plugin the cross-check steps simply report themselves unavailable and skip — nothing else changes.

Local development of the plugins themselves:

```
/plugin marketplace add /absolute/path/to/vibe
```

## Plugins

### `vibe` — the core (stack-agnostic)

The orchestration engine. Pure process — no framework knowledge.

| Component | What it is |
|---|---|
| `/vibe:setup` | Brief-driven scaffolder: reads a project brief, asks only the gaps via `vibe:clarify`, detects the stack, scaffolds the skeleton + tooling baseline + `CLAUDE.md` (not features), and writes `.claude/settings.json` enabling the VIBE core and the matching stack overlay. User-only (`disable-model-invocation: true`). |
| `/vibe:brainstorm` | Turn an idea into a written spec in `docs/specs/` — wraps superpowers' `brainstorming` and applies VIBE's heuristics (two-phase build for visual-hero apps; numbered, test-first, commit-per-task plans). User-only. |
| `/vibe:review-plan` | Adversarial review of a spec/plan **before code** — parallel skeptic lenses verify its claims against the real codebase (plus an optional Codex cross-model check), synthesized into one Critical/Major/Minor report with a `ready` / `ready-with-fixes` / `needs-rework` gate, iterating resolution-aware re-reviews until `ready`. The gate between `/vibe:brainstorm` and `/vibe:conduct`. User-only. |
| `/vibe:conduct` | Orchestrated coding flow: the session model plans, writes a failing test contract, lays out a numbered commit-per-task plan, delegates implementation to model-tiered doer subagents, reviews **every** diff in two passes, and gates completion through an independent fresh-context verifier. A thin command wrapper over the `conduct` skill — commands display namespaced (`/vibe:*`) in autocomplete while the backing skill carries `user-invocable: false` to stay model-invocable without a duplicate menu entry. |
| `/vibe:review` | Comprehensive review of changed files — `reviewer-quality` + `security-verifier`, the enabled overlay's guardians (by file type), and any project-local `.claude/agents/`, plus a CLAUDE.md convention check. |
| `/vibe:commit` | Conventional commit message from the diff → clipboard. User-only. |
| `/vibe:fix` | Auto-fix only safe, mechanical issues (formatters/linters + project-local fixers); never security or behavior. User-only. |
| `/vibe:quick-check` | Fast pre-commit sanity check on changed files — secrets scan + the overlay's quick guardians + project-local lightweight checks. |
| `vibe:doer` | Implementation subagent (Sonnet under the `tiered` preset). |
| `vibe:doer-mechanical` | Mechanical-edit subagent (Haiku under the `tiered` preset) — renames, codemods, boilerplate. |
| `vibe:reviewer-spec` | Review pass 1: spec compliance — does the diff meet the contract, nothing gamed? |
| `vibe:reviewer-quality` | Review pass 2: craft — simplicity, idioms, conventions, no scope creep. Kept separate from pass 1 because a blended review is easier to game. |
| `vibe:verifier` | Fresh-context final gate — adversarial spec check on the diff with no implementation history. |
| `vibe:security-verifier` | Security lens: secrets, injection, authz, data handling, dependencies. |
| `vibe:clarify` | Hidden behavior skill: clarifying questions go through the AskUserQuestion tool (concrete options, recommended default, self-contained); defines when to ask vs state an assumption and proceed. |
| `vibe:profile-policy` | Hidden knowledge skill: how model routing works — the `routing.json` file, its presets and adapters, and requested vs effective model resolution. |
| `vibe:fable-safe-authoring` | Hidden knowledge skill: authoring constraints so every skill/command/agent runs well on frontier models and never silently falls back. |

### `vibe-swift` — Swift / macOS overlay

The first stack overlay. Enable it (via `/vibe:setup` or `.claude/settings.json`) when scaffolding or building a Swift / macOS project.

| Component | What it is |
|---|---|
| `vibe-swift:swift-concurrency` | Reviews concurrency under Swift 6 mode + Approachable Concurrency — actor isolation, `Sendable`, safe async boundaries. |
| `vibe-swift:swift-testability` | Reviews the single-source-of-truth + injected-protocol pattern that makes logic unit-testable without real system APIs. |
| `vibe-swift:swift-signing` | Pre-flights Developer ID signing, notarization, and Sparkle auto-update before a release. |
| `vibe-swift:swift-scaffold` | Hidden knowledge skill: the canonical macOS project shape (single-target SwiftUI, `@Observable` source of truth, Swift Testing, Developer ID + Sparkle release pipeline), with testability and distribution references. |

Depends on the re-exported `swiftui-expert` and `swift-testing-expert` skills.

### `vibe-expo` — Expo / React Native overlay

Enable it (via `/vibe:setup` or `.claude/settings.json`) when scaffolding or building an Expo / React Native phone app.

| Component | What it is |
|---|---|
| `vibe-expo:expo-ui-performance` | Reviews re-render discipline under React Compiler, reanimated/worklets thread correctness, list virtualization, and animation jank sources. |
| `vibe-expo:expo-testability` | Reviews logic in testable hooks/pure functions, system effects behind injectable seams, and untestable module-scope side effects. |
| `vibe-expo:expo-release` | Pre-flights app.config.ts / eas.json / config-plugin coherence, prebuild (CNG) safety, and store submission requirements before a release. |
| `vibe-expo:expo-a11y` | Reviews labels/roles on touchables, dynamic type, contrast against `ds/` tokens, focus order, and reduced-motion handling. |
| `vibe-expo:expo-scaffold` | Hidden knowledge skill: the canonical phone-only Expo app shape (create-expo-app → reset-project → reshape to `src/app` + `@/*` alias + typed `app.config.ts`, dev client never Expo Go, dayjs/TanStack Query/t3-env baseline, `ds/` tokens, jest-expo, argent-verified). |

Depends on the re-exported `expo`, `callstack-react-native`, `swmansion-react-native`, `vercel-react-native`, and `emil-animate-expo` skills.

**Third-party, re-exported and pinned by `ref` + `sha`:** `superpowers` (the phase engine `vibe` wraps), `swiftui-expert`, `swift-testing-expert`, `expo`, `callstack-react-native`, `swmansion-react-native`, `vercel-react-native`, `emil-animate-expo`, `emil-design-eng` (optional; see below), and `codex` (the optional cross-model overlay; see below). The five vibe-expo re-exports and `emil-design-eng` are tagless upstreams with no stable tag to pin, so they're pinned to `main` branch-head shas instead — `bun tools/pins.ts` reports branch-head drift informationally, not as a failure. The `expo` plugin also auto-loads Expo's hosted MCP server (`https://mcp.expo.dev/mcp`). One review/update point — bump the pins in this marketplace.

### `emil-design-eng` — optional design-engineering collection

Re-exports [emilkowalski/skills](https://github.com/emilkowalski/skills) whole — Emil Kowalski's design-engineering skills (animation craft, animation review/improvement audits, Apple-design-for-web, UI library picks, prototyping, Sonner). The collection is web-focused, so it is optional and never auto-installed — no VIBE plugin depends on it; enable it per project where you do web/UI design work (`/plugin install emil-design-eng@ysainson`). The one Expo-native skill in the collection, `animate-expo`, is re-exported separately as `emil-animate-expo` and wired into `vibe-expo` as a dependency, so Expo projects get it automatically without the ten web-focused skills.

### `codex` — optional cross-model overlay

Re-exports OpenAI's official Codex plugin, pinned by `ref` + `sha` like the others. It adds `/codex:review`, `/codex:adversarial-review`, and the `codex-companion.mjs` runtime that VIBE's `/vibe:review-plan` and `/vibe:review` cross-checks drive in the background for a second, differently-trained opinion. It is entirely optional and never auto-installed — no VIBE plugin depends on it, and its Stop-hook review gate ships off — VIBE never turns it on. Egress caveat: when a cross-check runs, it sends spec/diff content to OpenAI — VIBE asks for consent once per run before the first dispatch. Setup: point your codex config's `model` at the strongest model your account allows and keep `model_reasoning_effort` at `high` or above; if your login rejects `codex-*` model aliases, use a general GPT model id instead and verify with `/codex:setup` plus a quick task run (as of 2026-07, `gpt-5.6-sol` is a known-working example).

## The build pipeline

`vibe:conduct` wraps [superpowers](https://github.com/obra/superpowers) as the phase engine and layers on three distinctives it doesn't provide: model-tiering by task, review of every diff, and an independent fresh-context verifier as a separate final pass.

```
brainstorm → spec → review-plan (adversarial gate) → test-contract → plan (numbered, commit-per-task) → tiered doers → review×2 → fresh-context verify → finish
```

`docs/specs/` and `docs/plans/` are the durable trail.

## Model routing

Routing lives in a config file, `routing.json` — user scope at `~/.agents/vibe/routing.json`, project scope at `.agents/vibe/routing.json` (project overrides user, per role). Three shipped presets: `uniform` (every role on the session model, except the `contract-writer` pin and the three cross-check roles), `tiered` (doer, review, and verification roles cost-routed on the `claude` runtime — Sonnet/Haiku for doers, Opus for escalation and review — while the three cross-check roles still go to the other runtime's companion), and `split` (doer roles move to the other installed runtime, review and escalation stay on `claude`/`opus`). No role is ever tied to a model name in prose, so changing models or runtimes is an edit to `routing.json`, not a rewrite. `/vibe:init` writes and verifies the file (detects installed runtimes, picks a default preset, walks egress consent). A SessionStart hook injects the resolved routing as a `<VIBE_ROUTING>` block into every session, which `vibe:conduct`, `/vibe:review`, `/vibe:review-plan`, and `/vibe:quick-check` read. Full policy — presets, adapters, requested vs effective resolution — lives in `vibe:profile-policy`.

Both runtimes read the same project context, not just the same routing: `AGENTS.md` at the repo root is canonical, and `CLAUDE.md` imports it (`@AGENTS.md` plus a `## Claude Code only` section) rather than duplicating it. `.agents/skills` is the canonical skills directory, with per-skill symlinks from `.claude/skills` and `.codex/skills`. `/vibe:init` at project scope runs the migration with a preview, a confirmation, and a backup.

## Conventions

- Skills are goals, contracts, and constraints — not step-by-step recipes. Frontier models degrade under over-prescription; the `description` frontmatter is the trigger, written as "what + when".
- Agents: `description` tells the orchestrator when to delegate; `model:` uses aliases (`sonnet`, `haiku`, `opus`, `fable`, `inherit`), never dated model ids.
- Never instruct an agent to echo or explain its internal reasoning — ask for evidence (output, diffs). See `vibe:fable-safe-authoring`.
- Bump `version` in a plugin's `plugin.json` when changing it.

## Requirements

Claude Code **2.1.143+** — for the plugin dependency cascade: enabling a plugin auto-enables its declared `dependencies`, so installing `vibe` pulls in `superpowers`, and `vibe-swift` pulls in `swiftui-expert` + `swift-testing-expert`.

## Development

The marketplace is Markdown + JSON; the `tools/` sidecar is Bun + TypeScript (Bun always — never npm/yarn/pnpm). Run `bun install`, then `bun test` and `bun run typecheck`. Validate manifests with `claude plugin validate . --strict` (and per-plugin, e.g. `claude plugin validate ./plugins/vibe --strict`). Cut a release with `bun release plugins/vibe` — or just `bun release` to pick the plugin interactively (`--dry-run` to preview, `--yes` for CI). Check or bump the pinned third-party re-exports with `bun tools/pins.ts` (interactive; `--dry-run` to only report drift). Both use clack prompts.

## Status

Built and validated — the full v1 surface: the marketplace; the `vibe` core (`conduct` engine + the doer/reviewer/verifier agents + the `clarify`/`profile-policy`/`fable-safe-authoring` skills); the command suite `/vibe:setup` · `/vibe:brainstorm` · `/vibe:review-plan` · `/vibe:conduct` · `/vibe:review` · `/vibe:commit` · `/vibe:fix` · `/vibe:quick-check`; the `vibe-swift` overlay (Swift concurrency/testability/signing guardians + the `swift-scaffold` knowledge); the `vibe-expo` overlay (Expo UI-performance/testability/release/a11y guardians + the `expo-scaffold` knowledge); the ten `ref`+`sha` re-exports (`superpowers`, `swiftui-expert`, `swift-testing-expert`, `expo`, `callstack-react-native`, `swmansion-react-native`, `vercel-react-native`, `emil-animate-expo`, `emil-design-eng`, `codex`); and the Bun/TypeScript sidecar (settings/version/notes pure functions under test, plus `release.ts` and `pins.ts`).
