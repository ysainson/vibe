#!/usr/bin/env bun
/**
 * Per-plugin release for the VIBE marketplace.
 *
 * Reads a plugin's plugin.json, picks the next version from its conventional
 * commits since the last `{plugin-name}--v*` tag, writes it back, tags the
 * release via `claude plugin tag` (which validates plugin.json <-> marketplace
 * agreement and a clean tree), and publishes a GitHub Release.
 *
 *   bun tools/release.ts                         interactive: pick the plugin, then the bump
 *   bun tools/release.ts <plugin-dir>            interactive: pick the bump, confirm
 *   bun tools/release.ts <plugin-dir> --dry-run  show the plan, change nothing
 *   bun tools/release.ts <plugin-dir> --yes      non-interactive (CI): ship the suggested bump
 *
 * Versions live in each plugin's plugin.json; the tag scheme is
 * {plugin-name}--v{version}. The version math + notes are the tested pure
 * functions in version.ts / notes.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";

import { bumpVersion, detectBump, normalize, type BumpLevel } from "./version";
import { releaseNotes } from "./notes";
import { releaseLogArgs } from "./release-log";

const ROOT = join(import.meta.dir, "..");

/** Run a command, capture trimmed stdout; "" on non-zero exit. */
function capture(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

/** Run a command, capture output, throw with stderr on non-zero exit (keeps the clack UI clean). */
function exec(cmd: string, cmdArgs: string[]): string {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} failed:\n${r.stderr || r.stdout || ""}`);
  }
  return (r.stdout || "").trim();
}

/** Plugin dirs under plugins/ that carry a manifest, for the interactive picker. */
function discoverPlugins(): { dir: string; name: string; version: string }[] {
  const root = join(ROOT, "plugins");
  if (!existsSync(root)) {
    return [];
  }
  const out: { dir: string; name: string; version: string }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = join(root, entry.name, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string; version?: string };
    out.push({
      dir: `plugins/${entry.name}`,
      name: m.name ?? entry.name,
      version: normalize(m.version ?? "0.0.0"),
    });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const YES = args.includes("--yes") || args.includes("-y");
  let pluginDir = args.find((a) => !a.startsWith("-"));

  p.intro(DRY_RUN ? "VIBE release (dry run)" : "VIBE release");

  if (!pluginDir) {
    // No plugin named — prompt for it. In CI (--yes) or a non-interactive shell
    // there's nothing to prompt on, so show usage and stop.
    if (YES || !process.stdin.isTTY) {
      p.cancel("usage: bun tools/release.ts <plugin-dir> [--dry-run] [--yes]");
      process.exit(1);
    }
    const plugins = discoverPlugins();
    if (plugins.length === 0) {
      p.cancel("No plugins found under plugins/.");
      process.exit(1);
    }
    const picked = await p.select({
      message: "Which plugin do you want to release?",
      options: plugins.map((pl) => ({
        value: pl.dir,
        label: `${pl.name}  v${pl.version}`,
        hint: pl.dir,
      })),
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    pluginDir = picked;
  }

  const manifestPath = join(ROOT, pluginDir, ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name: string; version?: string };
  const name = manifest.name;
  const currentVersion = normalize(manifest.version ?? "0.0.0");

  const latestTag =
    capture("git", ["tag", "-l", `${name}--v*`, "--sort=-v:refname"]).split("\n").filter(Boolean)[0] ?? "";
  const latestVersion = latestTag ? latestTag.slice(`${name}--v`.length) : "";

  const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
  const log = capture("git", releaseLogArgs(range, pluginDir));
  const messages = log ? log.split("\n").filter(Boolean) : [];

  p.note(
    messages.length ? messages.map((m) => `  ${m}`).join("\n") : "  (none)",
    `${messages.length} commit(s) since ${latestTag || "the beginning"}`,
  );

  const base = latestTag ? latestVersion : currentVersion;
  const detected = detectBump(messages);
  // First release ships the plugin.json version as-is; later releases bump from the tag.
  let target = latestTag ? bumpVersion(base, detected) : currentVersion;

  if (!DRY_RUN && !YES) {
    type Choice = BumpLevel | "current";
    const levels: BumpLevel[] = ["patch", "minor", "major"];
    const options: { value: Choice; label: string }[] = levels.map((l) => ({
      value: l,
      label: `${l} -> v${bumpVersion(base, l)}${detected === l && latestTag ? "  (suggested)" : ""}`,
    }));
    if (!latestTag) {
      options.unshift({ value: "current", label: `v${currentVersion}  (ship as-is)` });
    }
    const picked = await p.select<Choice>({
      message: `What kind of release is this? (current v${base})`,
      options,
      initialValue: latestTag ? detected : "current",
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    target = picked === "current" ? currentVersion : bumpVersion(base, picked);
  }

  const tag = `${name}--v${target}`;
  const notes = releaseNotes(messages);
  p.note(`${tag}\n\n${notes}`, "Release preview");

  if (DRY_RUN) {
    p.outro(`Dry run — would ship ${name} as ${tag}. Re-run without --dry-run to publish.`);
    return;
  }

  if (!YES) {
    const ok = await p.confirm({ message: `Publish ${tag}? Tags the commit and creates the GitHub Release.` });
    if (p.isCancel(ok) || !ok) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
  }

  if (capture("git", ["status", "--porcelain"])) {
    p.cancel("Working tree is dirty — commit or stash first.");
    process.exit(1);
  }

  const hasRemote = Boolean(capture("git", ["remote"]));

  if (target !== manifest.version) {
    manifest.version = target;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    exec("git", ["add", manifestPath]);
    exec("git", ["commit", "-m", `chore(release): ${tag}`]);
    p.log.success(`Bumped ${name} to ${target}.`);
  }

  // Validate plugin.json <-> marketplace agreement + clean tree and create the
  // {name}--v{version} tag LOCALLY first, so a validation failure can't leave a
  // pushed bump commit behind on the remote.
  exec("claude", ["plugin", "tag", pluginDir]);
  p.log.success(`Tagged ${tag}.`);

  if (hasRemote) {
    exec("git", ["push", "origin", "HEAD"]);
    exec("git", ["push", "origin", tag]);
    p.log.success("Pushed commit and tag.");

    const gh = spawnSync("gh", ["release", "create", tag, "--title", tag, "--notes", notes], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (gh.status !== 0) {
      p.cancel(`Tag ${tag} pushed, but \`gh release create\` failed (is gh authenticated?).`);
      process.exit(1);
    }
  }

  p.outro(`Shipped ${tag}${hasRemote ? "" : " (local tag only - no git remote)"}.`);
}

if (import.meta.main) {
  main().catch((e) => {
    p.cancel((e as Error).message);
    process.exit(1);
  });
}
