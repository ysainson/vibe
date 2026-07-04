import { test, expect } from "bun:test";
import { releaseLogArgs } from "./release-log";

test("scopes the release commit log to the plugin dir", () => {
  // `--` path-scoping is the contract: chore(pins) commits touch only the root
  // marketplace.json and must stay out of every plugin's release trail.
  expect(releaseLogArgs("vibe--v1.1.0..HEAD", "plugins/vibe")).toEqual([
    "log",
    "vibe--v1.1.0..HEAD",
    "--format=%s",
    "--no-merges",
    "--",
    "plugins/vibe",
  ]);
});

test("first release (no prior tag) logs HEAD, still path-scoped", () => {
  expect(releaseLogArgs("HEAD", "plugins/vibe-expo")).toEqual([
    "log",
    "HEAD",
    "--format=%s",
    "--no-merges",
    "--",
    "plugins/vibe-expo",
  ]);
});
