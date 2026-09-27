#!/usr/bin/env node
/**
 * `/vibe:init`'s script (spec section B): detects the installed runtimes and
 * bridge companions, writes the user or project routing file, runs the
 * bridge-install commands still needed (or just prints them under
 * `--dry-run`), ensures the Codex `[agents]` thread cap, and shows the
 * resolved routing plus bridge readiness.
 *
 * Plain node ESM, zero dependencies — reads/writes only the routing file at
 * the given scope, `~/.claude/plugins/installed_plugins.json` (read-only),
 * and (for `agents-cap`) `~/.codex/config.toml`. Never writes
 * `network_access` anywhere.
 *
 *   node init.mjs detect --host claude|codex [--json]
 *   node init.mjs write --host claude|codex --scope user|project [--cwd <dir>] [--home <dir>]
 *                        [--profile <p>] [--set role=runtime[:model[:effort]]]...
 *                        [--egress <provider>=<class>[,<class>]]...
 *                        [--project-install <cmd>] [--project-test <cmd>]
 *                        [--project-disposable <a,b>] --yes
 *   node init.mjs bridges --host claude|codex [--yes] [--dry-run]
 *                        (third-party plugin installs only run with --yes; otherwise, like
 *                        --dry-run, the commands are only printed)
 *   node init.mjs show --host claude|codex [--cwd <dir>]
 *   node init.mjs agents-cap --max-parallel <n> [--codex-config <path>]
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULTS,
  RoutingError,
  formatMarkdown,
  loadAdapters,
  loadPreset,
  parseSet,
  resolveRouting,
  validateRoutingDocument,
} from "./routing.mjs";

/**
 * JSDoc-only types — this file has no checkJs but `tools/init.test.ts`
 * imports it directly, so these are what give that import real types.
 *
 * @typedef {Object} Detection
 * @property {{ installed: boolean, version: string|null }} claude
 * @property {{ installed: boolean, version: string|null, loggedIn: boolean }} codex
 * @property {Object} bridges
 * @property {{ installed: boolean, version: string|null, installPath: string|null }|null} bridges.codexPlugin
 * @property {{ installed: boolean, version: string|null }|null} bridges.cc
 * @property {{ installed: boolean }} bridges.superpowersCodex
 * @property {string[]} writersIntoClaudeSkills
 * @property {{ version: string }} node
 */

// Mirror the resolver's own egress vocabulary (routing.mjs's EGRESS_PROVIDERS/
// EGRESS_CLASSES aren't exported — this file validates `--egress` independently).
const EGRESS_PROVIDERS = ["openai", "anthropic"];
const EGRESS_CLASSES = ["review", "doer"];

// --- filesystem safety (shared by writeRouting and ensureAgentsCap) ---

/** Throws `RoutingError` naming `path` if it exists and is a symlink (dangling or not); absent is fine. */
function assertNoSymlink(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return; // absent — nothing to refuse
  }
  if (stat.isSymbolicLink()) {
    throw new RoutingError(`refusing to write through a symlink: ${path}`);
  }
}

/**
 * Write `content` to `path` atomically: a sibling temp file (same directory,
 * `wx` so two concurrent writers can't collide) then `renameSync`d over the
 * target — no reader ever sees a partial write. The temp file inherits the
 * target's current mode with group/other write stripped (`& ~0o022`), or
 * `0o600` when the target is absent — never the process umask's laxer
 * default, and never wider than what was already there — and is cleaned up
 * if the rename never happens.
 */
function atomicWriteFile(path, content) {
  let mode = 0o600;
  try {
    // Never widen past the inherited mode's group/other bits, even if the
    // existing file was somehow already loose (e.g. `0o644`) — clamp them off.
    mode = statSync(path).mode & 0o777 & ~0o022;
  } catch {
    // absent — default to 0o600
  }
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  let renamed = false;
  try {
    writeFileSync(tmpPath, content, { mode, flag: "wx" });
    renameSync(tmpPath, path);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

const CC_SETUP_REMINDER = "run $cc:setup inside Codex, then restart Codex if it asks";

// --- detect ---

/** `<bin> --version`: `{ installed: false, version: null }` when the executable is missing or exits non-zero. */
function runVersion(bin, env) {
  const r = spawnSync(bin, ["--version"], { env, encoding: "utf8" });
  if (r.error || r.status !== 0) {
    return { installed: false, version: null };
  }
  return { installed: true, version: r.stdout.trim() };
}

function detectClaude(env) {
  return runVersion("claude", env);
}

function detectCodex(env) {
  const v = runVersion("codex", env);
  if (!v.installed) {
    return { installed: false, version: null, loggedIn: false };
  }
  const status = spawnSync("codex", ["login", "status"], { env, encoding: "utf8" });
  return { installed: true, version: v.version, loggedIn: status.status === 0 };
}

/** The `codex@…` entry's install (first one) from `<home>/.claude/plugins/installed_plugins.json`, or `null`. */
function detectCodexPlugin(home) {
  let raw;
  try {
    raw = readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8");
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const plugins = data.plugins ?? {};
  const key = Object.keys(plugins).find((k) => k.startsWith("codex@"));
  const install = key ? plugins[key]?.[0] : undefined;
  if (!install) {
    return null;
  }
  return { installed: true, version: install.version ?? null, installPath: install.installPath ?? null };
}

/** Find `pluginId` in a `codex plugin list --json` array (real shape: `{ pluginId, name, version, ... }`). */
function findPluginEntry(items, pluginId) {
  const item = items.find((it) => it && typeof it === "object" && it.pluginId === pluginId);
  return item ? { installed: true, version: item.version ?? null } : null;
}

function detectBridges(home, env, codexInstalled) {
  const codexPlugin = detectCodexPlugin(home);
  if (!codexInstalled) {
    return { codexPlugin, cc: null, superpowersCodex: { installed: false } };
  }
  const list = spawnSync("codex", ["plugin", "list", "--json"], { env, encoding: "utf8" });
  let items = [];
  if (!list.error && list.status === 0) {
    try {
      const parsed = JSON.parse(list.stdout);
      items = Array.isArray(parsed.installed) ? parsed.installed : [];
    } catch {
      items = [];
    }
  }
  const cc = findPluginEntry(items, "cc@sendbird");
  const superpowersCodex = { installed: findPluginEntry(items, "superpowers@openai-curated") !== null };
  return { codexPlugin, cc, superpowersCodex };
}

/**
 * Detect the installed runtimes, bridge companions, and tools that write
 * into `.claude/skills` — runs the CLIs found on `env`'s PATH.
 *
 * @param {{ host: string, home?: string, cwd?: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {Detection}
 */
export function detect({ host, home = homedir(), env = process.env } = {}) {
  if (host !== "claude" && host !== "codex") {
    throw new RoutingError(`--host must be "claude" or "codex" (got "${host}")`);
  }
  const claude = detectClaude(env);
  const codex = detectCodex(env);
  const bridges = detectBridges(home, env, codex.installed);
  const writersIntoClaudeSkills = existsSync(join(home, ".claude", "rules", "argent.md")) ? ["argent"] : [];
  return { claude, codex, bridges, writersIntoClaudeSkills, node: { version: process.version } };
}

/**
 * "split" when the other runtime is installed and (on a Claude host, where
 * the other runtime is Codex) logged in; "tiered" otherwise. On a Codex
 * host the other runtime is Claude, which has no login state — installed
 * is enough.
 *
 * @param {Detection} detection
 * @param {string} host
 * @returns {string}
 */
export function defaultProfile(detection, host) {
  const other = host === "claude" ? detection.codex : detection.claude;
  const ready = host === "claude" ? other.installed && other.loggedIn : other.installed;
  return ready ? "split" : "tiered";
}

// --- write ---

/** `bun.lock` / `package-lock.json` / `pnpm-lock.yaml` -> the install/test commands; else `""`/`""`. */
function detectProjectDefaults(cwd) {
  if (existsSync(join(cwd, "bun.lock"))) {
    return { install: "bun install --frozen-lockfile", test: "bun test" };
  }
  if (existsSync(join(cwd, "package-lock.json"))) {
    return { install: "npm ci", test: "npm test" };
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return { install: "pnpm install --frozen-lockfile", test: "pnpm test" };
  }
  return { install: "", test: "" };
}

// The exact strings `detectProjectDefaults` can produce for each field — a stored
// value equal to one of these (or absent/empty) is itself an old auto-detection,
// not a hand-set customization, so a re-run is free to refresh it from the
// current lockfile. Anything else (e.g. "make deps") is hand-set and is kept.
const LOCKFILE_INSTALL_DEFAULTS = new Set([
  "bun install --frozen-lockfile",
  "npm ci",
  "pnpm install --frozen-lockfile",
]);
const LOCKFILE_TEST_DEFAULTS = new Set(["bun test", "npm test", "pnpm test"]);

function looksAutoDetected(value, knownDefaults) {
  return value === undefined || value === "" || knownDefaults.has(value);
}

/**
 * The project block for a write: `existingProject`'s fields are always the
 * base. `install`/`test` are re-derived from the current lockfile only when
 * the stored value looks auto-detected (absent, empty, or exactly one of the
 * three known lockfile defaults) — a hand-set value is kept as-is.
 * `disposable_paths`/`env_passthrough`/`secret_allowlist` always inherit.
 * `--project-*` flags always win outright, over both.
 */
function buildProjectBlock({ cwd, existingProject, projectInstall, projectTest, projectDisposable }) {
  const detected = detectProjectDefaults(cwd);
  const base = existingProject ?? {};
  const installAuto = looksAutoDetected(base.install, LOCKFILE_INSTALL_DEFAULTS);
  const testAuto = looksAutoDetected(base.test, LOCKFILE_TEST_DEFAULTS);
  return {
    install: projectInstall ?? (installAuto ? detected.install : base.install),
    test: projectTest ?? (testAuto ? detected.test : base.test),
    disposable_paths: projectDisposable
      ? projectDisposable.split(",").filter(Boolean)
      : (base.disposable_paths ?? ["node_modules", ".cache"]),
    env_passthrough: base.env_passthrough ?? [],
    secret_allowlist: base.secret_allowlist ?? [],
  };
}

/**
 * Build the JSON object a `write` call would save: merges `roles`/`egress`
 * onto `existing`'s (unnamed providers/roles are preserved), and carries a
 * `project` block only at project scope. `contract-writer` is never written
 * (the pin is the preset's) and `network_access` is never written.
 *
 * @param {{ host?: string, scope: string, profile: string, roles?: Record<string, unknown>,
 *   egress?: Record<string, string[]>, project?: unknown, existing?: Record<string, any>|null }} opts
 * @returns {Record<string, unknown>}
 */
export function buildRoutingFile({ scope, profile, roles = {}, egress = {}, project = null, existing = null }) {
  const mergedRoles = { ...(existing?.roles ?? {}), ...roles };
  delete mergedRoles["contract-writer"];
  const file = {
    version: 1,
    profile,
    max_parallel: existing?.max_parallel ?? DEFAULTS.max_parallel,
    task_budget_minutes: existing?.task_budget_minutes ?? DEFAULTS.task_budget_minutes,
    task_idle_minutes: existing?.task_idle_minutes ?? DEFAULTS.task_idle_minutes,
    egress: { ...(existing?.egress ?? {}), ...egress },
    roles: mergedRoles,
  };
  if (scope === "project") {
    file.project = project ?? {
      install: "",
      test: "",
      disposable_paths: ["node_modules", ".cache"],
      env_passthrough: [],
      secret_allowlist: [],
    };
  }
  return file;
}

/** Parse one `--egress provider=class[,class]` argument, validating provider/classes. */
function parseEgressArg(raw) {
  const eq = raw.indexOf("=");
  const provider = eq === -1 ? raw : raw.slice(0, eq);
  if (!EGRESS_PROVIDERS.includes(provider)) {
    throw new RoutingError(`invalid --egress "${raw}": unknown provider "${provider}"`);
  }
  const classes = eq === -1 ? [] : raw.slice(eq + 1).split(",").filter(Boolean);
  if (classes.length === 0 || classes.some((c) => !EGRESS_CLASSES.includes(c))) {
    throw new RoutingError(`invalid --egress "${raw}": classes must be "review" or "doer"`);
  }
  return { provider, classes };
}

/**
 * Read+parse an existing routing file: `null` when absent (ENOENT) — any
 * other read/parse failure is a `RoutingError` naming the path, never
 * silently treated as "no file".
 */
function readExistingRouting(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return null;
    }
    throw new RoutingError(`cannot read ${path}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Never echo the parser's message — it can quote back bytes of the file
    // (which, e.g. through a symlink, may not even be a routing file at all).
    throw new RoutingError(`routing file ${path}: invalid JSON`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new RoutingError(`routing file ${path}: must be a JSON object`);
  }
  return data;
}

/**
 * Read a config file's text: `""` when absent (ENOENT) — any other read
 * failure is a `RoutingError` naming the path.
 */
function readConfigText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return "";
    }
    throw new RoutingError(`cannot read ${path}: ${e.message}`);
  }
}

/**
 * Write the user- or project-scope routing file, merging onto whatever is
 * already there. Returns the path written.
 *
 * @param {{ host: "claude"|"codex", scope: "user"|"project", cwd?: string, home?: string, profile?: string,
 *   sets?: string[], egress?: string[], projectInstall?: string, projectTest?: string,
 *   projectDisposable?: string }} opts
 * @returns {string}
 */
export function writeRouting({
  host,
  scope,
  cwd = process.cwd(),
  home = homedir(),
  profile,
  sets = [],
  egress = [],
  projectInstall,
  projectTest,
  projectDisposable,
} = {}) {
  if (host !== "claude" && host !== "codex") {
    throw new RoutingError(`--host must be "claude" or "codex" (got "${host}")`);
  }
  if (scope !== "user" && scope !== "project") {
    throw new RoutingError(`--scope must be "user" or "project" (got "${scope}")`);
  }

  const scopeRoot = scope === "user" ? home : cwd;
  const targetPath = join(scopeRoot, ".agents", "vibe", "routing.json");
  // A hostile clone (or a symlinked container under the scope root) must never let a write
  // land somewhere else — check every component from the scope root down, including a
  // dangling symlink, before anything is read or written.
  assertNoSymlink(join(scopeRoot, ".agents"));
  assertNoSymlink(join(scopeRoot, ".agents", "vibe"));
  assertNoSymlink(targetPath);
  const existing = readExistingRouting(targetPath);

  const resolvedProfile =
    profile ?? existing?.profile ?? defaultProfile(detect({ host, home, cwd, env: process.env }), host);
  loadPreset(resolvedProfile); // validates the name; throws RoutingError on an unknown preset

  const roles = {};
  for (const raw of sets) {
    const parsed = parseSet(raw);
    if (parsed.kind !== "role") {
      throw new RoutingError(`invalid --set "${raw}": write only accepts role=runtime[:model[:effort]]`);
    }
    if (parsed.role === "contract-writer") {
      continue; // never written — the pin is the preset's
    }
    roles[parsed.role] = parsed.entry;
  }

  const egressObj = {};
  for (const raw of egress) {
    const { provider, classes } = parseEgressArg(raw);
    egressObj[provider] = classes;
  }

  let project;
  if (scope === "project") {
    project = buildProjectBlock({
      cwd,
      existingProject: existing?.project ?? null,
      projectInstall,
      projectTest,
      projectDisposable,
    });
  }

  const file = buildRoutingFile({ scope, profile: resolvedProfile, roles, egress: egressObj, project, existing });
  // Carry through any top-level key this tool doesn't know about — `file`'s known
  // keys still win (it's always the second, higher-precedence spread).
  const output = { ...(existing ?? {}), ...file };
  if (scope === "user") {
    delete output.project; // never valid at user scope — the resolver rejects it there
  }
  // Never persist a document the resolver itself would refuse (an out-of-range knob, an
  // oversized project list, a dash-led "model" smuggling a CLI flag, an unknown runtime,
  // ...) — a bad value written here means every SessionStart hook fails from then on.
  validateRoutingDocument(output, { allowProject: scope === "project", context: `routing file ${targetPath}` });

  // Re-check the two container components right before touching the filesystem — the first
  // check (above) closes the common case, but this closes the TOCTOU window between it and
  // the mkdir/write below.
  assertNoSymlink(join(scopeRoot, ".agents"));
  assertNoSymlink(join(scopeRoot, ".agents", "vibe"));

  mkdirSync(dirname(targetPath), { recursive: true });
  atomicWriteFile(targetPath, `${JSON.stringify(output, null, 2)}\n`);
  return targetPath;
}

// --- bridges ---

/**
 * The exact shell commands still needed to bridge this host to the other
 * runtime, in order — `[]` when nothing is missing.
 *
 * @param {Detection} detection
 * @param {string} host
 * @param {Record<string, any>} pin the `cc-companion` row from `loadAdapters()`
 * @returns {string[]}
 */
export function bridgeCommands(detection, host, pin) {
  if (host === "claude") {
    return detection.bridges.codexPlugin === null ? ["claude plugin install codex@ysainson"] : [];
  }
  const commands = [];
  if (detection.bridges.cc === null) {
    if (!pin || !pin.marketplace) {
      throw new RoutingError(
        'bridgeCommands: adapters.json is missing the "cc-companion" row (or its "marketplace" field)',
      );
    }
    commands.push(`codex plugin marketplace add ${pin.marketplace.repo} --ref ${pin.marketplace.sha}`);
    commands.push("codex plugin add cc@sendbird");
  }
  if (!detection.bridges.superpowersCodex.installed) {
    commands.push("codex plugin add superpowers@openai-curated");
  }
  if (commands.length > 0) {
    commands.push(CC_SETUP_REMINDER);
  }
  return commands;
}

/** `detect()` plus the missing bridge commands for that host — shared by the `bridges` and `show` CLI cases. */
function missingBridges({ host, home, cwd, env }) {
  const detection = detect({ host, home, cwd, env });
  const pin = loadAdapters()["cc-companion"];
  return { detection, commands: bridgeCommands(detection, host, pin) };
}

/** Run one bridge command line (`bin arg arg...`, no quoting needed — every generated command is plain tokens). */
function runBridgeCommand(line, env) {
  const [bin, ...cmdArgs] = line.split(" ");
  return spawnSync(bin, cmdArgs, { env, encoding: "utf8" });
}

// --- agents-cap ---

/**
 * Ensure the Codex `[agents]` thread cap: appends the table when absent
 * (plain node has no TOML round-trip so an existing table is left
 * untouched and its exact lines are handed back to print). A fresh (absent
 * or empty) config starts directly at `[agents]`; an existing non-empty
 * config gets a blank-line-separated `[agents]` block appended. The write
 * itself goes to a sibling temp file and `renameSync`s over the target
 * (atomic — no reader ever sees a half-written config), and refuses
 * outright when the target path is a symlink.
 *
 * @param {{ codexConfigPath: string, maxParallel: number }} opts
 * @returns {{ action: "appended"|"print", lines: string[] }}
 */
export function ensureAgentsCap({ codexConfigPath, maxParallel }) {
  const content = readConfigText(codexConfigPath);
  const cap = maxParallel + 3;
  const lines = ["[agents]", `max_concurrent_threads_per_session = ${cap}`];
  const hasSection = content.split("\n").some((raw) => raw.trim() === "[agents]");
  if (hasSection) {
    return { action: "print", lines };
  }
  assertNoSymlink(codexConfigPath);
  mkdirSync(dirname(codexConfigPath), { recursive: true });
  const body = content === "" ? `${lines.join("\n")}\n` : `${content}\n${lines.join("\n")}\n`;
  atomicWriteFile(codexConfigPath, body);
  return { action: "appended", lines };
}

// --- show ---

function formatDetect(d) {
  const lines = [
    `claude: ${d.claude.installed ? d.claude.version : "not installed"}`,
    `codex: ${d.codex.installed ? `${d.codex.version} (logged in: ${d.codex.loggedIn})` : "not installed"}`,
    `bridges.codexPlugin: ${d.bridges.codexPlugin ? (d.bridges.codexPlugin.version ?? "unknown") : "missing"}`,
    `bridges.cc: ${d.bridges.cc ? "installed" : "missing"}`,
    `bridges.superpowersCodex: ${d.bridges.superpowersCodex.installed ? "installed" : "missing"}`,
    `writers into .claude/skills: ${d.writersIntoClaudeSkills.join(", ") || "none"}`,
    `node: ${d.node.version}`,
  ];
  return `${lines.join("\n")}\n`;
}

function printShow({ host, cwd, home }) {
  const resolved = resolveRouting({ host, cwd, home });
  process.stdout.write(formatMarkdown(resolved));
  const { detection, commands } = missingBridges({ host, home, cwd, env: process.env });
  process.stdout.write(
    commands.length === 0 ? "bridges: ready\n" : `bridges: missing\n${commands.map((l) => `  ${l}`).join("\n")}\n`,
  );
  if (host === "codex") {
    process.stdout.write("hook-trust: approve this plugin's hooks in Codex if it prompts you\n");
  }
  process.stdout.write(`writers into .claude/skills: ${detection.writersIntoClaudeSkills.join(", ") || "none"}\n`);
}

// --- CLI ---

function parseArgs(argv) {
  const args = { sets: [], egress: [] };
  let i = 0;
  // A value-taking flag with nothing after it (the last argument) is a
  // RoutingError, never `undefined` silently flowing into `args` — that would
  // otherwise surface later as a bogus fallback (e.g. `--home` defaulting to
  // the real home dir) or a raw TypeError.
  const requireValue = (flag) => {
    i += 1;
    if (i >= argv.length) {
      throw new RoutingError(`${flag} requires a value`);
    }
    return argv[i];
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--host":
        args.host = requireValue(a);
        break;
      case "--scope":
        args.scope = requireValue(a);
        break;
      case "--cwd":
        args.cwd = requireValue(a);
        break;
      case "--home":
        args.home = requireValue(a);
        break;
      case "--profile":
        args.profile = requireValue(a);
        break;
      case "--set":
        args.sets.push(requireValue(a));
        break;
      case "--egress":
        args.egress.push(requireValue(a));
        break;
      case "--project-install":
        args.projectInstall = requireValue(a);
        break;
      case "--project-test":
        args.projectTest = requireValue(a);
        break;
      case "--project-disposable":
        args.projectDisposable = requireValue(a);
        break;
      case "--yes":
        args.yes = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--max-parallel":
        args.maxParallel = requireValue(a); // raw string — agents-cap parses it
        break;
      case "--codex-config":
        args.codexConfig = requireValue(a);
        break;
      default:
        throw new RoutingError(`unknown argument "${a}"`);
    }
  }
  return args;
}

function requireHost(args) {
  if (!args.host) {
    throw new RoutingError("--host is required");
  }
}

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  try {
    const args = parseArgs(rest);
    switch (sub) {
      case "detect": {
        requireHost(args);
        const d = detect({ host: args.host, home: args.home, cwd: args.cwd, env: process.env });
        process.stdout.write(args.json ? `${JSON.stringify(d)}\n` : formatDetect(d));
        break;
      }
      case "write": {
        requireHost(args);
        if (!args.scope) {
          throw new RoutingError("--scope is required");
        }
        if (!args.yes) {
          throw new RoutingError("write requires --yes");
        }
        const path = writeRouting({
          host: args.host,
          scope: args.scope,
          cwd: args.cwd,
          home: args.home,
          profile: args.profile,
          sets: args.sets,
          egress: args.egress,
          projectInstall: args.projectInstall,
          projectTest: args.projectTest,
          projectDisposable: args.projectDisposable,
        });
        process.stdout.write(`wrote ${path}\n`);
        break;
      }
      case "bridges": {
        requireHost(args);
        const { commands } = missingBridges({ host: args.host, home: args.home, cwd: args.cwd, env: process.env });
        // --dry-run always wins; otherwise these are third-party plugin installs, so they only
        // run with an explicit --yes. Either way stdout is exactly the command lines — a
        // "pass --yes to run" hint, when one is warranted, goes to stderr instead.
        const execute = args.yes && !args.dryRun;
        for (const line of commands) {
          process.stdout.write(`${line}\n`);
          if (!execute || line === CC_SETUP_REMINDER) {
            continue;
          }
          const result = runBridgeCommand(line, process.env);
          if (result.error || result.status !== 0) {
            const stderr = (result.stderr || "").trim();
            const detail = result.error
              ? result.error.message
              : `exit ${result.status}${stderr ? `: ${stderr}` : ""}`;
            throw new RoutingError(`bridges: "${line}" failed (${detail})`);
          }
        }
        if (!execute && commands.some((line) => line !== CC_SETUP_REMINDER) && !args.dryRun) {
          process.stderr.write("pass --yes to run these commands\n");
        }
        break;
      }
      case "show": {
        requireHost(args);
        printShow({ host: args.host, cwd: args.cwd, home: args.home });
        break;
      }
      case "agents-cap": {
        if (args.maxParallel === undefined) {
          throw new RoutingError("--max-parallel is required");
        }
        const maxParallel = Number(args.maxParallel);
        if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 32) {
          throw new RoutingError(`--max-parallel must be an integer from 1 to 32 (got "${args.maxParallel}")`);
        }
        const codexConfigPath = args.codexConfig ?? join(homedir(), ".codex", "config.toml");
        const result = ensureAgentsCap({ codexConfigPath, maxParallel });
        process.stdout.write(
          result.action === "appended" ? `appended to ${codexConfigPath}\n` : `${result.lines.join("\n")}\n`,
        );
        break;
      }
      default:
        throw new RoutingError(`unknown command "${sub}"`);
    }
  } catch (e) {
    if (e instanceof RoutingError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

// `import.meta.url` is realpath-resolved by node but `process.argv[1]` is the
// literal invocation string — compare against its realpath too, so the CLI
// still runs when invoked through a symlinked plugin root.
function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
