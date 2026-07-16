import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for /vibe:review's optional final-diff cross-model check
// (docs/specs/2026-07-17-codex-overlay-and-routing-coverage.md, section D).
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

test("dispatch uses the review subcommand with the working-tree/base rule", () => {
  const body = review();
  expect(body).toContain("--scope working-tree");
  expect(body).toContain("--base");
});

test("model expectation on the native-review path derives from review_model first", () => {
  expect(review()).toContain("review_model");
});

test("background launch with a numbered collection step and timeout recovery", () => {
  const body = review().toLowerCase();
  expect(body).toContain("background");
  expect(body).toMatch(/collect/);
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
