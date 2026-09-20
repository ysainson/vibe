#!/usr/bin/env node
/**
 * The multi-runtime routing resolver (spec section A).
 *
 * Resolves, for a given host (`claude` or `codex`), every one of the 13 roles
 * to a runtime, model, effort, adapter, and edit mode — merging a `--set`
 * override, the project routing file, the user routing file, and the named
 * preset, highest precedence first. Also resolves the numeric run knobs
 * (`max_parallel`, `task_budget_minutes`, `task_idle_minutes`), the egress
 * acknowledgment state, the optional `project` block, and the host's
 * native-override note.
 *
 * Plain node ESM, zero dependencies — this file (and its adapters/presets)
 * is read by both the Claude and the Codex host, so it cannot assume either
 * harness's runtime.
 *
 *   node routing.mjs resolve --host claude|codex [--cwd <dir>] [--profile <p>]
 *                             [--set key=value ...] [--json|--markdown]
 */
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PRESETS_DIR = join(SCRIPT_DIR, "..", "routing", "presets");
const DEFAULT_ADAPTERS_PATH = join(SCRIPT_DIR, "..", "routing", "adapters.json");

/**
 * JSDoc-only types (this file has no checkJs, but `tools/*.ts` imports it
 * directly — these annotations are what give that import real types instead
 * of everything collapsing to `{}`).
 *
 * `runtime` is typed as plain `string` (not the `"claude"|"codex"|"host"|"cross"`
 * union it's actually restricted to) — callers build these from arbitrary JSON
 * file/`--set` input, and `validateRuntime` enforces the union at runtime.
 *
 * @typedef {{ runtime: string, model: string, effort: string }} PresetRoleEntry
 * @typedef {{ roles: Record<string, PresetRoleEntry> }} Preset
 *
 * `pin`/`sha`/`marketplace` are `[any]` (present only on the two companion
 * rows, but typed `any` rather than `string`/`object`): optional-`any` is the
 * one shape that lets both `tools/routing.test.ts` uses typecheck — comparing
 * the whole table against a literal missing these keys on the non-companion
 * rows (needs them optional) and reading `adapters[name].pin`/`.marketplace.sha`
 * for an unnarrowed `name` with no null-check (needs them non-undefined).
 *
 * @typedef {Object} AdapterRow
 * @property {string} host
 * @property {string} runtime
 * @property {string[]} [efforts]
 * @property {string} [cli]
 * @property {any} [pin]
 * @property {any} [sha]
 * @property {any} [marketplace]
 * @property {Record<string, string[]>} [paths]
 *
 * @typedef {Object} RoleResolved
 * @property {string} runtime
 * @property {"claude"|"codex"} resolvedRuntime
 * @property {string} adapter
 * @property {"task"|"review"|"adversarial-review"|null} path
 * @property {"write"|"read-only"|"workspace-write-no-edit"} mode
 * @property {string} model
 * @property {string} effort
 * @property {string} source
 *
 * @typedef {Object} ProjectBlock
 * @property {string} install
 * @property {string} test
 * @property {string[]} disposable_paths
 * @property {string[]} env_passthrough
 * @property {string[]} secret_allowlist
 *
 * @typedef {Object} EgressMissing
 * @property {string} provider
 * @property {"review"|"doer"} class
 * @property {string[]} roles
 * @property {boolean} fatal
 *
 * @typedef {Object} Resolved
 * @property {"claude"|"codex"} host
 * @property {string} profile
 * @property {string} source
 * @property {number} max_parallel
 * @property {number} task_budget_minutes
 * @property {number} task_idle_minutes
 * @property {{ profile: string, max_parallel: string, task_budget_minutes: string,
 *   task_idle_minutes: string, egress: string }} sources
 * @property {{ openai: string[], anthropic: string[] }} egress
 * @property {{ openai: string[], anthropic: string[] }} egressNeeded
 * @property {EgressMissing[]} egressMissing
 * @property {ProjectBlock|null} project
 * @property {Record<string, RoleResolved>} roles
 * @property {string} nativeOverrides
 */

/** The 13 roles, in the order the spec and the injected table both use. */
export const ROLES = [
  "doer",
  "doer-mechanical",
  "escalation",
  "exploration",
  "contract-writer",
  "reviewer-spec",
  "reviewer-quality",
  "verifier",
  "security-verifier",
  "guardians",
  "cross-check",
  "adversarial",
  "plan-check",
];

/** Roles that accept only `runtime: "cross"`. */
export const REVIEW_ROLES = ["cross-check", "adversarial", "plan-check"];

/** Roles whose adapter mode is `write` (every other role is read-only, bar one adapter-local exception). */
export const EDIT_ROLES = ["doer", "doer-mechanical", "escalation", "contract-writer"];

/** Model aliases a preset (not a routing file) may use. */
export const PRESET_MODELS = ["default", "sonnet", "haiku", "opus", "fable"];

/** Run knobs when no file sets them. */
export const DEFAULTS = { max_parallel: 3, task_budget_minutes: 30, task_idle_minutes: 10 };

const RUNTIME_VALUES = ["claude", "codex", "host", "cross"];
const NUMERIC_FIELDS = ["max_parallel", "task_budget_minutes", "task_idle_minutes"];
const EGRESS_PROVIDERS = ["openai", "anthropic"];
const EGRESS_CLASSES = ["review", "doer"];

// A model is a name (an identifier passed to a runtime), not free text.
const MODEL_PATTERN = /^[A-Za-z0-9.:-]{1,64}$/;
// A preset name is joined into a filesystem path — restrict it to a bare
// lowercase identifier so it can never traverse out of the presets dir.
const PRESET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const CLAUDE_NATIVE_OVERRIDE_NOTE =
  "claude: a dispatch model beats CLAUDE_CODE_SUBAGENT_MODEL unless CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1";

/** Raised for every user-facing routing failure — bad file, bad `--set`, bad role/runtime/effort/egress. */
export class RoutingError extends Error {
  constructor(message) {
    super(message);
    this.name = "RoutingError";
  }
}

/**
 * A role's `runtime` value against the rules that don't depend on a host:
 * the three review roles accept only `cross`, `contract-writer` accepts only
 * `claude`, and no other role may use `cross`. `context` (e.g. `preset "split"`
 * or `host "codex"`) is folded into the error message.
 */
function validateRuntime(role, runtime, context) {
  if (!RUNTIME_VALUES.includes(runtime)) {
    throw new RoutingError(`role "${role}" (${context}): invalid runtime "${runtime}"`);
  }
  if (REVIEW_ROLES.includes(role)) {
    if (runtime !== "cross") {
      throw new RoutingError(`role "${role}" (${context}): must use runtime "cross"`);
    }
  } else if (role === "contract-writer") {
    if (runtime !== "claude") {
      throw new RoutingError(`role "${role}" (${context}): must use runtime "claude"`);
    }
  } else if (runtime === "cross") {
    throw new RoutingError(`role "${role}" (${context}): may not use runtime "cross"`);
  }
}

/** A model value from a routing file (or `--set`) — a bare name, 1-64 chars of `MODEL_PATTERN`. */
function validateFileModel(role, model, context) {
  if (typeof model !== "string" || !MODEL_PATTERN.test(model)) {
    throw new RoutingError(`role "${role}" (${context}): model must match ${MODEL_PATTERN}`);
  }
}

/**
 * Make a file-derived string safe to interpolate into the `<VIBE_ROUTING>`
 * block: every value read from a routing file (or a Codex config, for a
 * hook-side caller) is untrusted and must never be able to forge a fake
 * `</VIBE_ROUTING>` close, a fake table row, or control-character noise.
 * Strips control characters, drops `<`/`>`/`|` (the block/row delimiters),
 * collapses whitespace runs, and caps the result at 120 characters. Exported
 * so `resolve-routing.mjs` (the SessionStart hook) can apply the same rule
 * to `RoutingError` messages it folds into the block.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeForBlock(text) {
  return String(text)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[<>|]/g, "")
    .replace(/ {2,}/g, " ")
    .slice(0, 120);
}

/** An `egress` block's shape: only `openai`/`anthropic` keys, only `review`/`doer` classes. */
function validateEgressAck(egress, context) {
  if (typeof egress !== "object" || egress === null || Array.isArray(egress)) {
    throw new RoutingError(`invalid egress block (${context})`);
  }
  for (const [provider, classes] of Object.entries(egress)) {
    if (!EGRESS_PROVIDERS.includes(provider)) {
      throw new RoutingError(`egress (${context}): unknown provider "${provider}"`);
    }
    if (!Array.isArray(classes) || classes.some((c) => !EGRESS_CLASSES.includes(c))) {
      throw new RoutingError(`egress.${provider} (${context}): classes must be "review" or "doer"`);
    }
  }
}

/**
 * Load and validate a preset by name: all 13 roles present, runtime shape
 * valid per role, model restricted to `PRESET_MODELS`. Returns `{ roles }`
 * with `{ runtime, model, effort }` per role, defaults filled in.
 *
 * @param {string} name
 * @param {string} [presetsDir]
 * @returns {Preset}
 */
export function loadPreset(name, presetsDir = DEFAULT_PRESETS_DIR) {
  // A preset name is joined into a filesystem path below — validate the shape
  // before that join, not after, so no `name` ever reaches it unchecked.
  if (typeof name !== "string" || !PRESET_NAME_PATTERN.test(name)) {
    const clean = sanitizeForBlock(String(name));
    throw new RoutingError(`invalid preset name "${clean}": must match ${PRESET_NAME_PATTERN}`);
  }
  const path = join(presetsDir, `${name}.json`);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new RoutingError(`preset "${name}" not found at ${path}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Path only — never the parser's message, which can echo file content.
    throw new RoutingError(`preset ${path}: invalid JSON`);
  }
  const rolesObj = data.roles;
  if (!rolesObj || typeof rolesObj !== "object") {
    throw new RoutingError(`preset "${name}": missing "roles"`);
  }
  const keys = Object.keys(rolesObj);
  if (keys.length !== ROLES.length || !ROLES.every((r) => Object.prototype.hasOwnProperty.call(rolesObj, r))) {
    throw new RoutingError(`preset "${name}": must list exactly the 13 roles`);
  }
  const roles = {};
  for (const role of ROLES) {
    const entry = rolesObj[role];
    if (!entry || typeof entry.runtime !== "string" || entry.runtime.length === 0) {
      throw new RoutingError(`preset "${name}": role "${role}" must specify runtime`);
    }
    validateRuntime(role, entry.runtime, `preset "${name}"`);
    const model = entry.model ?? "default";
    if (!PRESET_MODELS.includes(model)) {
      throw new RoutingError(
        `preset "${name}": role "${role}" model "${model}" is not one of ${PRESET_MODELS.join(", ")}`,
      );
    }
    roles[role] = { runtime: entry.runtime, model, effort: entry.effort ?? "default" };
  }
  return { roles };
}

/**
 * Load the shipped adapter table (or, for tests, one at an explicit path).
 *
 * @param {string} [path]
 * @returns {Record<string, AdapterRow>}
 */
export function loadAdapters(path = DEFAULT_ADAPTERS_PATH) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new RoutingError(`adapters table not found at ${path}: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new RoutingError(`adapters table ${path}: invalid JSON (${e.message})`);
  }
}

/**
 * Parse one raw `--set` string: `role=runtime[:model[:effort]]`, a numeric
 * top-level field (`task_budget_minutes=0`), or `profile=<name>`. Structural
 * only — the `role`/`runtime` values themselves are validated during merge,
 * where the host is known.
 *
 * @param {string} text
 * @returns {{ kind: "role", role: string, entry: PresetRoleEntry }
 *   | { kind: "field", field: string, value: number|string }}
 */
export function parseSet(text) {
  const eq = text.indexOf("=");
  if (eq <= 0) {
    throw new RoutingError(`invalid --set "${text}": expected key=value`);
  }
  const key = text.slice(0, eq);
  const value = text.slice(eq + 1);
  if (key === "profile") {
    return { kind: "field", field: "profile", value };
  }
  if (NUMERIC_FIELDS.includes(key)) {
    const num = Number(value);
    if (value === "" || !Number.isFinite(num)) {
      throw new RoutingError(`invalid --set "${text}": "${value}" is not a number`);
    }
    return { kind: "field", field: key, value: num };
  }
  if (!ROLES.includes(key)) {
    throw new RoutingError(`invalid --set "${text}": "${key}" is not a role or a known field`);
  }
  const parts = value.split(":");
  if (parts.length > 3 || parts[0] === "") {
    throw new RoutingError(`invalid --set "${text}": expected runtime[:model[:effort]]`);
  }
  const [runtime, model = "default", effort = "default"] = parts;
  return { kind: "role", role: key, entry: { runtime, model, effort } };
}

/**
 * Parse a project/user routing file: validates the `project` block is only
 * present where allowed, that any `egress` block and `roles` keys are
 * well-formed, and that any numeric knob is a finite number. Returns the
 * parsed JSON, or `null` only when the file is genuinely absent (`ENOENT`) —
 * any other read failure (permissions, a directory in its place, ...) is a
 * `RoutingError` naming the path, not a silent "no file".
 */
function loadRoutingFile(path, { allowProject }) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      return null;
    }
    throw new RoutingError(`routing file ${path}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Path only — never the parser's message, which can echo file content.
    throw new RoutingError(`routing file ${path}: invalid JSON`);
  }
  if (!allowProject && data.project !== undefined) {
    throw new RoutingError(`routing file ${path}: "project" is only allowed in the project-scope routing file`);
  }
  if (data.egress !== undefined) {
    validateEgressAck(data.egress, path);
  }
  if (data.roles !== undefined) {
    for (const role of Object.keys(data.roles)) {
      if (!ROLES.includes(role)) {
        throw new RoutingError(`routing file ${path}: unknown role "${role}"`);
      }
    }
  }
  for (const key of NUMERIC_FIELDS) {
    if (data[key] !== undefined && (typeof data[key] !== "number" || !Number.isFinite(data[key]))) {
      throw new RoutingError(`routing file ${path}: "${key}" must be a finite number`);
    }
  }
  return data;
}

/**
 * A role's `resolvedRuntime`: `host` becomes the host itself, `cross` becomes
 * the other runtime, `claude`/`codex` pass through literally.
 */
function resolveRuntimeFor(runtime, host) {
  if (runtime === "host") {
    return host;
  }
  if (runtime === "cross") {
    return host === "claude" ? "codex" : "claude";
  }
  return runtime;
}

/**
 * The adapter row (and, for companion rows, the path) for a role on a host,
 * given its resolved runtime. Review roles always land on the host's
 * companion row; every other role resolves by (host, resolvedRuntime).
 */
function adapterFor(role, host, resolvedRuntime) {
  if (REVIEW_ROLES.includes(role)) {
    const adapter = host === "claude" ? "codex-companion" : "cc-companion";
    const path = role === "cross-check" ? "review" : role === "adversarial" ? "adversarial-review" : "task";
    return { adapter, path };
  }
  if (host === "claude" && resolvedRuntime === "claude") {
    return { adapter: "claude-native", path: null };
  }
  if (host === "claude" && resolvedRuntime === "codex") {
    return { adapter: "codex-exec", path: null };
  }
  if (host === "codex" && resolvedRuntime === "codex") {
    return { adapter: "codex-agent", path: null };
  }
  if (host === "codex" && resolvedRuntime === "claude") {
    return { adapter: "cc-companion", path: "task" };
  }
  // Unreachable: host and resolvedRuntime are each always "claude" or "codex",
  // so the four branches above are exhaustive. Kept as a defensive guard.
  throw new RoutingError(`no adapter for role "${role}" on host "${host}"`);
}

/**
 * The `network_access` value inside `[sandbox_workspace_write]` in a Codex
 * config.toml, read with a line scanner (no TOML parser): find that table
 * header, then the key, stopping at the next `[...]` table. `"unset"` when
 * the file, table, or key is absent.
 */
function readNetworkAccess(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return "unset";
  }
  let inSection = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inSection = line === "[sandbox_workspace_write]";
      continue;
    }
    if (inSection) {
      const m = line.match(/^network_access\s*=\s*(\S+)/);
      if (m) {
        return m[1];
      }
    }
  }
  return "unset";
}

/**
 * Resolve full routing for one host: merges `--set` > project file > user
 * file > the named preset (per field, per role), validates every role's
 * runtime/model/effort/adapter, and computes egress needs and the
 * native-override note. Throws `RoutingError` on any invalid input.
 *
 * @param {{ host: "claude"|"codex", cwd?: string, home?: string, profile?: string,
 *   sets?: string[], codexConfigPath?: string }} opts
 * @returns {Resolved}
 */
export function resolveRouting({
  host,
  cwd = process.cwd(),
  home = homedir(),
  profile: profileArg,
  sets = [],
  codexConfigPath,
} = {}) {
  if (host !== "claude" && host !== "codex") {
    throw new RoutingError(`--host must be "claude" or "codex" (got "${host}")`);
  }

  const roleSets = new Map();
  const fieldSets = {};
  for (const raw of sets) {
    const parsed = parseSet(raw);
    if (parsed.kind === "role") {
      roleSets.set(parsed.role, parsed.entry);
    } else {
      fieldSets[parsed.field] = parsed.value;
    }
  }

  const userPath = join(home, ".agents", "vibe", "routing.json");
  const projectPath = join(cwd, ".agents", "vibe", "routing.json");
  // Display convention: the user file always lives at <home>/.agents/vibe, so it is shown
  // `~`-relative; the project file is shown with the absolute path it was resolved from.
  const userDisplay = "user:~/.agents/vibe/routing.json";
  const projectDisplay = `project:${projectPath}`;

  const userFile = loadRoutingFile(userPath, { allowProject: false });
  const projectFile = loadRoutingFile(projectPath, { allowProject: true });

  let profile;
  let profileSource;
  if (profileArg !== undefined) {
    profile = profileArg;
    profileSource = "arg";
  } else if (fieldSets.profile !== undefined) {
    profile = fieldSets.profile;
    profileSource = "arg";
  } else if (projectFile?.profile) {
    profile = projectFile.profile;
    profileSource = projectDisplay;
  } else if (userFile?.profile) {
    profile = userFile.profile;
    profileSource = userDisplay;
  } else {
    profile = "tiered";
    profileSource = "default";
  }

  const preset = loadPreset(profile);

  const resolveField = (name) => {
    if (Object.prototype.hasOwnProperty.call(fieldSets, name)) {
      return { value: fieldSets[name], source: "arg" };
    }
    if (projectFile && projectFile[name] !== undefined) {
      return { value: projectFile[name], source: projectDisplay };
    }
    if (userFile && userFile[name] !== undefined) {
      return { value: userFile[name], source: userDisplay };
    }
    return { value: DEFAULTS[name], source: "default" };
  };
  const maxParallel = resolveField("max_parallel");
  const taskBudget = resolveField("task_budget_minutes");
  const taskIdle = resolveField("task_idle_minutes");

  const provider = host === "claude" ? "openai" : "anthropic";

  let egressSource;
  if (projectFile) {
    egressSource = projectDisplay;
  } else if (userFile) {
    egressSource = userDisplay;
  } else {
    egressSource = "default";
  }

  // Ruling 3: "doer" comes only from the governing scope (project file if one
  // exists, else user file) — it never inherits from the user file once a
  // project file exists. "review" has no such restriction on the host's own
  // (relevant) provider: it's the union of both files' acknowledgments there,
  // project file or not. The other, irrelevant provider is reported as plain
  // governing-scope content (no union) — it's display-only, never consulted
  // by `egressNeeded`/`egressMissing` below. This is also what those two
  // checks against `egress[provider]` — the reported `egress` and the
  // missing/needed computation share this single source of truth.
  const effectiveEgressClasses = (providerKey) => {
    const projectClasses = projectFile?.egress?.[providerKey] ?? [];
    const userClasses = userFile?.egress?.[providerKey] ?? [];
    const governing = projectFile ? projectClasses : userClasses;
    const classes = [...governing];
    if (providerKey === provider && !classes.includes("review") && projectFile && userClasses.includes("review")) {
      classes.push("review");
    }
    return classes;
  };
  const egress = { openai: effectiveEgressClasses("openai"), anthropic: effectiveEgressClasses("anthropic") };

  const adapters = loadAdapters();
  const roles = {};
  for (const role of ROLES) {
    let raw;
    let source;
    let fromPreset = false;
    if (roleSets.has(role)) {
      raw = roleSets.get(role);
      source = "arg";
    } else if (projectFile?.roles?.[role]) {
      raw = projectFile.roles[role];
      source = projectDisplay;
    } else if (userFile?.roles?.[role]) {
      raw = userFile.roles[role];
      source = userDisplay;
    } else {
      raw = preset.roles[role];
      source = `preset:${profile}`;
      fromPreset = true;
    }

    if (!raw || typeof raw.runtime !== "string" || raw.runtime.length === 0) {
      throw new RoutingError(`role "${role}" (${source}): must specify runtime`);
    }
    validateRuntime(role, raw.runtime, `host "${host}"`);
    const model = raw.model ?? "default";
    if (!fromPreset) {
      validateFileModel(role, model, source);
    }
    const effort = raw.effort ?? "default";

    const resolvedRuntime = resolveRuntimeFor(raw.runtime, host);

    const { adapter, path } = adapterFor(role, host, resolvedRuntime);
    const row = adapters[adapter];
    if (!row) {
      throw new RoutingError(`role "${role}" (host "${host}"): adapter "${adapter}" not found in adapters.json`);
    }
    const effortsList = row.paths ? row.paths[path] : row.efforts;
    if (!Array.isArray(effortsList)) {
      throw new RoutingError(
        `role "${role}" (host "${host}", adapter "${adapter}"): no effort list for path "${path}"`,
      );
    }
    if (!effortsList.includes(effort)) {
      throw new RoutingError(`role "${role}" (host "${host}", adapter "${adapter}"): invalid effort "${effort}"`);
    }
    const mode = EDIT_ROLES.includes(role)
      ? "write"
      : adapter === "codex-agent" && role === "verifier"
        ? "workspace-write-no-edit"
        : "read-only";

    roles[role] = { runtime: raw.runtime, resolvedRuntime, adapter, path, mode, model, effort, source };
  }

  const neededClasses = new Set();
  const rolesByClass = { doer: [], review: [] };
  for (const role of ROLES) {
    // resolvedRuntime is always "claude" or "codex", so "not the host's own
    // runtime" is exactly "the other one" — no need to spell out both directions.
    const crosses = roles[role].resolvedRuntime !== host;
    if (!crosses) {
      continue;
    }
    const cls = REVIEW_ROLES.includes(role) ? "review" : "doer";
    neededClasses.add(cls);
    rolesByClass[cls].push(role);
  }
  const egressNeeded = { openai: [], anthropic: [] };
  egressNeeded[provider] = [...neededClasses];

  const egressMissing = [];
  for (const cls of neededClasses) {
    if (!egress[provider].includes(cls)) {
      const roleList = rolesByClass[cls];
      egressMissing.push({ provider, class: cls, roles: roleList, fatal: roleList.includes("contract-writer") });
    }
  }

  let project = null;
  if (projectFile?.project) {
    const p = projectFile.project;
    project = {
      install: p.install ?? "bun install --frozen-lockfile",
      test: p.test ?? "bun test",
      disposable_paths: p.disposable_paths ?? ["node_modules", ".cache"],
      env_passthrough: p.env_passthrough ?? [],
      secret_allowlist: p.secret_allowlist ?? [],
    };
  }

  let nativeOverrides;
  if (host === "claude") {
    nativeOverrides = CLAUDE_NATIVE_OVERRIDE_NOTE;
  } else {
    const configPath = codexConfigPath ?? join(home, ".codex", "config.toml");
    const networkAccess = sanitizeForBlock(readNetworkAccess(configPath));
    nativeOverrides =
      `codex: live /permissions overrides are reapplied to children; ` +
      `sandbox_workspace_write.network_access=${networkAccess}`;
  }

  return {
    host,
    profile,
    source: profileSource,
    max_parallel: maxParallel.value,
    task_budget_minutes: taskBudget.value,
    task_idle_minutes: taskIdle.value,
    sources: {
      profile: profileSource,
      max_parallel: maxParallel.source,
      task_budget_minutes: taskBudget.source,
      task_idle_minutes: taskIdle.source,
      egress: egressSource,
    },
    egress,
    egressNeeded,
    egressMissing,
    project,
    roles,
    nativeOverrides,
  };
}

/**
 * The literal `<VIBE_ROUTING>` markdown block injected into the session (spec section A).
 *
 * @param {Resolved} resolved
 * @returns {string}
 */
export function formatMarkdown(resolved) {
  const lines = [];
  // Every value below traces back to a routing file (model/effort/profile/
  // source/project.*) — sanitizeForBlock() keeps it from forging block/row
  // structure. Clean values pass through unchanged (it's a no-op on the
  // charset the rest of this file already validates), so the row/line shape
  // asserted elsewhere for well-formed input is unaffected.
  const profile = sanitizeForBlock(resolved.profile);
  const source = sanitizeForBlock(resolved.source);
  lines.push(`<VIBE_ROUTING host="${resolved.host}" profile="${profile}" source="${source}">`);
  lines.push("| role | runtime | adapter | model | effort | source |");
  for (const role of ROLES) {
    const r = resolved.roles[role];
    const model = sanitizeForBlock(r.model);
    const effort = sanitizeForBlock(r.effort);
    const rowSource = sanitizeForBlock(r.source);
    lines.push(`| ${role} | ${r.resolvedRuntime} | ${r.adapter} | ${model} | ${effort} | ${rowSource} |`);
  }
  lines.push(`max_parallel: ${resolved.max_parallel}`);
  lines.push(`task_budget_minutes: ${resolved.task_budget_minutes}`);
  lines.push(`task_idle_minutes: ${resolved.task_idle_minutes}`);

  const [first, second] = resolved.host === "codex" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  const fmtList = (arr) => (arr.length === 0 ? "-" : arr.join(","));
  lines.push(`egress: ${first}=${fmtList(resolved.egress[first])} ${second}=${fmtList(resolved.egress[second])}`);

  if (!resolved.project) {
    lines.push("project: none");
  } else {
    const p = resolved.project;
    const install = sanitizeForBlock(p.install);
    const test = sanitizeForBlock(p.test);
    const disposablePaths = fmtList(p.disposable_paths.map(sanitizeForBlock));
    const secretAllowlist = fmtList(p.secret_allowlist.map(sanitizeForBlock));
    lines.push(
      `project: install="${install}" test="${test}" ` +
        `disposable_paths=${disposablePaths} secret_allowlist=${secretAllowlist}`,
    );
  }
  lines.push(`native-overrides: ${resolved.nativeOverrides}`);
  lines.push("</VIBE_ROUTING>");
  return `${lines.join("\n")}\n`;
}

// --- CLI ---

function parseArgv(argv) {
  const args = { sets: [] };
  let i = argv[0] === "resolve" ? 1 : 0;
  // A value-taking flag with nothing after it (the last argument) is a
  // RoutingError, never `undefined` silently flowing into `args` — that would
  // otherwise surface later as a bogus fallback (e.g. `--cwd` defaulting to
  // process.cwd()) or a raw TypeError (`--set` reaching parseSet(undefined)).
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
      case "--cwd":
        args.cwd = requireValue(a);
        break;
      case "--profile":
        args.profile = requireValue(a);
        break;
      case "--set":
        args.sets.push(requireValue(a));
        break;
      case "--json":
        args.format = "json";
        break;
      case "--markdown":
        args.format = "markdown";
        break;
      default:
        throw new RoutingError(`unknown argument "${a}"`);
    }
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseArgv(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  if (!args.host) {
    process.stderr.write("--host is required\n");
    process.exit(2);
  }
  try {
    const resolved = resolveRouting({
      host: args.host,
      cwd: args.cwd,
      profile: args.profile,
      sets: args.sets,
    });
    if ((args.format ?? "markdown") === "json") {
      process.stdout.write(`${JSON.stringify(resolved)}\n`);
    } else {
      process.stdout.write(formatMarkdown(resolved));
    }
  } catch (e) {
    if (e instanceof RoutingError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

/**
 * Whether this module is the CLI entry point. `import.meta.url` is always the
 * realpath (node resolves symlinks when loading a module), but `process.argv[1]`
 * is the literal path the process was invoked with — through a symlinked
 * plugin root (a marketplace install, `npm link`, ...) those two differ even
 * when they name the same file, so compare realpaths, not the raw strings.
 */
function isCliEntry() {
  if (!process.argv[1]) {
    return false;
  }
  let invoked;
  try {
    invoked = realpathSync(process.argv[1]);
  } catch {
    return false;
  }
  return fileURLToPath(import.meta.url) === invoked;
}

if (isCliEntry()) {
  main();
}
