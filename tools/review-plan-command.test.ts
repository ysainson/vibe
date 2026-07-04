import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for /vibe:review-plan — the adversarial spec-review gate between
// /vibe:brainstorm and /vibe:conduct.
const commandPath = join(
  import.meta.dir,
  "..",
  "plugins",
  "vibe",
  "commands",
  "review-plan.md",
);

const src = () => readFileSync(commandPath, "utf8");

const frontmatter = (s: string) => s.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

test("ships with routable, user-only frontmatter", () => {
  const fm = frontmatter(src());
  expect(fm).toMatch(/^description:\s*\S+/m);
  expect(fm.toLowerCase()).toContain("spec");
  expect(fm).toMatch(/^argument-hint:/m);
  expect(fm).toMatch(/^disable-model-invocation:\s*true/m);
});

test("defaults to the newest spec under docs/specs/ when no argument is given", () => {
  const body = src();
  expect(body).toContain("$ARGUMENTS");
  expect(body).toContain("docs/specs/");
});

test("fans out distinct adversarial lenses in parallel", () => {
  const body = src().toLowerCase();
  expect(body).toContain("parallel");
  expect(body).toContain("feasibility");
  expect(body).toContain("consistency");
  expect(body).toMatch(/architecture|performance/);
  expect(body).toContain("readiness");
});

test("gates on the three verdicts and hands off to /vibe:conduct", () => {
  const body = src();
  expect(body).toContain("ready-with-fixes");
  expect(body).toContain("needs-rework");
  expect(body).toMatch(/`ready`/);
  expect(body).toContain("/vibe:conduct");
});

test("re-reviews are resolution-aware and iterate to convergence", () => {
  const body = src();
  expect(body).toMatch(/resolved\s*\/\s*partially\s*\/\s*not/i);
  expect(body.toLowerCase()).toMatch(/resolution/);
});

test("offers the cross-model check as optional", () => {
  const body = src().toLowerCase();
  expect(body).toContain("codex");
  expect(body).toContain("optional");
});

test("fable-safe: never asks an agent for introspection", () => {
  expect(src().toLowerCase()).not.toMatch(
    /explain your reasoning|show your work|think out loud/,
  );
});
