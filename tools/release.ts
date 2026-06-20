#!/usr/bin/env bun
/**
 * Per-plugin release for the VIBE marketplace.
 *
 * Reads a plugin's plugin.json, picks the next version from its conventional
 * commits since the last `{plugin-name}--v*` tag, writes it back, tags the
 * release via `claude plugin tag` (which validates plugin.json <-> marketplace
 * agreement and a clean tree), and publishes a GitHub Release.
 *
 * Dependency-free and flag-driven (CI-friendly):
 *   bun tools/release.ts <plugin-dir>          dry run (default): show the plan
 *   bun tools/release.ts <plugin-dir> --yes    execute: bump, commit, tag, release
 *
 * Versions live in each plugin's plugin.json; the tag scheme is
 * {plugin-name}--v{version}. The version math + notes are the tested pure
 * functions in version.ts / notes.ts.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { bumpVersion, detectBump, normalize } from "./version";
import { releaseNotes } from "./notes";

const ROOT = join(import.meta.dir, "..");
const args = process.argv.slice(2);
const EXECUTE = args.includes("--yes") || args.includes("-y");
const pluginDir = args.find((a) => !a.startsWith("-"));

if (!pluginDir) {
  console.error("usage: bun tools/release.ts <plugin-dir> [--yes]");
  process.exit(1);
}

/** Run a command, capture trimmed stdout; "" on non-zero exit. */
function capture(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

/** Run a command inheriting stdio; throw on non-zero exit. */
function exec(cmd: string, cmdArgs: string[]): void {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited ${r.status}`);
  }
}

const manifestPath = join(ROOT, pluginDir, ".claude-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  name: string;
  version?: string;
};
const name = manifest.name;
const currentVersion = normalize(manifest.version ?? "0.0.0");

const latestTag =
  capture("git", ["tag", "-l", `${name}--v*`, "--sort=-v:refname"])
    .split("\n")
    .filter(Boolean)[0] ?? "";
const latestVersion = latestTag ? latestTag.slice(`${name}--v`.length) : "";

const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
const log = capture("git", ["log", range, "--format=%s", "--no-merges"]);
const messages = log ? log.split("\n").filter(Boolean) : [];

const bump = detectBump(messages);
// First release ships the plugin.json version as-is; later releases bump from the tag.
const target = latestTag ? bumpVersion(latestVersion, bump) : currentVersion;
const tag = `${name}--v${target}`;
const notes = releaseNotes(messages);

console.log(`Plugin:   ${name}`);
console.log(
  `Current:  ${latestTag ? `${latestVersion} (tag ${latestTag})` : `${currentVersion} (no release tag yet)`}`,
);
console.log(`Commits:  ${messages.length} since ${latestTag || "the beginning"}`);
console.log(`Bump:     ${latestTag ? bump : "none (first release)"}`);
console.log(`Next:     ${target}  ->  tag ${tag}`);
console.log(`\nNotes:\n${notes}\n`);

if (!EXECUTE) {
  console.log("Dry run. Re-run with --yes to bump plugin.json, tag, and publish.");
  process.exit(0);
}

if (capture("git", ["status", "--porcelain"])) {
  console.error("Working tree is dirty — commit or stash first.");
  process.exit(1);
}

const hasRemote = Boolean(capture("git", ["remote"]));

if (target !== manifest.version) {
  manifest.version = target;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  exec("git", ["add", manifestPath]);
  exec("git", ["commit", "-m", `chore(release): ${tag}`]);
}

// Validate plugin.json <-> marketplace agreement + clean tree and create the
// {name}--v{version} tag LOCALLY first, so a validation failure can't leave a
// pushed bump commit behind on the remote.
exec("claude", ["plugin", "tag", pluginDir]);

if (hasRemote) {
  exec("git", ["push", "origin", "HEAD"]);
  exec("git", ["push", "origin", tag]);

  const gh = spawnSync(
    "gh",
    ["release", "create", tag, "--title", tag, "--notes", notes],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (gh.status !== 0) {
    console.error(`Tag ${tag} created and pushed, but \`gh release create\` failed (is gh authenticated?).`);
    process.exit(1);
  }
}

console.log(`\nShipped ${tag}${hasRemote ? "" : " (local tag only - no git remote)"}.`);
