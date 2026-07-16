import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the conduct skill's routing coverage — every dispatch point has
// a PROFILE row or a stated fallback rule (docs/specs/2026-07-17-codex-overlay-
// and-routing-coverage.md, section B).
const root = join(import.meta.dir, "..");

const skill = () =>
  readFileSync(join(root, "plugins", "vibe", "skills", "conduct", "SKILL.md"), "utf8");
const guardrails = () =>
  readFileSync(join(root, "plugins", "vibe", "skills", "conduct", "guardrails.md"), "utf8");
const contractWriter = () =>
  readFileSync(join(root, "plugins", "vibe", "agents", "contract-writer.md"), "utf8");

test("PROFILE table routes exploration to sonnet (tiered) / inherit (uniform)", () => {
  const row = skill()
    .split("\n")
    .find((l) => /^\|\s*Exploration\b/i.test(l));
  expect(row).toBeDefined();
  expect(row!).toMatch(/Explore/);
  expect(row!).toMatch(/\bsonnet\b/);
  expect(row!).toMatch(/\binherit\b/);
});

test("PROFILE table routes contract writing to vibe:contract-writer on inherit in both profiles", () => {
  const row = skill()
    .split("\n")
    .find((l) => /^\|\s*Contract writing\b/i.test(l));
  expect(row).toBeDefined();
  expect(row!).toContain("contract-writer");
  expect(row!.match(/\binherit\b/g)?.length).toBeGreaterThanOrEqual(2);
});

test("contract-writer agent exists on the inherit tier with a tests-only scope", () => {
  const agent = contractWriter();
  expect(agent).toMatch(/^model:\s*inherit/m);
  expect(agent.toLowerCase()).toMatch(/test files/);
  expect(agent.toLowerCase()).toMatch(/never .*(implementation|source) files?/);
});

test("guardrails ship a contract-writer block", () => {
  expect(guardrails().toLowerCase()).toContain("contract-writer block");
});

test("doer block still forbids test files (born green — regression guard)", () => {
  expect(guardrails()).toContain("Never modify test files");
});

test("guardians and project-local agents route by their own frontmatter (fallback rule)", () => {
  const body = skill().toLowerCase();
  expect(body).toContain("frontmatter");
  expect(body).toMatch(/guardian/);
});

test("verify step offers the cross-model check on the final diff — never per-subtask", () => {
  const body = skill().toLowerCase();
  expect(body).toContain("cross-model");
  expect(body).toMatch(/never per[- ]subtask/);
});

test("no dated model id in the skill (born green — regression guard)", () => {
  expect(skill()).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});
