import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the README's routing and sharing claims — routing.json at user
// and project scope, the three presets, /vibe:init, the AGENTS.md +
// .agents/skills sharing layer; no PROFILE-table or env-override claim
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section D and contract 6).
const root = join(import.meta.dir, "..");

const readme = () => readFileSync(join(root, "README.md"), "utf8");

test("documents routing.json at user and project scope", () => {
  const body = readme();
  expect(body).toContain("routing.json");
  expect(body).toContain("~/.agents/vibe/");
  expect(body).toContain(".agents/vibe/");
});

test("names the three presets and /vibe:init", () => {
  const body = readme();
  expect(body).toContain("`uniform`");
  expect(body).toContain("`tiered`");
  expect(body).toContain("`split`");
  expect(body).toContain("/vibe:init");
});

test("documents the sharing layer: AGENTS.md and .agents/skills", () => {
  const body = readme();
  expect(body).toContain("AGENTS.md");
  expect(body).toContain(".agents/skills");
});

test("no longer claims a PROFILE table or a zero-file-edits env override", () => {
  const body = readme();
  expect(body).not.toContain("PROFILE");
  expect(body).not.toMatch(/zero file edits/i);
});

test("the profile-policy row in the skills table describes routing, not PROFILE tiers", () => {
  const row = readme()
    .split("\n")
    .find((l) => /^\|\s*`vibe:profile-policy`/.test(l));
  expect(row).toBeDefined();
  expect(row!.toLowerCase()).toContain("routing");
  expect(row!).not.toContain("PROFILE");
});
