import { test, expect } from "bun:test";
import { releaseNotes } from "./notes";

test("groups conventional commits into Features / Fixes / Other, stripping the prefix", () => {
  const notes = releaseNotes(["feat: add setup", "fix: bad path", "chore: deps"]);
  expect(notes).toBe(
    "### Features\n\n- add setup\n\n### Fixes\n\n- bad path\n\n### Other\n\n- deps",
  );
});

test("strips scope and breaking marker from the description", () => {
  expect(releaseNotes(["feat(setup)!: scaffolder"])).toBe("### Features\n\n- scaffolder");
});

test("omits empty groups and falls back for empty input", () => {
  expect(releaseNotes(["fix: only a fix"])).toBe("### Fixes\n\n- only a fix");
  expect(releaseNotes([])).toBe("No notable changes.");
});

test("non-conventional lines land in Other verbatim", () => {
  expect(releaseNotes(["just a message"])).toBe("### Other\n\n- just a message");
});
