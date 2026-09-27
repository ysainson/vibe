import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for /vibe:quick-check — guardians take the `guardians` row of the
// injected routing block, never a PROFILE table
// (docs/specs/2026-09-04-multi-runtime-vibe.md, section D and contract 6).
const root = join(import.meta.dir, "..");

const quickCheck = () =>
  readFileSync(join(root, "plugins", "vibe", "commands", "quick-check.md"), "utf8");

test("guardians take the `guardians` row of the routing block, not a PROFILE table", () => {
  const body = quickCheck();
  expect(body).toMatch(/VIBE_ROUTING|routing/i);
  expect(body).toMatch(/`(roles\.)?guardians`/);
  expect(body).not.toContain("PROFILE");
});

test("stays codex-free (born green — regression guard)", () => {
  expect(quickCheck().toLowerCase()).not.toContain("codex");
});

test("no dated model id in the command (born green — regression guard)", () => {
  expect(quickCheck()).not.toMatch(/claude-[a-z]+-\d|gpt-\d/);
});
