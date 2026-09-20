#!/usr/bin/env node
/**
 * The sharing layer (spec section C): makes `AGENTS.md` + `.agents/skills/`
 * the canonical project (or user) context for both Claude Code and Codex.
 *
 * `planShare` only reads the tree and returns a `Plan` describing every
 * operation `applyShare` would perform; it never writes. `applyShare` writes
 * a tar backup first, then executes the plan's operations in order.
 *
 * Context files (`CLAUDE.md` / `AGENTS.md`) are project-scope only:
 *   - `CLAUDE.md` body moves into a new `AGENTS.md` byte for byte, or is
 *     appended under `## Imported from CLAUDE.md` when `AGENTS.md` exists.
 *   - `CLAUDE.md` is then rewritten as `@AGENTS.md` plus a
 *     `## Claude Code only` section, unless it already starts that way.
 *
 * Skills are canonical under `.agents/skills/<name>`; `.claude/skills/<name>`
 * and `.codex/skills/<name>` become relative symlinks into it
 * (`../../.agents/skills/<name>`). The union walk (over both non-canonical
 * sides plus the canonical dir) resolves each entry with `lstat` — a
 * symlink is never followed to decide whether it is "real":
 *   - already pointing somewhere under `.agents/skills` (its own name or an
 *     alias) -> "skip-migrated", left untouched
 *   - dangling -> reported as a repair; only replaced with the canonical
 *     link when the name exists in `.agents/skills`
 *   - pointing at a real, non-dangling, non-canonical location -> reported
 *     as a repair ("points outside .agents/skills"); left untouched
 *   - a real dir with no canonical copy yet -> "move-skill" (single real
 *     copy) or "merge-identical" (two identical real copies, materialised
 *     into the canonical dir at apply time)
 *   - a real dir that differs from another same-named real copy -> a
 *     conflict; `applyShare` aborts unless `--prefer` picks a winner, and
 *     that winner replaces the canonical copy wholesale (never a union)
 *
 * `.claude/skills`, `.codex/skills`, and `.agents/skills` must each be a
 * real directory (or absent) — a symlinked container is refused outright,
 * since the union walk cannot safely reason about what it might alias.
 *
 * There is no `name:` rewriting: a skill's identity is always its directory
 * name; frontmatter's own (optional) `name:` key is never read or changed.
 * A missing `description:` aborts planning, listing every offender.
 *
 * Plain node ESM, zero dependencies — the backup tar is shelled out to the
 * system `tar` via `node:child_process`.
 *
 *   node share.mjs plan|apply --scope project|user [--cwd <dir>] [--home <dir>]
 *                              [--prefer claude|agents|codex] [--yes] [--json]
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  symlinkSync,
  cpSync,
  realpathSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

/** Thrown by `planShare`/`applyShare` for every user-facing failure. */
export class ShareError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShareError";
  }
}

const PREFER_VALUES = ["claude", "agents", "codex"];
const IMPORT_HEADING = "\n\n## Imported from CLAUDE.md\n\n";
const CLAUDE_MD_IMPORT = "@AGENTS.md\n\n## Claude Code only\n\n_Add Claude Code-only notes here._\n";

/**
 * @typedef {Object} PlanOperation
 * @property {string} kind
 * @property {string} [from]
 * @property {string} [to]
 * @property {string} detail
 *
 * @typedef {Object} Plan
 * @property {"project"|"user"} scope
 * @property {string} root
 * @property {string} canonical
 * @property {string} backup
 * @property {PlanOperation[]} operations
 * @property {{path: string, detail: string}[]} repairs
 * @property {{skill: string, files: {path: string, detail: string}[]}[]} conflicts
 * @property {string[]} missingDescription
 * @property {"claude"|"agents"|"codex"} [prefer]
 */

// --- frontmatter parsing ---

/**
 * Parse a `---`-delimited frontmatter block into a flat key/value map.
 * Supports plain `key: value`, an indented continuation line (joined with a
 * space), a `>` folded block scalar (lines joined with a space), and a `|`
 * literal block scalar (lines joined with `\n`). Returns `{}` when the text
 * has no frontmatter block.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return {};

  const body = lines.slice(1, end);
  const result = {};
  let i = 0;
  while (i < body.length) {
    const match = body[i].match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) {
      i++;
      continue;
    }
    const key = match[1];
    const rest = match[2].trim();
    i++;
    if (rest === ">" || rest === "|") {
      const collected = [];
      while (i < body.length && /^\s/.test(body[i]) && body[i].trim() !== "") {
        collected.push(body[i].trim());
        i++;
      }
      result[key] = collected.join(rest === ">" ? " " : "\n");
    } else {
      let value = rest;
      while (
        i < body.length &&
        /^\s/.test(body[i]) &&
        body[i].trim() !== "" &&
        !/^\s*[A-Za-z0-9_-]+:/.test(body[i])
      ) {
        value += ` ${body[i].trim()}`;
        i++;
      }
      result[key] = value;
    }
  }
  return result;
}

// --- filesystem helpers ---

/** `lstat`, or `null` when the path does not exist. Never follows a symlink. */
function statOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function listNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

/** True when `childPath` resolves to somewhere inside `parentDir` (not equal to it). */
function isUnderDir(childPath, parentDir) {
  const rel = relative(resolve(parentDir), resolve(childPath));
  return rel.length > 0 && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** Classify a skill-directory entry via `lstat` — never follows a symlink to decide realness. */
function classify(path, canonicalDir) {
  const st = statOrNull(path);
  if (!st) return { type: "none" };
  if (st.isSymbolicLink()) {
    const target = readlinkSync(path);
    const resolved = resolve(dirname(path), target);
    return {
      type: "symlink",
      target,
      resolved,
      exists: existsSync(resolved),
      underCanonical: isUnderDir(resolved, canonicalDir),
    };
  }
  if (st.isDirectory()) return { type: "dir" };
  return { type: "other" };
}

function listEntriesRecursive(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    // Directories participate in the diff too (e.g. an extra empty one would
    // otherwise be invisible — nothing inside it to list), then recurse for
    // whatever it contains.
    out.push(relative(base, p));
    if (st.isDirectory()) listEntriesRecursive(p, base, out);
  }
  return out;
}

function describeEntry(dir, rel) {
  const p = join(dir, rel);
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return `symlink -> ${readlinkSync(p)}`;
  return st.isDirectory() ? "dir" : readFileSync(p);
}

/** Diff two skill directories entry by entry (files and symlinks); returns the differing entries. */
function diffDirs(dirA, dirB) {
  const relsA = new Set(listEntriesRecursive(dirA));
  const relsB = new Set(listEntriesRecursive(dirB));
  const diffs = [];
  for (const rel of new Set([...relsA, ...relsB])) {
    const inA = relsA.has(rel);
    const inB = relsB.has(rel);
    if (!inA || !inB) {
      diffs.push({ path: rel, detail: inA ? `missing in ${dirB}` : `missing in ${dirA}` });
      continue;
    }
    const a = describeEntry(dirA, rel);
    const b = describeEntry(dirB, rel);
    const same = Buffer.isBuffer(a) && Buffer.isBuffer(b) ? a.equals(b) : a === b;
    if (!same) diffs.push({ path: rel, detail: `differs between ${dirA} and ${dirB}` });
  }
  return diffs;
}

function readSkillFrontmatter(skillDir) {
  const p = join(skillDir, "SKILL.md");
  if (!existsSync(p)) return {};
  return parseFrontmatter(readFileSync(p, "utf8"));
}

function skillDirs(root) {
  return {
    claudeSkillsDir: join(root, ".claude/skills"),
    codexSkillsDir: join(root, ".codex/skills"),
    canonicalDir: join(root, ".agents/skills"),
  };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${date}-${time}`;
}

function relativeSymlinkTarget(fromPath, toAbsolutePath) {
  return relative(dirname(fromPath), toAbsolutePath);
}

// --- planning ---

/**
 * Plan (never writes) the migration of `.claude/skills` and `.codex/skills`
 * into canonical `.agents/skills`, and — at project scope — the CLAUDE.md ->
 * AGENTS.md context migration. Throws `ShareError` when `prefer` is not one
 * of `claude`/`agents`/`codex`, when any of the three skills containers is
 * itself a symlink, or when any real skill dir lacks `description:` in its
 * frontmatter.
 * @param {{scope: "project"|"user", cwd?: string, home?: string, prefer?: "claude"|"agents"|"codex"}} options
 * @returns {Plan}
 */
export function planShare({ scope, cwd, home, prefer } = {}) {
  if (prefer !== undefined && !PREFER_VALUES.includes(prefer)) {
    throw new ShareError(`--prefer must be one of ${PREFER_VALUES.join(", ")} (got "${prefer}")`);
  }

  const root = scope === "user" ? (home ?? homedir()) : (cwd ?? process.cwd());
  const { claudeSkillsDir, codexSkillsDir, canonicalDir } = skillDirs(root);

  for (const [label, dir] of [
    [".claude/skills", claudeSkillsDir],
    [".codex/skills", codexSkillsDir],
    [".agents/skills", canonicalDir],
  ]) {
    if (statOrNull(dir)?.isSymbolicLink()) {
      throw new ShareError(`${label} is a symlink; refusing to plan a symlinked skills container (at ${dir})`);
    }
  }

  const allNames = new Set([...listNames(claudeSkillsDir), ...listNames(codexSkillsDir), ...listNames(canonicalDir)]);
  const sortedNames = [...allNames].sort();

  // A canonical entry must be absent or a real directory — never a symlink
  // (dangling or not) or a plain file. Anything else means `ensureSymlink`
  // would otherwise be asked to treat it as a valid link target and delete
  // real side copies into it.
  for (const name of sortedNames) {
    const canonicalPath = join(canonicalDir, name);
    const st = statOrNull(canonicalPath);
    if (st && !st.isDirectory()) {
      throw new ShareError(`.agents/skills/${name} must be a real directory or absent (at ${canonicalPath})`);
    }
  }

  // Missing `description:` aborts planning before anything else runs.
  const missingDescription = [];
  for (const name of sortedNames) {
    const real = [join(canonicalDir, name), join(claudeSkillsDir, name), join(codexSkillsDir, name)].find(
      (p) => statOrNull(p)?.isDirectory(),
    );
    if (real && !readSkillFrontmatter(real).description) missingDescription.push(name);
  }
  if (missingDescription.length > 0) {
    throw new ShareError(`Missing description: for skills: ${missingDescription.join(", ")}`);
  }

  const operations = [];
  const repairs = [];
  const conflicts = [];

  // --- context files (project scope only; ruling 4: no context migration for user scope) ---
  if (scope === "project") {
    const claudeMdPath = join(root, "CLAUDE.md");
    const agentsMdPath = join(root, "AGENTS.md");
    if (existsSync(claudeMdPath)) {
      const body = readFileSync(claudeMdPath, "utf8");
      if (!body.startsWith("@AGENTS.md")) {
        if (existsSync(agentsMdPath)) {
          operations.push({
            kind: "append-claude-md",
            from: claudeMdPath,
            to: agentsMdPath,
            detail: "append CLAUDE.md body into AGENTS.md under '## Imported from CLAUDE.md'",
          });
        } else {
          operations.push({
            kind: "move-claude-md",
            from: claudeMdPath,
            to: agentsMdPath,
            detail: "move CLAUDE.md body into a new AGENTS.md, byte for byte",
          });
        }
        operations.push({
          kind: "write-claude-md-import",
          from: claudeMdPath,
          to: agentsMdPath,
          detail: "rewrite CLAUDE.md as '@AGENTS.md' plus a '## Claude Code only' section",
        });
      }
    }
  }

  // --- skills ---
  for (const name of sortedNames) {
    const canonicalPath = join(canonicalDir, name);
    const claudePath = join(claudeSkillsDir, name);
    const codexPath = join(codexSkillsDir, name);

    const canonical = classify(canonicalPath, canonicalDir);
    const claude = classify(claudePath, canonicalDir);
    const codex = classify(codexPath, canonicalDir);

    const realSides = [];
    if (claude.type === "dir") realSides.push({ side: "claude", path: claudePath });
    if (codex.type === "dir") realSides.push({ side: "codex", path: codexPath });

    let canonicalReal = canonical.type === "dir";

    if (canonicalReal) {
      const diffs = [];
      for (const rs of realSides) {
        const d = diffDirs(rs.path, canonicalPath);
        if (d.length > 0) {
          diffs.push(...d);
        } else {
          operations.push({
            kind: "merge-identical",
            from: rs.path,
            to: canonicalPath,
            detail: `identical skills/${name}`,
          });
        }
      }
      if (diffs.length > 0) conflicts.push({ skill: name, files: diffs });
    } else if (realSides.length === 1) {
      operations.push({
        kind: "move-skill",
        from: realSides[0].path,
        to: canonicalPath,
        detail: `move ${realSides[0].side}/skills/${name} into .agents/skills/${name}`,
      });
      canonicalReal = true;
    } else if (realSides.length === 2) {
      const diffs = diffDirs(realSides[0].path, realSides[1].path);
      if (diffs.length === 0) {
        operations.push({
          kind: "merge-identical",
          from: realSides[0].path,
          to: canonicalPath,
          detail: `identical skills/${name}, materialise into .agents/skills/${name}`,
        });
      } else {
        conflicts.push({ skill: name, files: diffs });
      }
      canonicalReal = true;
    }

    for (const [sideDir, side] of [
      [claudeSkillsDir, claude],
      [codexSkillsDir, codex],
    ]) {
      const sidePath = join(sideDir, name);
      if (side.type === "symlink") {
        if (side.underCanonical) {
          operations.push({
            kind: "skip-migrated",
            from: sidePath,
            to: side.resolved,
            detail: `already points into .agents/skills (${relative(canonicalDir, side.resolved)})`,
          });
        } else if (!side.exists) {
          repairs.push({ path: sidePath, detail: `dangling symlink -> ${side.target}` });
          if (canonicalReal) {
            operations.push({
              kind: "repair-dangling",
              from: sidePath,
              to: canonicalPath,
              detail: "replace dangling symlink with the canonical link",
            });
          }
        } else {
          repairs.push({ path: sidePath, detail: "points outside .agents/skills" });
        }
        continue;
      }
      if ((side.type === "dir" || side.type === "none") && canonicalReal) {
        operations.push({
          kind: "symlink",
          from: sidePath,
          to: canonicalPath,
          detail: `symlink ${sidePath} -> .agents/skills/${name}`,
        });
      }
    }
  }

  // Project-scope backups live inside `root`, which is unique per run, so the
  // timestamp alone (tested verbatim by its regex) is enough. User-scope
  // backups share the one OS tmpdir across every run with no cleanup, where
  // second-granularity timestamps collide easily — `writeBackupTar` now
  // refuses to overwrite whatever it finds there, so a stale same-second
  // leftover would otherwise abort an unrelated apply; a random suffix rules
  // that out.
  const backup =
    scope === "project"
      ? join(root, `.share-backup-${timestamp()}.tar`)
      : join(tmpdir(), `.share-backup-${timestamp()}-${randomUUID().slice(0, 8)}.tar`);

  return { scope, root, canonical: canonicalDir, backup, operations, repairs, conflicts, missingDescription, prefer };
}

// --- applying ---

function ensureSymlink(fromPath, toAbsolutePath) {
  const st = statOrNull(fromPath);
  if (st) {
    if (st.isDirectory()) {
      if (!statOrNull(toAbsolutePath)?.isDirectory()) {
        throw new ShareError(
          `refusing to replace real directory ${fromPath} with a symlink: ` +
            `canonical target ${toAbsolutePath} is not a real directory`,
        );
      }
      rmSync(fromPath, { recursive: true, force: true });
    } else {
      unlinkSync(fromPath);
    }
  }
  mkdirSync(dirname(fromPath), { recursive: true });
  symlinkSync(relativeSymlinkTarget(fromPath, toAbsolutePath), fromPath);
}

function writeBackupTar(plan) {
  if (statOrNull(plan.backup)) {
    throw new ShareError(`refusing to overwrite existing file at the backup path ${plan.backup}`);
  }
  const candidates = ["CLAUDE.md", "AGENTS.md", ".claude/skills", ".codex/skills", ".agents/skills"];
  const entries = candidates.filter((rel) => existsSync(join(plan.root, rel)));
  if (entries.length === 0) {
    // Nothing exists to back up (an empty repo). No tar is written, so the
    // plan must stop advertising a backup file that was never created.
    // (Kept as `string` in the Plan typedef — this branch is untested and
    // `tools/share.test.ts` reads `plan.backup` as a plain string throughout.)
    plan.backup = null;
    return;
  }
  mkdirSync(dirname(plan.backup), { recursive: true });
  const result = spawnSync("tar", ["-cf", plan.backup, ...entries], { cwd: plan.root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new ShareError(`tar backup failed: ${result.stderr || result.error?.message || "unknown error"}`);
  }
}

/** Every conflict's preferred side must actually exist before anything is written. */
function validatePreferSources(plan) {
  const { claudeSkillsDir, codexSkillsDir, canonicalDir } = skillDirs(plan.root);
  const sourceSkillsDir = { claude: claudeSkillsDir, agents: canonicalDir, codex: codexSkillsDir }[plan.prefer];
  for (const conflict of plan.conflicts) {
    const sourceDir = join(sourceSkillsDir, conflict.skill);
    if (!statOrNull(sourceDir)?.isDirectory()) {
      throw new ShareError(`--prefer ${plan.prefer} has no copy of skill "${conflict.skill}" at ${sourceDir}`);
    }
  }
}

/** The preferred copy wins wholesale: the canonical dir is replaced, never unioned with it. */
function resolveConflicts(plan) {
  if (plan.conflicts.length === 0 || plan.prefer === "agents") return;
  const { claudeSkillsDir, codexSkillsDir, canonicalDir } = skillDirs(plan.root);
  const sourceSkillsDir = plan.prefer === "claude" ? claudeSkillsDir : codexSkillsDir;
  for (const conflict of plan.conflicts) {
    const dest = join(canonicalDir, conflict.skill);
    const source = join(sourceSkillsDir, conflict.skill);
    if (statOrNull(dest)) rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest, { recursive: true });
  }
}

function executeOp(op) {
  switch (op.kind) {
    case "move-claude-md":
      writeFileSync(op.to, readFileSync(op.from, "utf8"));
      break;
    case "append-claude-md":
      writeFileSync(op.to, readFileSync(op.to, "utf8") + IMPORT_HEADING + readFileSync(op.from, "utf8"));
      break;
    case "write-claude-md-import":
      writeFileSync(op.from, CLAUDE_MD_IMPORT);
      break;
    case "move-skill":
      mkdirSync(dirname(op.to), { recursive: true });
      renameSync(op.from, op.to);
      break;
    case "merge-identical":
      // Content already matches when `to` exists; otherwise this is the only
      // real copy left standing once its (identical) twin is symlinked away.
      if (!statOrNull(op.to)) {
        mkdirSync(dirname(op.to), { recursive: true });
        renameSync(op.from, op.to);
      }
      break;
    case "skip-migrated":
      break; // already correct
    case "symlink":
    case "repair-dangling":
      ensureSymlink(op.from, op.to);
      break;
    default:
      throw new ShareError(`unknown operation kind "${op.kind}"`);
  }
}

function conflictMessage(conflicts) {
  const lines = conflicts.map((c) => `${c.skill}: ${c.files.map((f) => f.path).join(", ")}`);
  return `Conflicting skill files (rerun with --prefer claude|agents|codex):\n${lines.join("\n")}`;
}

/**
 * Apply a `Plan` produced by `planShare`. Writes a tar backup first, then
 * executes every operation. Throws `ShareError` (writing nothing) unless
 * `yes: true` is passed, when the plan has unresolved conflicts and no
 * `prefer` was given to `planShare`, when a conflict's preferred side does
 * not exist, or when a file already sits at `plan.backup`.
 * @param {Plan} plan
 * @param {{yes?: boolean}} [options]
 * @returns {Plan}
 */
export function applyShare(plan, { yes } = {}) {
  if (yes !== true) throw new ShareError("apply requires explicit confirmation (pass yes: true / --yes)");
  if (plan.conflicts.length > 0 && !plan.prefer) throw new ShareError(conflictMessage(plan.conflicts));
  if (plan.conflicts.length > 0) validatePreferSources(plan);

  writeBackupTar(plan);

  // An unexpected (non-ShareError) failure mid-apply must not escape as a
  // raw stack trace after partial writes — name what was in flight and
  // where the pre-write backup landed, so recovery has somewhere to start.
  try {
    resolveConflicts(plan);
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError(`apply failed while resolving conflicts (backup at ${plan.backup}): ${e.message}`);
  }
  for (const op of plan.operations) {
    try {
      executeOp(op);
    } catch (e) {
      if (e instanceof ShareError) throw e;
      throw new ShareError(
        `apply failed during "${op.kind}" (${op.detail}); backup at ${plan.backup}: ${e.message}`,
      );
    }
  }
  return plan;
}

// --- CLI ---

function takeValue(argv, i, flagName) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new ShareError(`${flagName} requires a value`);
  }
  return value;
}

function parseArgv(argv) {
  const args = { yes: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--scope":
        args.scope = takeValue(argv, i, "--scope");
        i++;
        break;
      case "--cwd":
        args.cwd = takeValue(argv, i, "--cwd");
        i++;
        break;
      case "--home":
        args.home = takeValue(argv, i, "--home");
        i++;
        break;
      case "--prefer":
        args.prefer = takeValue(argv, i, "--prefer");
        i++;
        break;
      case "--yes":
        args.yes = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new ShareError(`unknown argument "${argv[i]}"`);
    }
  }
  return args;
}

function printPlan(plan, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Plan for scope ${plan.scope} at ${plan.root}\nbackup: ${plan.backup}\n\n`);
  for (const op of plan.operations) process.stdout.write(`  [${op.kind}] ${op.detail}\n`);
  for (const r of plan.repairs) process.stdout.write(`  [repair] ${r.path}: ${r.detail}\n`);
  for (const c of plan.conflicts) {
    process.stdout.write(`  [conflict] ${c.skill}: ${c.files.map((f) => f.path).join(", ")}\n`);
  }
}

function usage() {
  const flags = "[--cwd <dir>] [--home <dir>] [--prefer claude|agents|codex] [--yes] [--json]";
  return `Usage: share.mjs plan|apply --scope project|user ${flags}\n`;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode !== "plan" && mode !== "apply") {
    process.stderr.write(usage());
    process.exit(2);
  }
  let args;
  try {
    args = parseArgv(rest);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  if (args.scope !== "project" && args.scope !== "user") {
    process.stderr.write("share.mjs: --scope project|user is required\n");
    process.exit(2);
  }
  if (mode === "apply" && !args.yes) {
    process.stderr.write("share.mjs: apply requires --yes\n");
    process.exit(2);
  }
  try {
    const plan = planShare({ scope: args.scope, cwd: args.cwd, home: args.home, prefer: args.prefer });
    if (mode === "apply") applyShare(plan, { yes: true });
    printPlan(plan, args.json);
  } catch (e) {
    if (e instanceof ShareError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
}

/**
 * True when this file was invoked directly as the CLI entry point (`node
 * share.mjs ...`), not merely imported. `import.meta.url` is realpath-
 * resolved by node, but `process.argv[1]` is the literal path the user (or
 * a symlinked wrapper script) typed — comparing the two raw strings fails,
 * and silently, whenever the invocation path is itself a symlink. Resolving
 * `argv[1]` through `realpathSync` first fixes that; a missing or
 * unresolvable `argv[1]` (e.g. under `bun test`, which imports this module
 * without ever launching it as a script) just means "not the CLI entry".
 */
function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  main();
}
