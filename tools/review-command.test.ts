import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for /vibe:review — models come from the injected routing block
// (roles.cross-check / adversarial / guardians), the optional final-diff
// cross-model check, and the `/vibe:review adversarial` form
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section D and contract 6).
const root = join(import.meta.dir, "..");

const review = () =>
  readFileSync(join(root, "plugins", "vibe", "commands", "review.md"), "utf8");
const quickCheck = () =>
  readFileSync(join(root, "plugins", "vibe", "commands", "quick-check.md"), "utf8");

test("cross-check is gated: high-stakes or user request, never silent", () => {
  const body = review().toLowerCase();
  expect(body).toContain("codex");
  expect(body).toContain("high-stakes");
  expect(body).toMatch(/user asks|user request/);
});

test("egress guard: consent, then secrets pre-scan, before any dispatch", () => {
  const body = review().toLowerCase();
  expect(body).toContain("consent");
  expect(body).toContain("openai");
  expect(body).toMatch(/secrets? pre-scan/);
});

test("secrets pre-scan reads the shared secret-patterns.json", () => {
  const body = review();
  expect(body.toLowerCase()).toMatch(/secrets? pre-scan/);
  expect(body).toContain("secret-patterns.json");
});

test("dispatch uses the review subcommand with the working-tree/base rule", () => {
  const body = review();
  expect(body).toContain("--scope working-tree");
  expect(body).toContain("--base");
});

test("dispatch models come from the routing block's cross-check, adversarial, and guardians rows", () => {
  const body = review();
  expect(body).toMatch(/VIBE_ROUTING|routing/i);
  expect(body).toMatch(/`(roles\.)?cross-check`/);
  expect(body).toMatch(/`(roles\.)?adversarial`/);
  expect(body).toMatch(/`(roles\.)?guardians`/);
  expect(body).not.toContain("PROFILE");
});

test("review_model is gone — model expectation is config-owned", () => {
  expect(review()).not.toContain("review_model");
});

test("`/vibe:review adversarial` runs adversarial-review on the working tree or against the base", () => {
  const body = review();
  expect(body).toContain("/vibe:review adversarial");
  expect(body).toContain("adversarial-review");
  expect(body).toContain("--scope working-tree");
  expect(body).toContain("--base");
});

test("default branch comes from origin/HEAD, falling back to main", () => {
  const body = review();
  expect(body).toContain("git symbolic-ref refs/remotes/origin/HEAD");
  expect(body).toMatch(/fall(s|ing)?\s*back\s+(to\s+)?`?main`?/i);
});

test("background launch with a numbered collection step and timeout recovery", () => {
  const body = review().toLowerCase();
  expect(body).toContain("run_in_background");
  expect(body).toMatch(/## step \d+ — collect/);
  expect(body).toContain("/codex:status");
});

test("plugin-absent and any-stage failures skip and report — never fail the review", () => {
  const body = review().toLowerCase();
  expect(body).toMatch(/skip/);
  expect(body).toMatch(/never fail|never block/);
});

test("no dated model id in the command (born green — regression guard)", () => {
  expect(review()).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});

test("quick-check stays codex-free (born green — regression guard)", () => {
  expect(quickCheck().toLowerCase()).not.toContain("codex");
});
