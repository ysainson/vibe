import { test, expect } from "bun:test";
import { buildProjectSettings } from "./settings";

test("registers the marketplace keyed by its name with a github source", () => {
  const s = buildProjectSettings("ysainson", "ysainson/vibe", ["vibe"]);
  expect(s.extraKnownMarketplaces).toEqual({
    ysainson: { source: { source: "github", repo: "ysainson/vibe" } },
  });
});

test("core + overlay: marketplace registered once, each plugin enabled as `<plugin>@<marketplace>`", () => {
  const s = buildProjectSettings("ysainson", "ysainson/vibe", ["vibe", "vibe-swift"]);
  expect(s).toEqual({
    extraKnownMarketplaces: {
      ysainson: { source: { source: "github", repo: "ysainson/vibe" } },
    },
    enabledPlugins: {
      "vibe@ysainson": true,
      "vibe-swift@ysainson": true,
    },
  });
});

test("a core-only project enables just the vibe core", () => {
  const s = buildProjectSettings("ysainson", "ysainson/vibe", ["vibe"]);
  expect(s.enabledPlugins).toEqual({ "vibe@ysainson": true });
  expect(Object.keys(s.extraKnownMarketplaces)).toEqual(["ysainson"]);
});
