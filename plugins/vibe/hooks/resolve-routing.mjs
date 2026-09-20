#!/usr/bin/env node
/**
 * The Claude Code SessionStart hook (spec section A "Session injection").
 *
 * Resolves the routing table for `--host` and prints exactly one JSON line:
 * the nested `hookSpecificOutput` envelope Claude Code expects from a
 * SessionStart hook, with `additionalContext` holding the `<VIBE_ROUTING>`
 * markdown block from `formatMarkdown`. Every failure — a `RoutingError` or
 * anything else — is folded into that block instead of failing the process
 * (exit 0): a `RoutingError` becomes `error="routing"` with its message; any
 * other exception becomes `error="internal"` with its message. A routing
 * mistake must never break session start.
 *
 * Also guards the reaper: when `scripts/runtime-job.mjs` exists next to this
 * plugin (and this process isn't itself a spawned runtime job), it fires a
 * detached `reap` pass over `~/.agents/vibe/jobs` and forgets about it —
 * nothing from that child reaches this hook's stdout/stderr. The script is
 * optional and the reaper is skipped when it's absent.
 *
 *   node resolve-routing.mjs --host claude|codex
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRouting, formatMarkdown, RoutingError } from "../scripts/routing.mjs";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));

/** `--host` from argv only — never an environment variable. */
function parseHost(argv) {
  const i = argv.indexOf("--host");
  return i === -1 ? undefined : argv[i + 1];
}

/** Spawn the phase 2 reaper, detached and silent, when its script exists and we're not already inside one. */
function maybeSpawnReaper() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.env.PLUGIN_ROOT ?? dirname(HOOK_DIR);
  const job = join(pluginRoot, "scripts", "runtime-job.mjs");
  if (process.env.VIBE_RUNTIME_JOB === "1" || !existsSync(job)) {
    return;
  }
  const jobsDir = join(homedir(), ".agents", "vibe", "jobs");
  const child = spawn(process.execPath, [job, "reap", "--dir", jobsDir], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function main() {
  const host = parseHost(process.argv.slice(2));
  if (host !== "claude" && host !== "codex") {
    process.stderr.write('--host must be "claude" or "codex"\n');
    process.exit(2);
  }

  maybeSpawnReaper();

  let additionalContext;
  try {
    additionalContext = formatMarkdown(resolveRouting({ host, cwd: process.cwd(), home: homedir() }));
  } catch (e) {
    const kind = e instanceof RoutingError ? "routing" : "internal";
    additionalContext = `<VIBE_ROUTING host="${host}" error="${kind}">\n${e.message}\n</VIBE_ROUTING>\n`;
  }

  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } })}\n`,
  );
}

main();
