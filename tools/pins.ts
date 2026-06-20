#!/usr/bin/env bun
/**
 * Manage the pinned third-party re-exports in .claude-plugin/marketplace.json.
 *
 * The marketplace re-exports external skills (superpowers, swiftui-expert, ...)
 * as github sources pinned by ref + sha. Pins are deliberate — nothing tracks
 * upstream `main` — so this is the one command that checks for newer upstream
 * tags and bumps the pins in one place. Plugins depend on these by bare name, so
 * bumping a pin here updates every dependent automatically.
 *
 *   bun tools/pins.ts              interactive: report drift, pick which to update
 *   bun tools/pins.ts --dry-run    report drift only, change nothing
 *   bun tools/pins.ts --yes        non-interactive: bump every out-of-date pin
 *
 * Needs `gh` authenticated to read upstream tags.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";

import { normalize } from "./version";

export type Reexport = { name: string; repo: string; ref: string; sha: string };

/** Extract the github-source (re-exported, pinned) plugin entries from a marketplace manifest. */
export function parseReexports(marketplace: { plugins?: unknown[] }): Reexport[] {
  const out: Reexport[] = [];
  for (const entry of marketplace.plugins ?? []) {
    const e = entry as { name?: string; source?: unknown };
    const s = e.source as { source?: string; repo?: string; ref?: string; sha?: string } | undefined;
    if (s && typeof s === "object" && s.source === "github") {
      out.push({ name: e.name ?? "", repo: s.repo ?? "", ref: s.ref ?? "", sha: s.sha ?? "" });
    }
  }
  return out;
}

/** True if semver tag `latest` is strictly newer than `pinned` (tolerates a leading v). */
export function tagIsNewer(latest: string, pinned: string): boolean {
  const a = normalize(latest.replace(/^v/, "")).split(".").map(Number);
  const b = normalize(pinned.replace(/^v/, "")).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
}

// --- IO + interactive flow (only runs when invoked directly) ---

type Row = Reexport & { latest: { tag: string; sha: string } | null };
type BehindRow = Reexport & { latest: { tag: string; sha: string } };

const ROOT = join(import.meta.dir, "..");
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");

/** Highest version-like tag (and its commit sha) for a GitHub repo, via gh. */
function latestTag(repo: string): { tag: string; sha: string } | null {
  const r = spawnSync(
    "gh",
    ["api", `repos/${repo}/tags`, "--jq", '.[] | "\\(.name) \\(.commit.sha)"'],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    return null;
  }
  let best: { tag: string; sha: string } | null = null;
  for (const line of (r.stdout || "").split("\n").filter(Boolean)) {
    const [tag, sha] = line.split(" ");
    if (!/^v?\d+\.\d+/.test(tag)) {
      continue;
    }
    if (!best || tagIsNewer(tag, best.tag)) {
      best = { tag, sha };
    }
  }
  return best;
}

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const YES = args.includes("--yes") || args.includes("-y");

  p.intro(DRY_RUN ? "VIBE pins (dry run)" : "VIBE pins");

  const manifest = JSON.parse(readFileSync(MARKETPLACE, "utf8")) as { plugins: Record<string, unknown>[] };
  const reexports = parseReexports(manifest);

  const s = p.spinner();
  s.start("Checking upstream tags");
  const rows: Row[] = reexports.map((r) => ({ ...r, latest: latestTag(r.repo) }));
  s.stop("Checked upstream tags.");

  p.note(
    rows
      .map((r) => {
        if (!r.latest) {
          return `${r.name}: ${r.ref}  (could not reach upstream)`;
        }
        const status = tagIsNewer(r.latest.tag, r.ref) ? `-> ${r.latest.tag} available` : "up to date";
        return `${r.name}: ${r.ref}  ${status}`;
      })
      .join("\n"),
    "Pinned re-exports",
  );

  const behind = rows.filter(
    (r): r is BehindRow => r.latest !== null && tagIsNewer(r.latest.tag, r.ref),
  );

  if (behind.length === 0) {
    p.outro("All pins current.");
    return;
  }
  if (DRY_RUN) {
    p.outro(`${behind.length} update(s) available. Re-run without --dry-run to apply.`);
    return;
  }

  let toUpdate: BehindRow[] = behind;
  if (!YES) {
    const picked = await p.multiselect({
      message: "Update which pins?",
      options: behind.map((r) => ({
        value: r.name,
        label: `${r.name}: ${r.ref} -> ${r.latest.tag}`,
        hint: r.repo,
      })),
      initialValues: behind.map((r) => r.name),
      required: false,
    });
    if (p.isCancel(picked)) {
      p.cancel("Cancelled — no changes.");
      process.exit(0);
    }
    toUpdate = behind.filter((r) => picked.includes(r.name));
  }

  if (toUpdate.length === 0) {
    p.outro("Nothing selected.");
    return;
  }

  for (const r of toUpdate) {
    const entry = manifest.plugins.find((pl) => pl.name === r.name);
    const source = entry?.source as { ref: string; sha: string };
    source.ref = r.latest.tag;
    source.sha = r.latest.sha;
  }
  writeFileSync(MARKETPLACE, `${JSON.stringify(manifest, null, 2)}\n`);

  const validate = spawnSync("claude", ["plugin", "validate", ".", "--strict"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  p.note(
    toUpdate.map((r) => `${r.name} -> ${r.latest.tag} (${r.latest.sha.slice(0, 7)})`).join("\n"),
    "Updated pins",
  );

  if (validate.status !== 0) {
    p.cancel("marketplace.json updated, but `claude plugin validate . --strict` failed — review the change.");
    process.exit(1);
  }
  p.outro(`Updated ${toUpdate.length} pin(s); validation passed. Commit marketplace.json.`);
}

if (import.meta.main) {
  main().catch((e) => {
    p.cancel((e as Error).message);
    process.exit(1);
  });
}
