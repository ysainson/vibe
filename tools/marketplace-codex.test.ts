import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isStableTag } from "./pins";

// Contract for the codex re-export — pinned git-subdir entry, optional for
// every plugin (docs/specs/2026-07-17-codex-overlay-and-routing-coverage.md,
// section A). Shape only, no version literal: `bun tools/pins.ts --yes` must
// be free to bump the pin.
const root = join(import.meta.dir, "..");

const marketplace = () =>
  JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8")) as {
    plugins: { name: string; description?: string; source?: unknown }[];
  };

test("codex is re-exported as a tag-pinned git-subdir of openai/codex-plugin-cc", () => {
  const entry = marketplace().plugins.find((p) => p.name === "codex");
  expect(entry).toBeDefined();
  const source = entry!.source as {
    source?: string;
    url?: string;
    path?: string;
    ref?: string;
    sha?: string;
  };
  expect(source.source).toBe("git-subdir");
  expect(source.url).toBe("openai/codex-plugin-cc");
  expect(source.path).toBe("plugins/codex");
  expect(isStableTag(source.ref ?? "")).toBe(true);
  expect(source.sha).toMatch(/^[0-9a-f]{40}$/);
});

test("codex is optional: no plugin lists it as a dependency (born green — regression guard)", () => {
  const manifests = readdirSync(join(root, "plugins"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, "plugins", e.name, ".claude-plugin", "plugin.json"))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")) as { dependencies?: string[] });
  expect(manifests.length).toBeGreaterThan(0);
  for (const manifest of manifests) {
    expect(manifest.dependencies ?? []).not.toContain("codex");
  }
});

test("README documents the codex re-export as optional", () => {
  const lines = readFileSync(join(root, "README.md"), "utf8").split("\n");
  expect(
    lines.some((l) => /`codex`/.test(l) && /optional/i.test(l)),
  ).toBe(true);
});
