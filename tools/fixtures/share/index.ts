// Fixture builders for tools/share.test.ts (contract 3, spec section C).
//
// buildIrisLikeRepo reproduces the mixed layout the IRIS repo has today:
// symlinks already pointing into .agents/skills, two dangling symlinks, real
// skill dirs on both sides, same-named dirs that are identical, one same-named
// pair with a differing file, and multi-line `description:` scalars.
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";

function write(dir: string, rel: string, content: string): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// symlinkSync(target, path): target is relative to the link's own directory.
function link(dir: string, rel: string, target: string): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  symlinkSync(target, p);
}

function skill(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody of ${name}.\n`;
}

export function buildIrisLikeRepo(dir: string): void {
  // 3-line CLAUDE.md body, no AGENTS.md.
  write(dir, "CLAUDE.md", "# IRIS conventions\nBun for scripts, never npm.\nArgent drives the simulator.\n");

  // Canonical side: alpha (single-line description), beta (`>` folded), gamma (`|` literal).
  write(dir, ".agents/skills/alpha/SKILL.md", skill("alpha", "First canonical skill."));
  write(
    dir,
    ".agents/skills/beta/SKILL.md",
    "---\nname: beta\ndescription: >\n  Folded description of beta,\n  spread over two lines.\n---\n\n# beta\n",
  );
  write(
    dir,
    ".agents/skills/gamma/SKILL.md",
    "---\nname: gamma\ndescription: |\n  Literal description of gamma.\n  Second line kept verbatim.\n---\n\n# gamma\n",
  );

  // Claude side: alpha already migrated (symlink into .agents/skills).
  link(dir, ".claude/skills/alpha", "../../.agents/skills/alpha");
  // Two dangling symlinks: their targets do not exist anywhere.
  link(dir, ".claude/skills/deploy-to-vercel", "../../.vendor/vercel/deploy-to-vercel");
  link(dir, ".claude/skills/vercel-cli-with-tokens", "../../.vendor/vercel/vercel-cli-with-tokens");
  // delta: real dir, Claude side only, no `name:` (the dir is the name).
  write(dir, ".claude/skills/delta/SKILL.md", "---\ndescription: Delta has no name key.\n---\n\n# delta\n");
  // epsilon: real dir on both sides, byte-identical.
  const epsilon = skill("epsilon", "Epsilon is identical on both sides.");
  write(dir, ".claude/skills/epsilon/SKILL.md", epsilon);
  write(dir, ".agents/skills/epsilon/SKILL.md", epsilon);
  // zeta: real dir on both sides, SKILL.md identical, notes.md differs.
  const zeta = skill("zeta", "Zeta differs in one file.");
  write(dir, ".claude/skills/zeta/SKILL.md", zeta);
  write(dir, ".claude/skills/zeta/notes.md", "claude copy of zeta notes\n");
  write(dir, ".agents/skills/zeta/SKILL.md", zeta);
  write(dir, ".agents/skills/zeta/notes.md", "agents copy of zeta notes\n");

  // Codex side: one real dir that exists nowhere else.
  write(dir, ".codex/skills/plan-feedback/SKILL.md", skill("plan-feedback", "Codex-only skill."));

  // Rules are never touched by the sharing layer.
  write(dir, ".claude/rules/argent.md", "# argent\n\nAlways call list-devices first.\n");
}

// Two skills lack `description`; one has it, so the abort message must list exactly the two.
export function buildNoDescriptionRepo(dir: string): void {
  write(dir, "CLAUDE.md", "# no-description repo\n");
  write(dir, ".claude/skills/no-desc-one/SKILL.md", "---\nname: no-desc-one\n---\n\n# one\n");
  write(dir, ".codex/skills/no-desc-two/SKILL.md", "---\nname: no-desc-two\n---\n\n# two\n");
  write(dir, ".claude/skills/has-desc/SKILL.md", skill("has-desc", "This one is fine."));
}

// --- Layouts the IRIS fixture never reaches (contract extension after the quality review) ---

// `dup` is a real dir on both the Claude and Codex sides and has no canonical copy.
// "identical": both copies match. "differing": notes.md differs.
export function buildDupRepo(dir: string, variant: "identical" | "differing"): void {
  write(dir, "CLAUDE.md", "# dup repo\n");
  const dup = skill("dup", "Lives on both sides, nowhere canonical.");
  write(dir, ".claude/skills/dup/SKILL.md", dup);
  write(dir, ".codex/skills/dup/SKILL.md", dup);
  write(dir, ".claude/skills/dup/notes.md", "shared notes\n");
  write(dir, ".codex/skills/dup/notes.md", variant === "identical" ? "shared notes\n" : "codex-only notes\n");
}

// One of the three skills containers is itself a symlink to another container holding one real skill `solo`.
export function buildSymlinkedContainerRepo(
  dir: string,
  which: ".claude/skills" | ".codex/skills" | ".agents/skills",
): void {
  write(dir, "CLAUDE.md", "# symlinked container repo\n");
  const real = which === ".agents/skills" ? ".claude/skills" : ".agents/skills";
  write(dir, `${real}/solo/SKILL.md`, skill("solo", "The only skill."));
  link(dir, which, `../${real.split("/")[0]}/skills`);
}

// Same-named dirs whose only difference is an inner symlink `extra -> SKILL.md` on the Claude side.
export function buildInnerSymlinkRepo(dir: string): void {
  write(dir, "CLAUDE.md", "# inner symlink repo\n");
  const linked = skill("linked", "Differs by a symlink only.");
  write(dir, ".claude/skills/linked/SKILL.md", linked);
  link(dir, ".claude/skills/linked/extra", "SKILL.md");
  write(dir, ".agents/skills/linked/SKILL.md", linked);
}

// The smallest repo `apply` would still change: a CLAUDE.md and one real Claude-side skill.
export function buildMinimalRepo(dir: string): void {
  write(dir, "CLAUDE.md", "# minimal repo\n");
  write(dir, ".claude/skills/solo/SKILL.md", skill("solo", "The only skill."));
}

// `dup` is a real identical dir on both sides, but the canonical entry is not a directory:
// a dangling symlink or a regular file.
export function buildBadCanonicalRepo(dir: string, kind: "dangling" | "file"): void {
  write(dir, "CLAUDE.md", "# bad canonical repo\n");
  const dup = skill("dup", "Real on both sides, broken canonical.");
  write(dir, ".claude/skills/dup/SKILL.md", dup);
  write(dir, ".codex/skills/dup/SKILL.md", dup);
  if (kind === "dangling") link(dir, ".agents/skills/dup", "../../nowhere/dup");
  else write(dir, ".agents/skills/dup", "not a directory\n");
}

// Same-named dirs identical except for an empty `sub/` directory on the Claude side.
export function buildEmptySubdirRepo(dir: string): void {
  write(dir, "CLAUDE.md", "# empty subdir repo\n");
  const subby = skill("subby", "Differs by an empty directory only.");
  write(dir, ".claude/skills/subby/SKILL.md", subby);
  mkdirSync(join(dir, ".claude/skills/subby/sub"), { recursive: true });
  write(dir, ".agents/skills/subby/SKILL.md", subby);
}
