import { test, expect } from "bun:test";
import { parseReexports, tagIsNewer, isStableTag, pickLatestStable } from "./pins";

test("parseReexports returns only github-source re-exports with their pins", () => {
  const mp = {
    plugins: [
      { name: "vibe", source: "./plugins/vibe" },
      { name: "vibe-swift", source: "./plugins/vibe-swift" },
      { name: "superpowers", source: { source: "github", repo: "obra/superpowers", ref: "v6.0.3", sha: "abc" } },
      { name: "swiftui-expert", source: { source: "github", repo: "AvdLee/SwiftUI-Agent-Skill", ref: "4.0.0", sha: "def" } },
    ],
  };
  expect(parseReexports(mp)).toEqual([
    { name: "superpowers", repo: "obra/superpowers", ref: "v6.0.3", sha: "abc" },
    { name: "swiftui-expert", repo: "AvdLee/SwiftUI-Agent-Skill", ref: "4.0.0", sha: "def" },
  ]);
});

test("parseReexports tolerates a missing plugins array", () => {
  expect(parseReexports({})).toEqual([]);
});

test("tagIsNewer compares semver tags numerically, tolerating a leading v", () => {
  expect(tagIsNewer("4.1.0", "4.0.0")).toBe(true);
  expect(tagIsNewer("v6.1.0", "v6.0.3")).toBe(true);
  expect(tagIsNewer("4.0.0", "4.0.0")).toBe(false);
  expect(tagIsNewer("1.2.0", "1.10.0")).toBe(false);
  expect(tagIsNewer("v6.0.3", "v6.0.2")).toBe(true);
});

test("isStableTag accepts plain version tags and rejects pre-releases and junk", () => {
  expect(isStableTag("v6.0.3")).toBe(true);
  expect(isStableTag("4.0.0")).toBe(true);
  expect(isStableTag("1.2")).toBe(true);
  expect(isStableTag("v1.0.0-rc1")).toBe(false);
  expect(isStableTag("2.0.0-alpha.1")).toBe(false);
  expect(isStableTag("2.0.0+build.5")).toBe(false);
  expect(isStableTag("nightly")).toBe(false);
  expect(isStableTag("release-1")).toBe(false);
});

test("pickLatestStable finds the highest tag regardless of list order", () => {
  // The /tags API returns rough ref order, not semver — the newest may not be first.
  const tags = [
    { tag: "v6.0.0", sha: "a" },
    { tag: "v6.0.3", sha: "d" },
    { tag: "v5.9.0", sha: "b" },
    { tag: "v6.0.2", sha: "c" },
  ];
  expect(pickLatestStable(tags)).toEqual({ tag: "v6.0.3", sha: "d" });
});

test("pickLatestStable ignores pre-release tags", () => {
  const tags = [
    { tag: "v2.0.0", sha: "stable" },
    { tag: "v2.1.0-rc1", sha: "pre" },
  ];
  expect(pickLatestStable(tags)).toEqual({ tag: "v2.0.0", sha: "stable" });
});

test("pickLatestStable returns null when no stable tag is present", () => {
  expect(pickLatestStable([])).toBeNull();
  expect(pickLatestStable([{ tag: "nightly", sha: "x" }])).toBeNull();
});
