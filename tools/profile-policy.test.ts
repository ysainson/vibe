import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the profile-policy skill — routing lives in routing.json
// (presets, adapters, `default`, requested vs effective), external cross-check
// models are config-owned, asserted and reported, never named in dispatch prose
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section D and contract 6).
const policyPath = join(
  import.meta.dir,
  "..",
  "plugins",
  "vibe",
  "skills",
  "profile-policy",
  "SKILL.md",
);

const src = () => readFileSync(policyPath, "utf8");

test("external cross-check models are config-owned, assert-and-report", () => {
  const body = src().toLowerCase();
  expect(body).toContain("cross-check");
  expect(body).toContain("config-owned");
  expect(body).toMatch(/assert/);
  expect(body).toMatch(/report/);
});

test("a concrete model name may appear only in setup-layer docs, dated", () => {
  const body = src().toLowerCase();
  expect(body).toMatch(/setup-layer|setup docs|readme/);
  expect(body).toMatch(/dated/);
});

test("no dated model id anywhere in the policy", () => {
  // The tiers-are-aliases example uses a placeholder, not a real dated id.
  expect(src()).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});

test("routing lives in routing.json with the three presets", () => {
  const body = src();
  expect(body).toContain("routing.json");
  expect(body).toContain("`uniform`");
  expect(body).toContain("`tiered`");
  expect(body).toContain("`split`");
});

test("adapters and the `default` value are explained", () => {
  const body = src();
  expect(body.toLowerCase()).toContain("adapters");
  expect(body).toContain("`default`");
});

test("requested vs effective, with the corrected CLAUDE_CODE_SUBAGENT_MODEL semantics", () => {
  const body = src();
  expect(body.toLowerCase()).toContain("requested");
  expect(body.toLowerCase()).toContain("effective");
  expect(body).toContain("CLAUDE_CODE_SUBAGENT_MODEL_FORCE");
  // a dispatch `model` beats the env var unless FORCE is set — it is not the
  // highest-priority override any more
  expect(body).not.toMatch(/highest[- ]priority override/i);
});

test("contract-writer is pinned to the claude runtime", () => {
  const line = src()
    .split("\n")
    .find((l) => l.includes("contract-writer") && /\bclaude\b/.test(l));
  expect(line).toBeDefined();
});

test("egress keys openai/anthropic with the review and doer classes", () => {
  const body = src();
  expect(body.toLowerCase()).toContain("egress");
  expect(body).toContain("`openai`");
  expect(body).toContain("`anthropic`");
  expect(body).toContain("`review`");
  expect(body).toContain("`doer`");
});

test("no longer claims a PROFILE line or one global switch", () => {
  const body = src();
  expect(body).not.toContain("PROFILE:");
  expect(body).not.toMatch(/one global switch/i);
});
