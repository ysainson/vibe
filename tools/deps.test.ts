import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { unresolvedDeps } from "./deps";

test("unresolvedDeps flags a dependency with no marketplace entry of that name", () => {
  const plugins = [
    { name: "vibe-swift", dependencies: ["swiftui-expert", "swiftui-expert-skill"] },
  ];
  // Marketplace ids and SKILL names are NOT plugin names — the three-name trap.
  expect(unresolvedDeps(plugins, ["vibe", "vibe-swift", "swiftui-expert"])).toEqual([
    { plugin: "vibe-swift", dependency: "swiftui-expert-skill" },
  ]);
});

test("unresolvedDeps is empty when every dependency resolves", () => {
  const plugins = [{ name: "vibe", dependencies: ["superpowers"] }];
  expect(unresolvedDeps(plugins, ["vibe", "superpowers"])).toEqual([]);
});

test("unresolvedDeps tolerates plugins without a dependencies field", () => {
  expect(unresolvedDeps([{ name: "bare" }], ["bare"])).toEqual([]);
});

test("every real plugin dependency resolves to a marketplace entry name", () => {
  // Without this gate, a bad name only surfaces as dependency-unsatisfied at
  // install/enable time.
  const root = join(import.meta.dir, "..");
  const marketplace = JSON.parse(
    readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"),
  ) as { plugins: { name: string }[] };
  const names = marketplace.plugins.map((p) => p.name);

  const plugins = readdirSync(join(root, "plugins"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, "plugins", e.name, ".claude-plugin", "plugin.json"))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")) as { name: string; dependencies?: string[] });

  expect(plugins.length).toBeGreaterThan(0);
  expect(unresolvedDeps(plugins, names)).toEqual([]);
});
