import { test, expect } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, relative, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { parseFrontmatter, planShare, applyShare, ShareError } from "../plugins/vibe/scripts/share.mjs";
import {
  buildIrisLikeRepo,
  buildNoDescriptionRepo,
  buildDupRepo,
  buildSymlinkedContainerRepo,
  buildInnerSymlinkRepo,
  buildMinimalRepo,
  buildBadCanonicalRepo,
  buildEmptySubdirRepo,
} from "./fixtures/share";

const REPO = resolve(import.meta.dir, "..");
const SHARE = join(REPO, "plugins/vibe/scripts/share.mjs");
const IMPORT_HEADING = "\n\n## Imported from CLAUDE.md\n\n";
const BACKUP_RE = /^\.share-backup-\d{8}-\d{6}\.tar$/;

// Every test builds its own fixture in a fresh temp dir and removes it in `finally`.
function withIris(fn: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "share-iris-"));
  try {
    buildIrisLikeRepo(cwd);
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// zeta conflicts on notes.md, so applying the IRIS fixture needs a `prefer` unless the test is about the abort.
function planIris(cwd: string, extra: Record<string, unknown> = {}) {
  return planShare({ scope: "project", cwd, prefer: "agents", ...extra });
}

const ops = (plan: any, kind: string): any[] => plan.operations.filter((o: any) => o.kind === kind);
const mentions = (op: any, needle: string): boolean =>
  [op.from, op.to, op.detail].some((v) => typeof v === "string" && v.includes(needle));
const isLink = (p: string): boolean => existsSync(dirname(p)) && lstatSync(p).isSymbolicLink();

// Sorted relative paths + lstat kind + link target: equal before/after proves nothing was written.
function snapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = lstatSync(p);
      const rel = relative(root, p);
      if (st.isSymbolicLink()) out.push(`${rel} -> ${readlinkSync(p)}`);
      else if (st.isDirectory()) {
        out.push(`${rel}/`);
        walk(p);
      } else out.push(`${rel} ${readFileSync(p, "utf8").length}`);
    }
  };
  walk(root);
  return out.sort();
}

// --- 1. CLAUDE.md body → AGENTS.md ---

test("apply moves the CLAUDE.md body into a new AGENTS.md byte for byte", () => {
  withIris((cwd) => {
    const body = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    const plan = planIris(cwd);
    expect(ops(plan, "move-claude-md").length).toBe(1);
    applyShare(plan, { yes: true });
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe(body);
  });
});

test("apply appends the CLAUDE.md body under '## Imported from CLAUDE.md' when AGENTS.md exists", () => {
  withIris((cwd) => {
    const existing = "# Existing agents file\n\nKeep me.\n";
    writeFileSync(join(cwd, "AGENTS.md"), existing);
    const body = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    const plan = planIris(cwd);
    expect(ops(plan, "append-claude-md").length).toBe(1);
    expect(ops(plan, "move-claude-md").length).toBe(0);
    applyShare(plan, { yes: true });
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe(existing + IMPORT_HEADING + body);
  });
});

// --- 2. CLAUDE.md becomes the import plus a Claude-only section ---

test("apply rewrites CLAUDE.md as '@AGENTS.md' plus a '## Claude Code only' section", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    expect(ops(plan, "write-claude-md-import").length).toBe(1);
    applyShare(plan, { yes: true });
    const claude = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    expect(claude.startsWith("@AGENTS.md\n")).toBe(true);
    expect(claude).toContain("## Claude Code only");
  });
});

test("a CLAUDE.md that already starts with @AGENTS.md is left alone and plans no context operation", () => {
  withIris((cwd) => {
    const already = "@AGENTS.md\n\n## Claude Code only\n\nRules live in .claude/rules.\n";
    writeFileSync(join(cwd, "CLAUDE.md"), already);
    writeFileSync(join(cwd, "AGENTS.md"), "# agents\n");
    const plan = planIris(cwd);
    for (const kind of ["move-claude-md", "append-claude-md", "write-claude-md-import"]) {
      expect(ops(plan, kind)).toEqual([]);
    }
    applyShare(plan, { yes: true });
    expect(readFileSync(join(cwd, "CLAUDE.md"), "utf8")).toBe(already);
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe("# agents\n");
  });
});

// --- 3. per-skill symlinks, already-migrated skip, dangling links as repairs ---

test("apply links every skill from .claude/skills and .codex/skills into .agents/skills", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    expect(ops(plan, "move-skill").some((o) => mentions(o, "skills/delta"))).toBe(true);
    applyShare(plan, { yes: true });
    expect(existsSync(join(cwd, ".agents/skills/delta/SKILL.md"))).toBe(true);
    expect(lstatSync(join(cwd, ".agents/skills/delta")).isSymbolicLink()).toBe(false);
    for (const side of [".claude", ".codex"]) {
      // delta came from the Claude side; beta only ever lived in .agents. Both get both links.
      for (const name of ["delta", "beta"]) {
        const p = join(cwd, side, "skills", name);
        expect(isLink(p)).toBe(true);
        expect(readlinkSync(p)).toBe(`../../.agents/skills/${name}`);
      }
    }
  });
});

test("an entry already pointing into .agents/skills is planned as skip-migrated and left unchanged", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    expect(ops(plan, "skip-migrated").some((o) => mentions(o, "skills/alpha"))).toBe(true);
    expect(ops(plan, "symlink").some((o) => mentions(o, ".claude/skills/alpha"))).toBe(false);
    applyShare(plan, { yes: true });
    const p = join(cwd, ".claude/skills/alpha");
    expect(isLink(p)).toBe(true);
    expect(readlinkSync(p)).toBe("../../.agents/skills/alpha");
  });
});

test("dangling symlinks are reported as repairs, never silently skipped or deleted", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    for (const name of ["deploy-to-vercel", "vercel-cli-with-tokens"]) {
      expect(plan.repairs.some((r: any) => r.path.includes(name))).toBe(true);
      // The name does not exist in .agents/skills, so there is nothing canonical to relink to.
      expect(ops(plan, "symlink").some((o) => mentions(o, name))).toBe(false);
    }
    applyShare(plan, { yes: true });
    for (const name of ["deploy-to-vercel", "vercel-cli-with-tokens"]) {
      const p = join(cwd, ".claude/skills", name);
      expect(isLink(p)).toBe(true);
      expect(existsSync(join(cwd, ".agents/skills", name))).toBe(false);
    }
  });
});

// --- 4. identical-only merge, conflict abort, --prefer ---

test("same-named identical dirs merge and the Claude side becomes a symlink", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    expect(ops(plan, "merge-identical").some((o) => mentions(o, "skills/epsilon"))).toBe(true);
    expect(plan.conflicts.some((c: any) => c.skill === "epsilon")).toBe(false);
    applyShare(plan, { yes: true });
    const p = join(cwd, ".claude/skills/epsilon");
    expect(isLink(p)).toBe(true);
    expect(readlinkSync(p)).toBe("../../.agents/skills/epsilon");
    expect(existsSync(join(cwd, ".agents/skills/epsilon/SKILL.md"))).toBe(true);
  });
});

test("a differing file between same-named dirs is a conflict and apply refuses without prefer", () => {
  withIris((cwd) => {
    const plan = planShare({ scope: "project", cwd });
    const zeta = plan.conflicts.find((c: any) => c.skill === "zeta");
    expect(zeta).toBeDefined();
    expect(zeta!.files.some((f: any) => f.path.includes("notes.md"))).toBe(true);
    const before = snapshot(cwd);
    let err: unknown;
    try {
      applyShare(plan, { yes: true });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ShareError);
    expect((err as Error).message).toContain("zeta");
    expect((err as Error).message).toContain("notes.md");
    expect(snapshot(cwd)).toEqual(before);
  });
});

test("prefer: claude keeps the .claude copy of a conflicting file", () => {
  withIris((cwd) => {
    const claudeCopy = readFileSync(join(cwd, ".claude/skills/zeta/notes.md"), "utf8");
    applyShare(planShare({ scope: "project", cwd, prefer: "claude" }), { yes: true });
    expect(readFileSync(join(cwd, ".agents/skills/zeta/notes.md"), "utf8")).toBe(claudeCopy);
    expect(isLink(join(cwd, ".claude/skills/zeta"))).toBe(true);
  });
});

test("prefer: agents keeps the .agents copy of a conflicting file", () => {
  withIris((cwd) => {
    const agentsCopy = readFileSync(join(cwd, ".agents/skills/zeta/notes.md"), "utf8");
    applyShare(planShare({ scope: "project", cwd, prefer: "agents" }), { yes: true });
    expect(readFileSync(join(cwd, ".agents/skills/zeta/notes.md"), "utf8")).toBe(agentsCopy);
    expect(isLink(join(cwd, ".claude/skills/zeta"))).toBe(true);
  });
});

// --- 5. tar backup at the repo root, never inside .agents/ ---

test("apply writes a tar backup at the repo root holding CLAUDE.md and .claude/skills", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    applyShare(plan, { yes: true });
    const tars = readdirSync(cwd).filter((n) => BACKUP_RE.test(n));
    expect(tars.length).toBe(1);
    expect(resolve(plan.backup)).toBe(join(cwd, tars[0]));
    expect(readdirSync(join(cwd, ".agents")).some((n) => n.startsWith(".share-backup"))).toBe(false);
    const listed = spawnSync("tar", ["-tf", join(cwd, tars[0])], { encoding: "utf8" });
    expect(listed.status).toBe(0);
    const entries = listed.stdout.split("\n").map((l) => l.replace(/^\.\//, ""));
    expect(entries).toContain("CLAUDE.md");
    expect(entries.some((e) => e.startsWith(".claude/skills/"))).toBe(true);
  });
});

// --- 6. .codex/skills symlinked after the merge ---

test("a Codex-only real dir moves into .agents/skills and both sides get symlinks", () => {
  withIris((cwd) => {
    applyShare(planIris(cwd), { yes: true });
    const canonical = join(cwd, ".agents/skills/plan-feedback");
    expect(lstatSync(canonical).isDirectory()).toBe(true);
    expect(existsSync(join(canonical, "SKILL.md"))).toBe(true);
    for (const side of [".codex", ".claude"]) {
      const p = join(cwd, side, "skills/plan-feedback");
      expect(isLink(p)).toBe(true);
      expect(readlinkSync(p)).toBe("../../.agents/skills/plan-feedback");
    }
  });
});

// --- 7. frontmatter parser ---

test("parseFrontmatter reads key: value pairs", () => {
  const fm = parseFrontmatter("---\nname: alpha\ndescription: One line.\n---\n\n# alpha\n");
  expect(fm.name).toBe("alpha");
  expect(fm.description).toBe("One line.");
});

test("parseFrontmatter joins an indented continuation line with a space", () => {
  const fm = parseFrontmatter("---\nname: alpha\ndescription: starts here\n  and continues here.\n---\n");
  expect(fm.description).toBe("starts here and continues here.");
});

test("parseFrontmatter folds a > block scalar with spaces", () => {
  const fm = parseFrontmatter("---\nname: beta\ndescription: >\n  Folded one,\n  folded two.\n---\n");
  // Trailing newline handling is YAML detail; the fold itself is the contract.
  expect(fm.description.trimEnd()).toBe("Folded one, folded two.");
});

test("parseFrontmatter keeps newlines in a | block scalar", () => {
  const fm = parseFrontmatter("---\nname: gamma\ndescription: |\n  Literal one.\n  Literal two.\n---\n");
  expect(fm.description.trimEnd()).toBe("Literal one.\nLiteral two.");
});

test("parseFrontmatter still reads keys that follow a block scalar", () => {
  const fm = parseFrontmatter("---\ndescription: |\n  Literal one.\n  Literal two.\nmodel: sonnet\nname: gamma\n---\n");
  expect(fm.model).toBe("sonnet");
  expect(fm.name).toBe("gamma");
});

test("parseFrontmatter returns {} when there is no frontmatter block", () => {
  expect(parseFrontmatter("# just a heading\n\nno block here\n")).toEqual({});
  expect(parseFrontmatter("")).toEqual({});
});

// --- 8. name filled from the dir, missing description aborts ---

test("a skill without name: is named after its directory", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    const move = ops(plan, "move-skill").find((o) => o.from.includes(".claude/skills/delta"));
    expect(move).toBeDefined();
    expect(move.to.endsWith("/.agents/skills/delta")).toBe(true);
  });
});

test("planShare aborts with ShareError listing every skill that lacks description:", () => {
  const cwd = mkdtempSync(join(tmpdir(), "share-nodesc-"));
  try {
    buildNoDescriptionRepo(cwd);
    let err: unknown;
    try {
      planShare({ scope: "project", cwd });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ShareError);
    const msg = (err as Error).message;
    expect(msg).toContain("no-desc-one");
    expect(msg).toContain("no-desc-two");
    expect(msg).not.toContain("has-desc");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// --- 9. plan writes nothing ---

test("planShare writes nothing: the tree is identical before and after", () => {
  withIris((cwd) => {
    const before = snapshot(cwd);
    const plan = planIris(cwd);
    expect(Array.isArray(plan.operations)).toBe(true);
    expect(snapshot(cwd)).toEqual(before);
  });
});

// --- 10. .claude/rules untouched ---

test(".claude/rules/*.md is byte-identical after apply", () => {
  withIris((cwd) => {
    const rules = join(cwd, ".claude/rules/argent.md");
    const before = readFileSync(rules, "utf8");
    applyShare(planIris(cwd), { yes: true });
    expect(readFileSync(rules, "utf8")).toBe(before);
  });
});

// --- 11. user scope: skills only, no context migration, backup under tmpdir ---

test("user scope links both sides into <home>/.agents/skills and never touches context files", () => {
  const home = mkdtempSync(join(tmpdir(), "share-home-"));
  try {
    mkdirSync(join(home, ".claude/skills/one"), { recursive: true });
    writeFileSync(join(home, ".claude/skills/one/SKILL.md"), "---\nname: one\ndescription: User skill one.\n---\n");
    mkdirSync(join(home, ".codex/skills/two"), { recursive: true });
    writeFileSync(join(home, ".codex/skills/two/SKILL.md"), "---\nname: two\ndescription: User skill two.\n---\n");
    const userClaude = "# user CLAUDE.md\n\nstays as is\n";
    writeFileSync(join(home, ".claude/CLAUDE.md"), userClaude);

    const plan = planShare({ scope: "user", home });
    applyShare(plan, { yes: true });

    for (const name of ["one", "two"]) {
      expect(existsSync(join(home, ".agents/skills", name, "SKILL.md"))).toBe(true);
      for (const side of [".claude", ".codex"]) {
        const p = join(home, side, "skills", name);
        expect(isLink(p)).toBe(true);
        expect(readlinkSync(p)).toBe(`../../.agents/skills/${name}`);
      }
    }
    expect(existsSync(join(home, "AGENTS.md"))).toBe(false);
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe(userClaude);
    // Backup lives under the OS temp dir, not in the home tree and not in .agents/.
    expect(existsSync(plan.backup)).toBe(true);
    expect(realpathSync(dirname(plan.backup)).startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(resolve(plan.backup).startsWith(home + "/")).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// --- 12. apply needs explicit confirmation ---

test("applyShare without yes: true throws ShareError and writes nothing", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    const before = snapshot(cwd);
    expect(() => applyShare(plan, {})).toThrow(ShareError);
    expect(snapshot(cwd)).toEqual(before);
  });
});

// --- 13. CLI ---

test("CLI: plan --json exits 0 with an operations array and writes nothing", () => {
  withIris((cwd) => {
    const before = snapshot(cwd);
    const r = spawnSync("node", [SHARE, "plan", "--scope", "project", "--cwd", cwd, "--json"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.operations)).toBe(true);
    expect(out.operations.length).toBeGreaterThan(0);
    expect(snapshot(cwd)).toEqual(before);
  });
});

test("CLI: apply without --yes exits 2 and writes nothing", () => {
  withIris((cwd) => {
    const before = snapshot(cwd);
    const r = spawnSync("node", [SHARE, "apply", "--scope", "project", "--cwd", cwd, "--prefer", "agents"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(snapshot(cwd)).toEqual(before);
  });
});

// --- Extension: layouts the IRIS fixture never reaches (data-loss cases from the quality review) ---

// Like withIris, but for any builder.
function withRepo(build: (dir: string) => void, fn: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "share-ext-"));
  try {
    build(cwd);
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function caught(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

test("identical on both sides with no canonical copy is materialised, not lost", () => {
  withRepo((d) => buildDupRepo(d, "identical"), (cwd) => {
    const original = readFileSync(join(cwd, ".claude/skills/dup/SKILL.md"), "utf8");
    applyShare(planShare({ scope: "project", cwd }), { yes: true });
    const canonical = join(cwd, ".agents/skills/dup/SKILL.md");
    expect(lstatSync(canonical).isFile()).toBe(true);
    expect(readFileSync(canonical, "utf8")).toBe(original);
    for (const side of [".claude", ".codex"]) {
      const p = join(cwd, side, "skills/dup");
      expect(isLink(p)).toBe(true);
      expect(readlinkSync(p)).toBe("../../.agents/skills/dup");
      expect(existsSync(p)).toBe(true);
    }
  });
});

test("prefer agents with no agents copy is an error, never a deletion", () => {
  withRepo((d) => buildDupRepo(d, "differing"), (cwd) => {
    const before = snapshot(cwd);
    const err = caught(() => applyShare(planShare({ scope: "project", cwd, prefer: "agents" }), { yes: true }));
    expect(err).toBeInstanceOf(ShareError);
    const msg = (err as Error).message;
    expect(msg).toContain("dup");
    if (msg.includes(".agents/skills")) expect(msg).toContain(".agents/skills/dup");
    for (const side of [".claude", ".codex"]) {
      const p = join(cwd, side, "skills/dup");
      expect(lstatSync(p).isDirectory()).toBe(true);
      expect(lstatSync(p).isSymbolicLink()).toBe(false);
      expect(existsSync(join(p, "SKILL.md"))).toBe(true);
      expect(existsSync(join(p, "notes.md"))).toBe(true);
    }
    // Only the backup tar may have appeared; every original entry is still there unchanged.
    const after = snapshot(cwd).filter((e) => !BACKUP_RE.test(e.split(" ")[0]));
    expect(after).toEqual(before);
  });
});

for (const which of [".claude/skills", ".codex/skills", ".agents/skills"] as const) {
  test(`a symlinked ${which} container refuses to plan`, () => {
    withRepo((d) => buildSymlinkedContainerRepo(d, which), (cwd) => {
      const before = snapshot(cwd);
      const err = caught(() => planShare({ scope: "project", cwd }));
      expect(err).toBeInstanceOf(ShareError);
      expect((err as Error).message).toContain(which);
      expect(snapshot(cwd)).toEqual(before);
    });
  });
}

test("an inner symlink makes two skill dirs differ", () => {
  withRepo(buildInnerSymlinkRepo, (cwd) => {
    const plan = planShare({ scope: "project", cwd });
    expect(ops(plan, "merge-identical").some((o) => mentions(o, "skills/linked"))).toBe(false);
    const conflict = plan.conflicts.find((c: any) => c.skill === "linked");
    expect(conflict).toBeDefined();
    expect(conflict!.files.some((f: any) => f.path.includes("extra"))).toBe(true);
  });
});

test("CLI: --prefer bogus exits 2 with a message on stderr and writes nothing", () => {
  withIris((cwd) => {
    const before = snapshot(cwd);
    const r = spawnSync("node", [SHARE, "apply", "--scope", "project", "--cwd", cwd, "--yes", "--prefer", "bogus"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
    expect(snapshot(cwd)).toEqual(before);
  });
});

test("CLI: a trailing --cwd without a value exits 2 and leaves the process cwd untouched", () => {
  withRepo(buildMinimalRepo, (scratch) => {
    const before = snapshot(scratch);
    const r = spawnSync("node", [SHARE, "apply", "--scope", "project", "--yes", "--cwd"], {
      cwd: scratch,
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(readFileSync(join(scratch, "CLAUDE.md"), "utf8")).toBe("# minimal repo\n");
    expect(snapshot(scratch)).toEqual(before);
  });
});

test("prefer claude replaces the canonical copy wholesale, not a union", () => {
  withIris((cwd) => {
    writeFileSync(join(cwd, ".agents/skills/zeta/only-in-agents.md"), "only the canonical copy had this\n");
    const claudeNotes = readFileSync(join(cwd, ".claude/skills/zeta/notes.md"), "utf8");
    applyShare(planShare({ scope: "project", cwd, prefer: "claude" }), { yes: true });
    expect(existsSync(join(cwd, ".agents/skills/zeta/only-in-agents.md"))).toBe(false);
    expect(readFileSync(join(cwd, ".agents/skills/zeta/notes.md"), "utf8")).toBe(claudeNotes);
  });
});

test("a symlink into .agents/skills under another name is reported as skip-migrated", () => {
  withIris((cwd) => {
    const aliased = join(cwd, ".claude/skills/aliased");
    symlinkSync("../../.agents/skills/alpha", aliased);
    const plan = planIris(cwd);
    const skip = ops(plan, "skip-migrated").find((o) => typeof o.from === "string" && o.from.endsWith(".claude/skills/aliased"));
    expect(skip).toBeDefined();
    expect(ops(plan, "symlink").some((o) => mentions(o, "skills/aliased"))).toBe(false);
    applyShare(plan, { yes: true });
    expect(isLink(aliased)).toBe(true);
    expect(readlinkSync(aliased)).toBe("../../.agents/skills/alpha");
  });
});

test("a pre-existing file at the backup path is never silently overwritten", () => {
  withIris((cwd) => {
    const plan = planIris(cwd);
    const original = plan.backup;
    const preexisting = "not a tar, was here first\n";
    writeFileSync(original, preexisting);
    const err = caught(() => applyShare(plan, { yes: true }));
    if (err !== undefined) {
      // Refusal branch: a ShareError naming the backup that was already there.
      expect(err).toBeInstanceOf(ShareError);
      expect((err as Error).message).toContain(basename(original));
    } else {
      // Sidestep branch: the plan now names a different tar that this apply wrote.
      expect(resolve(plan.backup)).not.toBe(resolve(original));
      expect(existsSync(plan.backup)).toBe(true);
      const listed = spawnSync("tar", ["-tf", plan.backup], { encoding: "utf8" });
      expect(listed.status).toBe(0);
      expect(listed.stdout.split("\n").map((l) => l.replace(/^\.\//, ""))).toContain("CLAUDE.md");
    }
    // In both branches the file that was there first keeps its bytes.
    expect(readFileSync(original, "utf8")).toBe(preexisting);
  });
});

// The symlinked-path case can only be reproduced under the real `node` binary:
// `process.execPath` here is bun, which realpaths argv[1] before the script sees it.
const hasNode = spawnSync("node", ["--version"], { encoding: "utf8" }).status === 0;
if (!hasNode) {
  console.warn("share.test.ts: `node` is not on PATH, skipping the symlinked-path test");
}

test.skipIf(!hasNode)("the share CLI runs through a symlinked path under node", () => {
  withIris((cwd) => {
    const tmp = mkdtempSync(join(tmpdir(), "vibe-link-"));
    try {
      const link = join(tmp, "link");
      symlinkSync(join(REPO, "plugins", "vibe"), link);
      // Under node, argv[1] is the literal symlinked path while import.meta.url is
      // realpath-resolved; a raw string compare between the two silently prints nothing.
      const r = spawnSync("node", [join(link, "scripts", "share.mjs"), "plan", "--scope", "project", "--cwd", cwd, "--json"], {
        encoding: "utf8",
      });
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(0);
      const plan = JSON.parse(r.stdout);
      expect(Array.isArray(plan.operations)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// --- Round 2: canonical entries that are not directories, empty-dir differences ---

for (const kind of ["dangling", "file"] as const) {
  test(`a canonical entry that is a ${kind === "dangling" ? "dangling symlink" : "regular file"} is refused at plan time`, () => {
    withRepo((d) => buildBadCanonicalRepo(d, kind), (cwd) => {
      const before = snapshot(cwd);
      const err = caught(() => planShare({ scope: "project", cwd }));
      expect(err).toBeInstanceOf(ShareError);
      expect((err as Error).message).toContain(".agents/skills/dup");
      for (const side of [".claude", ".codex"]) {
        const p = join(cwd, side, "skills/dup");
        expect(lstatSync(p).isDirectory()).toBe(true);
        expect(existsSync(join(p, "SKILL.md"))).toBe(true);
      }
      expect(snapshot(cwd)).toEqual(before);
    });
  });
}

test("an extra empty subdirectory makes two skill dirs differ", () => {
  withRepo(buildEmptySubdirRepo, (cwd) => {
    const plan = planShare({ scope: "project", cwd });
    expect(ops(plan, "merge-identical").some((o) => mentions(o, "skills/subby"))).toBe(false);
    const conflict = plan.conflicts.find((c: any) => c.skill === "subby");
    expect(conflict).toBeDefined();
    expect(conflict!.files.some((f: any) => /(^|\/)sub\/?$/.test(f.path))).toBe(true);
  });
});
