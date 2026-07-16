import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the profile-policy skill — external cross-check models are
// config-owned, asserted and reported, never named in dispatch prose
// (docs/specs/2026-07-17-codex-overlay-and-routing-coverage.md, section E).
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
