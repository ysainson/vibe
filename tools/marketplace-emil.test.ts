import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isBranchPin } from "./pins";

// Contract for the emilkowalski/skills re-exports: the whole-repo design-eng
// collection is standalone and optional (like codex); the Expo-specific
// animate-expo skill is a git-subdir pin wired into vibe-expo as a dependency.
// Upstream has no tags, so both are branch pins — shape only, no sha literal:
// re-pinning to a newer head must not touch this file.
const root = join(import.meta.dir, "..");

const marketplace = () =>
  JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8")) as {
    plugins: { name: string; description?: string; source?: unknown }[];
  };

const pluginManifests = () =>
  readdirSync(join(root, "plugins"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, "plugins", e.name, ".claude-plugin", "plugin.json"))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")) as { name: string; dependencies?: string[] });

test("emil-design-eng is a branch-pinned whole-repo re-export of emilkowalski/skills", () => {
  const entry = marketplace().plugins.find((p) => p.name === "emil-design-eng");
  expect(entry).toBeDefined();
  const source = entry!.source as { source?: string; repo?: string; ref?: string; sha?: string };
  expect(source.source).toBe("github");
  expect(source.repo).toBe("emilkowalski/skills");
  expect(isBranchPin(source.ref ?? "")).toBe(true);
  expect(source.sha).toMatch(/^[0-9a-f]{40}$/);
});

test("emil-design-eng is optional: no plugin lists it as a dependency", () => {
  const manifests = pluginManifests();
  expect(manifests.length).toBeGreaterThan(0);
  for (const manifest of manifests) {
    expect(manifest.dependencies ?? []).not.toContain("emil-design-eng");
  }
});

test("emil-animate-expo is a branch-pinned git-subdir of emilkowalski/skills at skills/animate-expo", () => {
  const entry = marketplace().plugins.find((p) => p.name === "emil-animate-expo");
  expect(entry).toBeDefined();
  const source = entry!.source as {
    source?: string;
    url?: string;
    path?: string;
    ref?: string;
    sha?: string;
  };
  expect(source.source).toBe("git-subdir");
  expect(source.url).toBe("emilkowalski/skills");
  expect(source.path).toBe("skills/animate-expo");
  expect(isBranchPin(source.ref ?? "")).toBe(true);
  expect(source.sha).toMatch(/^[0-9a-f]{40}$/);
});

test("vibe-expo depends on emil-animate-expo", () => {
  const vibeExpo = pluginManifests().find((m) => m.name === "vibe-expo");
  expect(vibeExpo).toBeDefined();
  expect(vibeExpo!.dependencies ?? []).toContain("emil-animate-expo");
});

test("README documents the emil-design-eng re-export as optional", () => {
  const lines = readFileSync(join(root, "README.md"), "utf8").split("\n");
  expect(lines.some((l) => /`emil-design-eng`/.test(l) && /optional/i.test(l))).toBe(true);
});
