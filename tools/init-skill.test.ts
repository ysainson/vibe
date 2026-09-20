import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for /vibe:init — the user-only setup skill that drives init.mjs and,
// at project scope, share.mjs, with a default on every question
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section B and contract 5).
const root = join(import.meta.dir, "..");
const skillDir = join(root, "plugins", "vibe", "skills", "init");

const skill = () => readFileSync(join(skillDir, "SKILL.md"), "utf8");
const openaiYaml = () => readFileSync(join(skillDir, "agents", "openai.yaml"), "utf8");
const setup = () => readFileSync(join(root, "plugins", "vibe", "commands", "setup.md"), "utf8");
const readme = () => readFileSync(join(root, "README.md"), "utf8");

const frontmatter = (s: string) => s.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
const body = (s: string) => s.replace(/^---\n[\s\S]*?\n---/, "");

// The indented lines under a top-level `key:` — enough yaml for this contract,
// no yaml dependency.
const yamlSection = (s: string, key: string) => {
  const lines = s.split("\n");
  const start = lines.findIndex((l) => l.trim() === `${key}:`);
  if (start < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.trim() !== "" && !/^\s/.test(l)) break;
    out.push(l);
  }
  return out.join("\n");
};

test("user-only on both hosts", () => {
  const fm = frontmatter(skill());
  expect(fm).toMatch(/^name:\s*init\s*$/m);
  expect(fm).toMatch(/^description:\s*Set up VIBE routing/m);
  expect(fm).toMatch(/^argument-hint:\s*"\[--yes\]"\s*$/m);
  expect(fm).toMatch(/^disable-model-invocation:\s*true\s*$/m);

  const yaml = openaiYaml();
  expect(yamlSection(yaml, "policy")).toMatch(/^\s+allow_implicit_invocation:\s*false\s*$/m);
  expect(yamlSection(yaml, "interface")).toMatch(/^\s+display_name:\s*"VIBE init"\s*$/m);
});

test("defaults named for every question", () => {
  const text = body(skill());
  const lower = text.toLowerCase();
  // Preset: split when the other runtime is installed and logged in, else tiered.
  expect(text).toMatch(/`split`/);
  expect(text).toMatch(/`tiered`/);
  expect(lower).toMatch(/installed and logged in/);
  // Customize roles: default no; contract-writer shown but not editable.
  expect(lower).toMatch(/customi[sz]e roles/);
  expect(lower).toMatch(/default[^.\n]*\bno\b|\bno\b[^.\n]*default/);
  expect(text).toContain("`contract-writer`");
  expect(lower).toMatch(/not editable|read-only|cannot be edited/);
  // Egress: default acknowledged.
  expect(lower).toContain("egress");
  expect(lower).toContain("acknowledged");
  // Scope: default user.
  expect(lower).toMatch(/scope[^.\n]*default[^.\n]*\buser\b|default scope[^.\n]*\buser\b/);
  // --yes takes the same defaults.
  expect(text).toContain("--yes");
  expect(lower).toMatch(/same defaults/);
});

test("question tool or plain conversation, one question per message", () => {
  const text = body(skill());
  const lower = text.toLowerCase();
  expect(lower).toContain("question tool");
  expect(lower).toContain("plain conversation");
  expect(lower).toContain("one question per message");
  expect(lower).toMatch(/default (is )?marked|marked (as )?(the )?default|mark(s|ed|ing)? the default/);
  // AskUserQuestion is one harness's question tool, never the only path.
  expect(text).not.toMatch(/only (via|through|with) (the )?`?AskUserQuestion/i);
  expect(text).not.toMatch(/`?AskUserQuestion`? (is|as) the only/i);
});

test("egress questions per provider and class", () => {
  const text = body(skill());
  const lower = text.toLowerCase();
  expect(text).toMatch(/`openai`/);
  expect(text).toMatch(/`anthropic`/);
  expect(text).toMatch(/`review`/);
  expect(text).toMatch(/`doer`/);
  expect(lower).toMatch(/one (egress )?question per provider/);
  expect(lower).toMatch(/\bclass\b/);
  expect(lower).toMatch(/on this host/);
  // The "no" consequence, per class.
  expect(lower).toMatch(/rerout(e|ed|es|ing)[^.\n]*host/);
  expect(lower).toMatch(/`contract-writer`[^.\n]*unsupported|unsupported[^.\n]*`contract-writer`/);
  expect(lower).toMatch(/codex host/);
  expect(lower).toMatch(/review[^.\n]*not performed/);
});

test("project scope runs share plan, confirm, apply and writes the project block", () => {
  const text = body(skill());
  const lower = text.toLowerCase();
  expect(text).toMatch(/share\.mjs plan/);
  expect(lower).toMatch(/confirm/);
  expect(text).toMatch(/share\.mjs apply[^\n]*--yes/);
  expect(text).toMatch(/`project` block/);
  expect(text).toMatch(/`install`/);
  expect(text).toMatch(/`test`/);
  expect(lower).toContain("lockfile");
  expect(text).toContain("`package.json`");
  expect(lower).toMatch(/confirmed/);
});

test("write and verify commands", () => {
  const text = body(skill());
  const lower = text.toLowerCase();
  expect(text).toMatch(/init\.mjs"? write --host[^\n]*--yes/);
  expect(text).toMatch(/init\.mjs bridges --host[^\n]*--yes/);
  expect(text).toMatch(/init\.mjs show/);
  expect(text).toContain("${CLAUDE_PLUGIN_ROOT}");
  expect(text).toContain("${PLUGIN_ROOT}");
  // Codex thread cap.
  expect(text).toMatch(/agents-cap/);
  expect(text).toContain("[agents]");
  // Init never touches the sandbox network switch.
  expect(text).toContain("sandbox_workspace_write.network_access");
  expect(lower).toMatch(/never[^\n]{0,80}network_access|network_access[^\n]{0,80}never/);
});

test("re-running shows current values as the defaults", () => {
  const lower = body(skill()).toLowerCase();
  expect(lower).toMatch(/re-run(ning)?/);
  expect(lower).toContain("current values");
});

// The last step of /vibe:setup — numbered step 6 or a "Hand off" section.
const handoff = (s: string) =>
  s.match(/(?:^|\n)(?:6\. \*\*[\s\S]*?|## Hand[- ]off[\s\S]*?)(?=\n\d+\. \*\*|\n## |$(?![\s\S]))/i)?.[0] ??
  "";

test("setup hands off to /vibe:init", () => {
  const step = handoff(setup());
  expect(step).not.toBe("");
  expect(step).toContain("/vibe:init");
});

test("README lists /vibe:init in the vibe component table", () => {
  expect(readme()).toMatch(/^\| `\/vibe:init`/m);
});

test("fable-safe and no dated model id", () => {
  const text = skill();
  expect(text.toLowerCase()).not.toMatch(/explain your reasoning|show your work|think out loud/);
  expect(text).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});
