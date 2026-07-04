# vibe-expo re-export install matrix — spike evidence

**Date:** 2026-07-04 · **claude:** 2.1.201 · **Task:** spec task 1 (`docs/specs/2026-07-04-vibe-expo-overlay.md` §4/build-plan step 1)

## Protocol used

Every `claude plugin` invocation ran with `CLAUDE_CONFIG_DIR` set to a fresh `mktemp -d`
(never the real user config). Trial entries lived in a scratch marketplace directory
(`.claude-plugin/marketplace.json`, name `spike`, an `owner` object, only the entry under
test — no local `./plugins` paths). Each shape got its own fresh `CLAUDE_CONFIG_DIR` so
results never bled between attempts (no reuse/uninstall needed). For every attempt:

```
claude plugin marketplace add <scratch-dir>
claude plugin install <entry-name>@spike
claude plugin details <entry-name>@spike
```

**Decisive oracle (all three required for PASS)** — `claude plugin validate --strict` is
**not** part of it; it schema-checks only (confirmed separately: it does not resolve
`dependencies`, remote sources, or paths):

1. install exit 0
2. `claude plugin details <name>@spike` lists exactly the expected skills (targeted skill(s)
   present; for callstack/vercel, unrelated repo skills absent)
3. cache spot-check: one installed file's `git hash-object` (blob sha) matches
   `gh api repos/<owner>/<repo>/contents/<path>?ref=<pinned-sha> --jq .sha` for the same path
   — i.e. byte-identical content at the pinned commit

Pins (branch-head shas at probe time, `main` on all four — zero tags/releases confirmed
2026-07-04, re-confirmed unchanged today):

| repo | sha |
|---|---|
| expo/skills | `e7e81d2964ec8907bc3c2988e3408dc643028f96` |
| callstackincubator/agent-skills | `553dccbe87ba678b14e33aedd4dc274f5b92c85a` |
| software-mansion-labs/skills | `17642737c22758c808004a3d0e64092cf04ae722` |
| vercel-labs/agent-skills | `f8a72b9603728bb92a217a879b7e62e43ad76c81` |

---

## 1. expo/skills — PASS

**Shape tried (one, per spec — the plugin.json case, re-confirmed at today's head):**
`git-subdir` entry named `expo`, `path: plugins/expo`.

```json
{
  "name": "expo",
  "description": "Re-exported and pinned: expo/skills - Official Expo skills for building, deploying, upgrading, and debugging Expo apps. Ships a .mcp.json pointing at the hosted https://mcp.expo.dev/mcp MCP server, which auto-loads for consumers.",
  "source": {
    "source": "git-subdir",
    "url": "expo/skills",
    "path": "plugins/expo",
    "ref": "main",
    "sha": "e7e81d2964ec8907bc3c2988e3408dc643028f96"
  }
}
```

- **Install:** `claude plugin install expo@spike` → `✔ Successfully installed plugin:
  expo@spike (scope: user)`, exit 0.
- **`claude plugin details expo@spike`:**
  ```
  expo 1.5.1
    Official Expo skills for building, deploying, upgrading, and debugging Expo apps
  Component inventory
    Skills (18)  add-app-clip, building-native-ui, eas-simulator, eas-update-insights,
    expo-api-routes, expo-brownfield, expo-cicd-workflows, expo-deployment, expo-dev-client,
    expo-examples, expo-module, expo-observe, expo-tailwind-setup, expo-ui,
    native-data-fetching, upgrading-expo, use-dom, web-to-native
    Agents (0)  Hooks (0)  MCP servers (1)  expo  LSP servers (0)
  ```
  18/18 skills present, matching the plugin's full skill set. **MCP server confirmed:**
  1 MCP server registered (`expo`); cache `.mcp.json` = `{"mcpServers":{"expo":{"type":"http","url":"https://mcp.expo.dev/mcp"}}}` — the
  hosted `https://mcp.expo.dev/mcp` server auto-loads for any consumer of this plugin, as the
  spec already acknowledges.
- **Cache spot-check:** `skills/expo-ui/SKILL.md` — local `git hash-object` =
  `174ecca8065d46df5228e74a1d2f85cd8bf5e716bcc3105a81f8df47d081f396`... (full sha256, informational);
  the load-bearing check is the git blob sha: local `fd59c8cf472b92e62a561e0e6b91d3ffb901ea11` ==
  upstream `gh api repos/expo/skills/contents/plugins/expo/skills/expo-ui/SKILL.md?ref=<pinned-sha> --jq .sha`
  = `fd59c8cf472b92e62a561e0e6b91d3ffb901ea11`. **Match.**

**Verdict: PASS.** Entry above is final.

---

## 2. callstackincubator/agent-skills — PASS (via git-subdir; the `skills`-array shape fails)

Repo enumeration (`gh api repos/callstackincubator/agent-skills/contents/skills`): 8 skill
dirs exist at `skills/*` — `create-react-native-library`, `github`, `github-actions`,
`react-native-best-practices`, `react-native-brownfield-migration`,
`react-native-tv-best-practices`, `react-navigation`, `upgrading-react-native`. Their own
marketplace.json exposes only 5 of these as separate inline plugins (source `./` + a
`skills` array with one path each) — confirms the spec's fact.

**Attempt (a) — FAIL.** Pinned `github` source + top-level `skills` array on our entry,
copying their path:
```json
{
  "name": "callstack-react-native",
  "source": {
    "source": "github",
    "repo": "callstackincubator/agent-skills",
    "ref": "main",
    "sha": "553dccbe87ba678b14e33aedd4dc274f5b92c85a"
  },
  "skills": ["./skills/react-native-best-practices"]
}
```
- Install exit 0, but `claude plugin details` showed **Skills (8)**: `create-react-native-library,
  github, github-actions, react-native-best-practices, react-native-brownfield-migration,
  react-native-tv-best-practices, react-navigation, upgrading-react-native` — every skill dir in
  the repo, not just the one named in `skills`. **The `skills` array is silently ignored for a
  plain `github` source; oracle part 2 fails (unrelated skills present).**

**Attempt (b) — PASS.** `git-subdir` pointed directly at the one skill's own directory:
```json
{
  "name": "callstack-react-native",
  "description": "Re-exported and pinned: callstackincubator/agent-skills - react-native-best-practices (performance: FPS/TTI/bundle/memory).",
  "source": {
    "source": "git-subdir",
    "url": "callstackincubator/agent-skills",
    "path": "skills/react-native-best-practices",
    "ref": "main",
    "sha": "553dccbe87ba678b14e33aedd4dc274f5b92c85a"
  }
}
```
- **Install:** exit 0.
- **`claude plugin details callstack-react-native@spike`:** `Skills (1)
  react-native-best-practices` — exactly the target, nothing else. Agents (0), Hooks (0), MCP
  servers (0).
- **Cache spot-check:** `SKILL.md` at plugin root — local git blob sha
  `37732c21a9884488822f261ab93b3347c8643cbd` == upstream
  `gh api repos/callstackincubator/agent-skills/contents/skills/react-native-best-practices/SKILL.md?ref=<pinned-sha> --jq .sha`
  = `37732c21a9884488822f261ab93b3347c8643cbd`. **Match.**

**Verdict: PASS** with the git-subdir shape (attempt b). The `github`-source-plus-`skills`-array
shape (attempt a) does not scope the install and must not be used.

---

## 3. software-mansion-labs/skills — PASS (auto-discovery; `skills` array proven inert)

Repo enumeration (`gh api repos/software-mansion-labs/skills/contents/skills`): 7 top-level
dirs — `detour`, `expo-horizon`, `fishjam`, `radon-mcp`, `react-native-best-practices`,
`rnrepo`, `typegpu`. Their own marketplace.json has a single inline plugin `skills` with
`source: {"source":"github","repo":"software-mansion-labs/skills"}` and **no** `skills`
enumeration — confirms the spec's fact.

**Attempt (a) — auto-discovery test.** Pinned `github` source, no `skills` array:
```json
{
  "name": "swmansion-react-native",
  "source": {
    "source": "github",
    "repo": "software-mansion-labs/skills",
    "ref": "main",
    "sha": "17642737c22758c808004a3d0e64092cf04ae722"
  }
}
```
- Install exit 0. `claude plugin details`: **Skills (6)** `expo-horizon, fishjam, radon-mcp,
  react-native-best-practices, rnrepo, typegpu`. **`detour` is excluded** — it has no
  `SKILL.md` at `skills/detour/` directly; its two real skills live one level deeper
  (`skills/detour/detour-onboarding/SKILL.md`, `skills/detour/migrate-to-detour/SKILL.md`,
  confirmed via `gh api .../contents/skills/detour` and `.../skills/detour/detour-onboarding`).
  **Finding: auto-discovery walks exactly one level under `skills/` and registers any
  immediate subdirectory containing a `SKILL.md`; it does not recurse into nested category
  folders.**

**Attempt (b) — explicit `skills` array.** Same source, plus
`"skills": ["./skills/react-native-best-practices"]`.
- Install exit 0. `claude plugin details`: **identical Skills (6) list** — `expo-horizon,
  fishjam, radon-mcp, react-native-best-practices, rnrepo, typegpu`. The explicit array had
  **zero effect**: same as the callstack attempt (a) finding, a plain `github` source ignores
  any `skills` field on our entry and always installs the full auto-discovered set.

- **Cache spot-check (either attempt, same content):** `skills/react-native-best-practices/SKILL.md`
  — local git blob sha `10af6f54f440fba4f21788abb529590cc2ba99b1` == upstream
  `gh api repos/software-mansion-labs/skills/contents/skills/react-native-best-practices/SKILL.md?ref=<pinned-sha> --jq .sha`
  = `10af6f54f440fba4f21788abb529590cc2ba99b1`. **Match.** (The cache directory itself mirrors
  the whole repo, including `skills/detour/` on disk — only the auto-discovery step decides
  what `claude plugin details` advertises as an invocable skill.)

**Open question answered: skills auto-discover from the repo — no explicit `skills` paths
are needed, and supplying them has no effect for a plain `github` source** (only `git-subdir`
respects a narrower `path`).

**Winning entry** (skills array omitted — proven to do nothing, so the simplest working
shape leaves it out):
```json
{
  "name": "swmansion-react-native",
  "description": "Re-exported and pinned: software-mansion-labs/skills - React Native / New-Architecture patterns (Reanimated/worklets/Fabric, on-device AI, Radon IDE, Fishjam).",
  "source": {
    "source": "github",
    "repo": "software-mansion-labs/skills",
    "ref": "main",
    "sha": "17642737c22758c808004a3d0e64092cf04ae722"
  }
}
```
Installs 6 skills: `expo-horizon, fishjam, radon-mcp, react-native-best-practices, rnrepo,
typegpu` (the `detour` category's two nested skills are not reachable this way; out of scope
for this spike — flagged as a follow-up below).

**Verdict: PASS** (auto-discovery). Note the 6-skill set is broader than only
`react-native-best-practices` — task 3 should decide if that breadth is acceptable for
"its RN/New-Architecture skills" (it matches the repo's own stated scope: animations,
gestures, SVG, on-device AI, audio, multithreading, rich text, Radon IDE, Fishjam — all
RN/Expo-adjacent) or whether a narrower git-subdir-per-skill re-export is wanted instead.

---

## 4. vercel-labs/agent-skills — PASS (via git-subdir; the `skills`-array shape fails)

Not a Claude marketplace — no `.claude-plugin/` anywhere (confirmed: repo root has
`AGENTS.md`, `CLAUDE.md`, `README.md`, `packages`, `skills`, `skills.sh.json`, no
`.claude-plugin`). `skills.sh.json` groups skill ids `vercel-react-best-practices`,
`vercel-composition-patterns`, `vercel-react-view-transitions`, `vercel-react-native-skills`
under "React" — confirming the spec's warning that `vercel-react-best-practices` (dir
`skills/react-best-practices`) is the sibling Next.js/web skill, distinct from
`vercel-react-native-skills` (dir `skills/react-native-skills`, whose `SKILL.md` frontmatter
`name:` field is literally `vercel-react-native-skills`, though the directory itself is
named `react-native-skills` without the `vercel-` prefix).

**Attempt (a) — FAIL.** Pinned `github` source + `skills` array with one path:
```json
{
  "name": "vercel-react-native",
  "source": {
    "source": "github",
    "repo": "vercel-labs/agent-skills",
    "ref": "main",
    "sha": "f8a72b9603728bb92a217a879b7e62e43ad76c81"
  },
  "skills": ["./skills/react-native-skills"]
}
```
- Install exit 0, but `claude plugin details` showed **Skills (9)**: `composition-patterns,
  deploy-to-vercel, react-best-practices, react-native-skills, react-view-transitions,
  vercel-cli-with-tokens, vercel-optimize, web-design-guidelines, writing-guidelines` — every
  skill dir in the repo, **including the unwanted `react-best-practices`** (the Next.js/web
  skill the spec explicitly says to avoid). Same inert-`skills`-array behavior as callstack
  (a) and swmansion (b). **Oracle part 2 fails.**

**Attempt (b) — PASS.** `git-subdir` pointed directly at `skills/react-native-skills`:
```json
{
  "name": "vercel-react-native",
  "description": "Re-exported and pinned: vercel-labs/agent-skills - vercel-react-native-skills (React Native / Expo best practices; not vercel-react-best-practices, which is Next.js/web).",
  "source": {
    "source": "git-subdir",
    "url": "vercel-labs/agent-skills",
    "path": "skills/react-native-skills",
    "ref": "main",
    "sha": "f8a72b9603728bb92a217a879b7e62e43ad76c81"
  }
}
```
- **Install:** exit 0.
- **`claude plugin details vercel-react-native@spike`:** `Skills (1) vercel-react-native-skills`
  — exactly the target (registered under the SKILL.md frontmatter `name`, not the directory
  name), and the sibling `react-best-practices` is **absent**.
- **Cache spot-check:** `SKILL.md` at plugin root — local git blob sha
  `73401865dd7440a43c5243b107a3763e0d2f4aae` == upstream
  `gh api repos/vercel-labs/agent-skills/contents/skills/react-native-skills/SKILL.md?ref=<pinned-sha> --jq .sha`
  = `73401865dd7440a43c5243b107a3763e0d2f4aae`. **Match.**

**Verdict: PASS** with the git-subdir shape (attempt b). The `github`-source-plus-`skills`-array
shape (attempt a) installs the unwanted sibling skill and must not be used.

---

## Open-question answers (decide tasks 3+)

- **Entry-naming freedom:** **confirmed yes.** All three inline re-exports were installed
  under entry names we invented — `callstack-react-native` (upstream's own plugin name for
  this skill is `react-native-best-practices`; upstream's repo/marketplace name is
  `agent-skills`/`callstack-agent-skills`), `swmansion-react-native` (upstream's own plugin
  name is the generic `skills`), `vercel-react-native` (vercel-labs has no marketplace or
  plugin name at all — pure invention). All three resolved and installed cleanly as
  `<our-name>@spike`, so this marketplace is free to pick non-generic entry names for the
  inline cases, exactly as the spec assumes.
- **swmansion auto-discovery:** **confirmed yes, skills auto-discover** — no explicit
  `skills` array is needed for a plain `github` source; the array is silently ignored when
  supplied (verified twice: identical 6-skill result with and without it). Auto-discovery is
  shallow (one level under `skills/`), so `software-mansion-labs/skills`' `detour` category
  (whose two real skills sit a level deeper) is not reachable through this shape.

## General finding beyond the four assigned repos

For a plain `github` source, a top-level `skills` array on the marketplace entry has **no
effect** — confirmed independently in the callstack, swmansion, and vercel trials. The only
shape that reliably narrows a remote repo down to a specific skill (or plugin) is
`git-subdir` with `path` pointed directly at that skill's own directory (or, for a
proper plugin, its plugin-root directory containing `.claude-plugin/plugin.json`, as with
`expo`). This generalizes and hardens the spec's existing "known trap" note about `github` +
bolted-on `path` (root-with-zero-skills) — the array-based shape fails differently
(root-with-*all*-skills) but for the same underlying reason: a plain `github` source always
installs (and auto-discovers skills from) the whole repo; only `git-subdir`'s `path` actually
scopes what gets installed.

## Follow-ups / concerns for later tasks

- `software-mansion-labs/skills`'s `detour` category (two nested skills,
  `detour-onboarding`/`migrate-to-detour`) is not reachable by the winning
  `swmansion-react-native` entry above (plain `github` source only sees one level under
  `skills/`). Not needed for "RN/New-Architecture" per the spec's want, so left out of scope
  here — flag if a future task wants those two skills specifically (they'd need their own
  `git-subdir` entries).
- The winning `swmansion-react-native` entry installs 6 skills, some arguably broader than
  strict "New Architecture" (e.g. `typegpu`, `fishjam`). Task 3 should confirm this breadth
  is intended before pinning verbatim.
