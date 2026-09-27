import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the conduct skill's routing coverage — routing is read from the
// injected `<VIBE_ROUTING>` block, never from a hardcoded PROFILE table
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section D and contract 6).
const root = join(import.meta.dir, "..");

const skill = () =>
  readFileSync(join(root, "plugins", "vibe", "skills", "conduct", "SKILL.md"), "utf8");
const guardrails = () =>
  readFileSync(join(root, "plugins", "vibe", "skills", "conduct", "guardrails.md"), "utf8");
const contractWriter = () =>
  readFileSync(join(root, "plugins", "vibe", "agents", "contract-writer.md"), "utf8");

test("no PROFILE: line and no routing table in the skill", () => {
  const body = skill();
  expect(body).not.toContain("PROFILE:");
  const lines = body.split("\n");
  expect(lines.find((l) => /^\|\s*Implementation\b/i.test(l))).toBeUndefined();
  expect(lines.find((l) => /^\|\s*Role\s*\|.*\btiered\b/i.test(l))).toBeUndefined();
});

test("routing is read from the injected <VIBE_ROUTING> block, with the resolver as fallback", () => {
  const body = skill();
  expect(body).toContain("<VIBE_ROUTING>");
  expect(body).toContain("routing.mjs");
  expect(body).toMatch(/routing\.mjs[^\n]*resolve --host claude/);
  // each dispatch takes `model` from the role's row and omits it on `default`
  expect(body).toContain("`default`");
});

test("codex-runtime dispatch mechanics are deferred to spec section E, landing in phase 2", () => {
  const body = skill();
  expect(body.toLowerCase()).toContain("codex");
  expect(body).toMatch(/section E\b/);
  expect(body).toMatch(/phase 2\b/);
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

test("guardians and project-local agents take the `guardians` row of the routing block", () => {
  expect(skill()).toMatch(/`(roles\.)?guardians`[^\n]*\brow\b/i);
});

test("verify step offers the cross-model check on the final diff — never per-subtask", () => {
  const body = skill().toLowerCase();
  expect(body).toContain("cross-model");
  expect(body).toMatch(/never per[- ]subtask/);
});

test("step 6 may run `adversarial` on the final diff — high-stakes or on request, never per-subtask", () => {
  const body = skill();
  expect(body).toMatch(/`(roles\.)?adversarial`/);
  expect(body.toLowerCase()).toMatch(/final diff/);
  expect(body.toLowerCase()).toMatch(/high-stakes/);
});

test("no dated model id in the skill (born green — regression guard)", () => {
  expect(skill()).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});

test("skill carries the engineering defaults (born green — regression guard)", () => {
  const body = skill();
  expect(body).toContain("## Engineering defaults");
  expect(body.toLowerCase()).toMatch(/remove obsolete paths/);
  expect(body.toLowerCase()).toMatch(/consumers outside this codebase/);
});

test("doer block forbids compat shims and reinvention (born green — regression guard)", () => {
  const block = guardrails();
  expect(block).toMatch(/compatibility\s+layers/i);
  expect(block).toMatch(/dependency already in the\s+project/i);
});
