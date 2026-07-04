import { test, expect } from "bun:test";
import { parseReexports, tagIsNewer, isStableTag, pickLatestStable, isBranchPin, reportPin, type Reexport, type Upstream } from "./pins";

test("parseReexports returns github-source re-exports with their pins", () => {
  const mp = {
    plugins: [
      { name: "vibe", source: "./plugins/vibe" },
      { name: "vibe-swift", source: "./plugins/vibe-swift" },
      { name: "superpowers", source: { source: "github", repo: "obra/superpowers", ref: "v6.0.3", sha: "abc" } },
      { name: "swiftui-expert", source: { source: "github", repo: "AvdLee/SwiftUI-Agent-Skill", ref: "4.0.0", sha: "def" } },
    ],
  };
  expect(parseReexports(mp)).toEqual([
    { name: "superpowers", repo: "obra/superpowers", ref: "v6.0.3", sha: "abc", kind: "github" },
    { name: "swiftui-expert", repo: "AvdLee/SwiftUI-Agent-Skill", ref: "4.0.0", sha: "def", kind: "github" },
  ]);
});

test("parseReexports returns git-subdir re-exports, reading the repo from url", () => {
  const mp = {
    plugins: [
      { name: "vibe", source: "./plugins/vibe" },
      {
        name: "expo",
        source: { source: "git-subdir", url: "expo/skills", path: "plugins/expo", ref: "main", sha: "deadbeef" },
      },
    ],
  };
  expect(parseReexports(mp)).toEqual([
    { name: "expo", repo: "expo/skills", ref: "main", sha: "deadbeef", kind: "git-subdir", path: "plugins/expo" },
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

test("isBranchPin: a branch ref is a branch pin, a version tag is not", () => {
  expect(isBranchPin("main")).toBe(true);
  expect(isBranchPin("v6.1.1")).toBe(false);
  expect(isBranchPin("4.0.0")).toBe(false);
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

// --- reportPin: one status per pin, from the pin + what upstream returned ---

const tagPin: Reexport = { name: "superpowers", repo: "obra/superpowers", ref: "v6.0.3", sha: "aaa", kind: "github" };
const branchPin: Reexport = {
  name: "expo",
  repo: "expo/skills",
  ref: "main",
  sha: "headsha",
  kind: "git-subdir",
  path: "plugins/expo",
};

test("reportPin: tag pin with a newer stable tag is behind (the only auto-bumpable state)", () => {
  const up: Upstream = { kind: "latest-tag", tag: "v6.1.0", sha: "bbb" };
  expect(reportPin(tagPin, up)).toEqual({ status: "behind", latest: { tag: "v6.1.0", sha: "bbb" } });
});

test("reportPin: tag pin at the latest stable tag is current", () => {
  expect(reportPin(tagPin, { kind: "latest-tag", tag: "v6.0.3", sha: "aaa" })).toEqual({ status: "current" });
  expect(reportPin(tagPin, { kind: "latest-tag", tag: "v6.0.1", sha: "old" })).toEqual({ status: "current" });
});

test("reportPin: branch pin at the branch head is current", () => {
  expect(reportPin(branchPin, { kind: "branch-head", sha: "headsha" })).toEqual({ status: "current" });
});

test("reportPin: branch pin behind the branch head is drift, never behind", () => {
  // drift is informational — excluded from any --yes auto-bump
  expect(reportPin(branchPin, { kind: "branch-head", sha: "newhead" })).toEqual({
    status: "drift",
    headSha: "newhead",
  });
});

test("reportPin: unreachable upstream fails closed for both pin kinds", () => {
  expect(reportPin(tagPin, { kind: "unreachable" })).toEqual({ status: "unreachable" });
  expect(reportPin(branchPin, { kind: "unreachable" })).toEqual({ status: "unreachable" });
});

test("reportPin: tag pin with no stable tags upstream is its own distinct failure", () => {
  expect(reportPin(tagPin, { kind: "no-stable-tags" })).toEqual({ status: "no-stable-tags" });
});
