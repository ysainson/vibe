#!/usr/bin/env bun
/**
 * Manage the pinned third-party re-exports in .claude-plugin/marketplace.json.
 *
 * The marketplace re-exports external skills (superpowers, swiftui-expert, the
 * vibe-expo upstreams, ...) as github or git-subdir sources pinned by ref + sha.
 * Most pins track a stable semver tag; a few tagless upstreams are pinned to a
 * branch head (ref: "main") instead — for those there is no "latest tag" to bump
 * to, so this tool only ever reports branch-head drift, informationally. Plugins
 * depend on these by bare name, so bumping a pin here updates every dependent
 * automatically.
 *
 *   bun tools/pins.ts              interactive: report status, pick which tag pins to update
 *   bun tools/pins.ts --dry-run    report status only, change nothing
 *   bun tools/pins.ts --yes        non-interactive: bump every out-of-date tag pin
 *
 * Fails closed: exits 1 (even under --dry-run) if any pin's upstream could not be
 * reached, or a tag pin's upstream has no stable tags. Branch-head drift alone is
 * exit 0 — it's informational; re-pinning a branch pin is a deliberate manual act
 * this tool never does on its own.
 *
 * Needs `gh` authenticated to read upstream tags/commits.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as p from "@clack/prompts";

import { normalize } from "./version";

export type Reexport = {
  name: string;
  repo: string;
  ref: string;
  sha: string;
  kind: "github" | "git-subdir";
  path?: string;
};

/** Extract the re-exported (github or git-subdir), pinned plugin entries from a marketplace manifest. */
export function parseReexports(marketplace: { plugins?: unknown[] }): Reexport[] {
  const out: Reexport[] = [];
  for (const entry of marketplace.plugins ?? []) {
    const e = entry as { name?: string; source?: unknown };
    const s = e.source as
      | { source?: string; repo?: string; url?: string; path?: string; ref?: string; sha?: string }
      | undefined;
    if (!s || typeof s !== "object") {
      continue;
    }
    if (s.source === "github") {
      out.push({ name: e.name ?? "", repo: s.repo ?? "", ref: s.ref ?? "", sha: s.sha ?? "", kind: "github" });
    } else if (s.source === "git-subdir") {
      out.push({
        name: e.name ?? "",
        repo: s.url ?? "",
        ref: s.ref ?? "",
        sha: s.sha ?? "",
        kind: "git-subdir",
        path: s.path,
      });
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

/** A plain version tag (v6.0.3, 4.0.0) — not a pre-release/build like v1.0.0-rc1 or 2.0.0+build. */
export function isStableTag(tag: string): boolean {
  return /^v?\d+\.\d+(\.\d+)?$/.test(tag);
}

/** A pin whose ref is not a stable tag is pinned to a branch head (e.g. "main"), not a version. */
export function isBranchPin(ref: string): boolean {
  return !isStableTag(ref);
}

/**
 * Highest stable semver tag (and its sha) from a flat tag list, ignoring pre-releases.
 * The /tags API returns tags in rough ref order, not semver, so the newest can sit
 * anywhere in the list — never assume it's first.
 */
export function pickLatestStable(
  tags: { tag: string; sha: string }[],
): { tag: string; sha: string } | null {
  let best: { tag: string; sha: string } | null = null;
  for (const t of tags) {
    if (!isStableTag(t.tag)) {
      continue;
    }
    if (!best || tagIsNewer(t.tag, best.tag)) {
      best = t;
    }
  }
  return best;
}

/** What a pin's upstream reported: a tag pin's latest stable tag, a branch pin's head sha, or a failure. */
export type Upstream =
  | { kind: "latest-tag"; tag: string; sha: string }
  | { kind: "branch-head"; sha: string }
  | { kind: "unreachable" }
  | { kind: "no-stable-tags" };

/** One pin's status against the marketplace, derived from the pin + what upstream reported. */
export type PinReport =
  | { status: "current" }
  | { status: "behind"; latest: { tag: string; sha: string } }
  | { status: "drift"; headSha: string }
  | { status: "unreachable" }
  | { status: "no-stable-tags" };

/**
 * A tag pin behind the latest stable tag is `behind` — the only auto-bumpable state.
 * A branch pin whose head moved is `drift` — informational, never auto-bumped.
 */
export function reportPin(pin: Reexport, upstream: Upstream): PinReport {
  switch (upstream.kind) {
    case "unreachable":
      return { status: "unreachable" };
    case "no-stable-tags":
      return { status: "no-stable-tags" };
    case "latest-tag":
      return tagIsNewer(upstream.tag, pin.ref)
        ? { status: "behind", latest: { tag: upstream.tag, sha: upstream.sha } }
        : { status: "current" };
    case "branch-head":
      return upstream.sha === pin.sha ? { status: "current" } : { status: "drift", headSha: upstream.sha };
  }
}

// --- IO + interactive flow (only runs when invoked directly) ---

type Row = Reexport & { report: PinReport };
type BehindRow = Reexport & { report: Extract<PinReport, { status: "behind" }> };

const ROOT = join(import.meta.dir, "..");
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");

/** What upstream reports for a single pin: latest stable tag for a tag pin, head sha for a branch pin. */
function fetchUpstream(pin: Reexport): Upstream {
  if (isBranchPin(pin.ref)) {
    const r = spawnSync("gh", ["api", `repos/${pin.repo}/commits/${pin.ref}`, "--jq", ".sha"], { encoding: "utf8" });
    if (r.status !== 0) {
      return { kind: "unreachable" };
    }
    return { kind: "branch-head", sha: (r.stdout || "").trim() };
  }
  // --paginate + per_page=100: the /tags endpoint returns at most 30 per page in
  // rough ref order (not semver), so a single page can silently miss the newest tag
  // once a repo has many tags. Fetch them all, then pick the highest stable one.
  const r = spawnSync(
    "gh",
    ["api", "--paginate", `repos/${pin.repo}/tags?per_page=100`, "--jq", '.[] | "\\(.name) \\(.commit.sha)"'],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    return { kind: "unreachable" };
  }
  const tags = (r.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [tag, sha] = line.split(" ");
      return { tag, sha };
    });
  const latest = pickLatestStable(tags);
  return latest ? { kind: "latest-tag", tag: latest.tag, sha: latest.sha } : { kind: "no-stable-tags" };
}

/** One human-readable status line for a pin's report. */
function formatRow(r: Row): string {
  switch (r.report.status) {
    case "current":
      return `${r.name}: ${r.ref}  up to date`;
    case "behind":
      return `${r.name}: ${r.ref}  -> ${r.report.latest.tag} available`;
    case "drift":
      return `${r.name}: ${r.ref}  branch-head drift (informational): ${r.report.headSha.slice(0, 7)}`;
    case "unreachable":
      return `${r.name}: ${r.ref}  (could not reach upstream)`;
    case "no-stable-tags":
      return `${r.name}: ${r.ref}  (no stable tags upstream)`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const YES = args.includes("--yes") || args.includes("-y");

  p.intro(DRY_RUN ? "VIBE pins (dry run)" : "VIBE pins");

  const manifest = JSON.parse(readFileSync(MARKETPLACE, "utf8")) as { plugins: Record<string, unknown>[] };
  const reexports = parseReexports(manifest);

  const s = p.spinner();
  s.start("Checking upstream");
  const rows: Row[] = reexports.map((r) => ({ ...r, report: reportPin(r, fetchUpstream(r)) }));
  s.stop("Checked upstream.");

  p.note(rows.map(formatRow).join("\n"), "Pinned re-exports");

  // Fail closed: a stale/broken pin must not report exit 0, even under --dry-run.
  const unreachable = rows.filter((r) => r.report.status === "unreachable");
  const noStableTags = rows.filter((r) => r.report.status === "no-stable-tags");
  if (unreachable.length > 0 || noStableTags.length > 0) {
    const causes: string[] = [];
    if (unreachable.length > 0) {
      causes.push(`could not reach upstream: ${unreachable.map((r) => r.name).join(", ")}`);
    }
    if (noStableTags.length > 0) {
      causes.push(`no stable tags upstream: ${noStableTags.map((r) => r.name).join(", ")}`);
    }
    p.cancel(causes.join("\n"));
    process.exit(1);
  }

  // Branch pins only ever report current/drift, never behind — drift is informational
  // and is never offered here or auto-bumped by --yes.
  const behind = rows.filter((r): r is BehindRow => r.report.status === "behind");

  const drifting = rows.filter((r) => r.report.status === "drift").length;
  if (behind.length === 0) {
    p.outro(
      drifting === 0
        ? "All pins current."
        : `No tag updates; ${drifting} branch pin(s) drifting (informational).`,
    );
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
        label: `${r.name}: ${r.ref} -> ${r.report.latest.tag}`,
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
    source.ref = r.report.latest.tag;
    source.sha = r.report.latest.sha;
  }
  writeFileSync(MARKETPLACE, `${JSON.stringify(manifest, null, 2)}\n`);

  const validate = spawnSync("claude", ["plugin", "validate", ".", "--strict"], {
    cwd: ROOT,
    encoding: "utf8",
  });

  p.note(
    toUpdate.map((r) => `${r.name} -> ${r.report.latest.tag} (${r.report.latest.sha.slice(0, 7)})`).join("\n"),
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
