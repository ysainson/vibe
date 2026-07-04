---
description: Scaffold and wire a new project from its brief - detect the stack, scaffold the skeleton + tooling baseline + CLAUDE.md, and write .claude/settings.json enabling the VIBE core and the matching stack overlay. Run in the new project dir.
argument-hint: [path-to-brief.md]
disable-model-invocation: true
---

# Setup — brief to wired skeleton

You scaffold a new project from its brief and wire it to the VIBE marketplace. You produce a running, buildable skeleton and the plugin wiring — you do **not** build features. Building is `/vibe:conduct`'s job.

The brief is `$ARGUMENTS` (a path to a brief markdown file). If empty, look for `THEBRIEF.md` or a single obvious `*.md` brief in the current directory; if none is obvious, ask via `vibe:clarify`.

## What to produce

1. **Read the brief.** Pull out the stack, the distribution intent, the structure, and the conventions it states. The brief is the source of truth — don't re-decide what it already decided.

2. **Ask only the gaps** — via `vibe:clarify` (the AskUserQuestion tool), batched, with a recommended default each. Ask only what the brief leaves open and what changes the scaffold:
   - **Distribution / visibility** — how it ships, and whether the repo is public or private (drives license, CI, and release wiring).
   - **Confirm latest versions** — the current-stable versions you resolved for the stack (see the rule below): show them and confirm before scaffolding.
   Skip any the brief already answers.

3. **Detect the stack and pick the overlay.** Map the brief's stack to a VIBE overlay (e.g. Swift / macOS → `vibe-swift`, Expo / React Native → `vibe-expo`). The core `vibe` is always enabled; add the overlay when one matches. If none fits, enable `vibe` alone and say so.

4. **Scaffold the skeleton — not the features.** Create the minimal project structure for the stack, a tooling baseline (the lint / format / test config that stack expects), `docs/specs/` and `docs/plans/` (the durable trail `/vibe:conduct` writes into), and the project's `CLAUDE.md` (its conventions, the build / test / run commands, and the resolve-latest-versions rule). Keep it buildable and green at the baseline.

5. **Wire the marketplace.** Write `.claude/settings.json` registering the VIBE marketplace and enabling the chosen plugins. Canonical shape:
   ```json
   {
     "extraKnownMarketplaces": {
       "ysainson": { "source": { "source": "github", "repo": "ysainson/vibe" } }
     },
     "enabledPlugins": {
       "vibe@ysainson": true,
       "vibe-swift@ysainson": true
     }
   }
   ```
   Key each marketplace by its name; key each plugin as `<plugin>@<marketplace>`. Include only the overlays you actually selected — enabling a plugin cascades to its pinned dependencies.

6. **Hand off.** Tell the user to accept the workspace-trust dialog (or run `/reload-plugins`) so the overlay and its skills load, then to run `/vibe:conduct` to build test-first.

## Rules

- **Resolve latest stable versions at scaffold time.** Look up the current stable version of every tool, SDK, and dependency you write into the scaffold — never embed a constant from this command or a reference project; those rot. A brief's version numbers are a snapshot to re-verify, not a pin.
- **Scaffold, don't build.** The deliverable is a wired, buildable skeleton; features come later through `/vibe:conduct`.
- **Start at `1.0.0`.** Initialize new manifests and project versions at `1.0.0` unless the brief says otherwise — not `0.1.0`.
- Confirm the result against evidence: the skeleton builds or validates at its baseline, `CLAUDE.md` exists, and `.claude/settings.json` matches the canonical shape above with exactly the selected plugins enabled.
