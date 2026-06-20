import { test, expect } from "bun:test";
import { parseReexports, tagIsNewer } from "./pins";

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
