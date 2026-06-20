import { test, expect } from "bun:test";
import { normalize, bumpVersion, detectBump, nextVersion } from "./version";

test("normalize pads to three parts and coerces non-numbers to 0", () => {
  expect(normalize("1")).toBe("1.0.0");
  expect(normalize("1.2")).toBe("1.2.0");
  expect(normalize("1.2.3")).toBe("1.2.3");
  expect(normalize("1.2.3.4")).toBe("1.2.3");
  expect(normalize("v1.x")).toBe("0.0.0");
});

test("bumpVersion increments the right component and zeroes the lower ones", () => {
  expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  expect(bumpVersion("1", "minor")).toBe("1.1.0");
});

test("detectBump: breaking > feat > fallback patch", () => {
  expect(detectBump(["fix: a", "chore: b"])).toBe("patch");
  expect(detectBump(["fix: a", "feat: b"])).toBe("minor");
  expect(detectBump(["feat(x): a", "feat!: b"])).toBe("major");
  expect(detectBump(["refactor: a", "feat: b\n\nBREAKING CHANGE: x"])).toBe("major");
  expect(detectBump(["feat(scope): a"])).toBe("minor");
  expect(detectBump(["docs: explain BREAKING CHANGE policy"])).toBe("patch");
  expect(detectBump(["feat(): x"])).toBe("minor");
  expect(detectBump([])).toBe("patch");
});

test("nextVersion composes detectBump + bumpVersion", () => {
  expect(nextVersion("1.4.0", ["feat: new thing"])).toBe("1.5.0");
  expect(nextVersion("1.4.0", ["fix: bug"])).toBe("1.4.1");
  expect(nextVersion("1.4.0", ["feat!: breaking"])).toBe("2.0.0");
});
