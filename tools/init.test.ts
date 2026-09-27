import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeHarness } from "./fixtures/harness";
import { loadAdapters, resolveRouting } from "../plugins/vibe/scripts/routing.mjs";
import {
  detect,
  defaultProfile,
  buildRoutingFile,
  writeRouting,
  bridgeCommands,
  ensureAgentsCap,
} from "../plugins/vibe/scripts/init.mjs";

// Contract 4 for /vibe:init's script (docs/specs/2026-09-04-multi-runtime-vibe.md,
// section B; shapes and commands copied from the task 4 brief). Every test runs
// inside a makeHarness() temp HOME/project; `detect` runs the fake codex/claude
// on the harness PATH and the tests assert against what those fakes print.
const root = join(import.meta.dir, "..");
const cli = join(root, "plugins", "vibe", "scripts", "init.mjs");

type H = ReturnType<typeof makeHarness>;

const userFile = (h: H) => join(h.userRoutingDir, "routing.json");
const projectFile = (h: H) => join(h.projectRoutingDir, "routing.json");
const codexConfig = (h: H) => join(h.home, ".codex", "config.toml");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// The harness leaves the inherited PATH behind its bin, so under `no-cli` the
// machine's real codex/claude would still be found: restrict PATH to the (empty)
// harness bin so "no CLI" really means none.
const noCliEnv = (h: H): NodeJS.ProcessEnv => ({ ...h.env, PATH: join(h.root, "bin") });

const detectOn = (h: H, host: string, env: NodeJS.ProcessEnv = h.env) =>
  detect({ host, home: h.home, cwd: h.project, env });
const write = (h: H, opts: Record<string, unknown>) => writeRouting({ home: h.home, cwd: h.project, ...opts } as Parameters<typeof writeRouting>[0]);
const resolve = (h: H, opts: Record<string, unknown>) => resolveRouting({ cwd: h.project, home: h.home, ...opts } as Parameters<typeof resolveRouting>[0]);
const run = (h: H, args: string[], env: NodeJS.ProcessEnv = h.env) =>
  spawnSync(process.execPath, [cli, ...args], { cwd: h.project, env, encoding: "utf8" });

// Init never writes network_access: not into either routing file, not into ~/.codex/config.toml.
function expectNoNetworkAccess(h: H): void {
  for (const path of [userFile(h), projectFile(h), codexConfig(h)]) {
    if (existsSync(path)) {
      expect(readFileSync(path, "utf8")).not.toContain("network_access");
    }
  }
}

// The real ~/.claude/plugins/installed_plugins.json shape (version 2, one array of installs per plugin id).
function writeCodexPluginEntry(h: H, version = "1.0.6"): string {
  const dir = join(h.home, ".claude", "plugins");
  mkdirSync(dir, { recursive: true });
  const installPath = join(dir, "cache", "ysainson", "codex", version);
  writeFileSync(
    join(dir, "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: { "codex@ysainson": [{ scope: "user", installPath, version, installedAt: "2026-07-16T23:26:42.516Z" }] },
    }),
  );
  return installPath;
}

function writeArgentMarker(h: H): void {
  const dir = join(h.home, ".claude", "rules");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "argent.md"), "# argent\n");
}

const CC_PIN = loadAdapters()["cc-companion"];
const CODEX_HOST_COMMANDS = [
  "codex plugin marketplace add sendbird/codex-marketplace --ref b614ba66b8194f71a4c5e64c916a91fc2f8ee600",
  "codex plugin add cc@sendbird",
  "codex plugin add superpowers@openai-curated",
  "run $cc:setup inside Codex, then restart Codex if it asks",
];
const CLAUDE_HOST_COMMANDS = ["claude plugin install codex@ysainson"];
const AGENTS_LINES = ["[agents]", "max_concurrent_threads_per_session = 6"];

test("preset by detection: split under ok, tiered under login-out and no-cli", () => {
  const ok = makeHarness({ mode: "ok" });
  try {
    expect(defaultProfile(detectOn(ok, "claude"), "claude")).toBe("split");
    // On a Codex host the other runtime is Claude: installed is enough.
    expect(defaultProfile(detectOn(ok, "codex"), "codex")).toBe("split");
  } finally {
    ok.cleanup();
  }

  const loggedOut = makeHarness({ mode: "login-out" });
  try {
    expect(defaultProfile(detectOn(loggedOut, "claude"), "claude")).toBe("tiered");
  } finally {
    loggedOut.cleanup();
  }

  const none = makeHarness({ mode: "no-cli" });
  try {
    expect(defaultProfile(detectOn(none, "claude", noCliEnv(none)), "claude")).toBe("tiered");
    expect(defaultProfile(detectOn(none, "codex", noCliEnv(none)), "codex")).toBe("tiered");
  } finally {
    none.cleanup();
  }
});

test("detect shape under login-out and no-cli fakes", () => {
  const loggedOut = makeHarness({ mode: "login-out" });
  try {
    const d = detectOn(loggedOut, "claude");
    expect(Object.keys(d).sort()).toEqual(["bridges", "claude", "codex", "node", "writersIntoClaudeSkills"]);
    expect(Object.keys(d.claude).sort()).toEqual(["installed", "version"]);
    expect(Object.keys(d.codex).sort()).toEqual(["installed", "loggedIn", "version"]);
    expect(Object.keys(d.bridges).sort()).toEqual(["cc", "codexPlugin", "superpowersCodex"]);

    // What the fakes print: `codex --version` -> "codex-cli 0.153.2", `claude --version` -> "2.1.278 (Claude Code)",
    // `codex login status` -> "Not logged in" (exit 1), `codex plugin list --json` -> {"installed":[]}.
    expect(d.codex.installed).toBe(true);
    expect(d.codex.loggedIn).toBe(false);
    expect(d.codex.version).toContain("0.153.2");
    expect(d.claude.installed).toBe(true);
    expect(d.claude.version).toContain("2.1.278");
    expect(d.bridges.cc).toBeNull();
    expect(d.bridges.superpowersCodex).toEqual({ installed: false });
    expect(d.node.version).toMatch(/^v?\d+\.\d+\.\d+/);

    // No argent marker, no codex@ysainson entry.
    expect(d.writersIntoClaudeSkills).toEqual([]);
    expect(d.bridges.codexPlugin).toBeNull();

    // The marker and the registry entry flip the two detections.
    writeArgentMarker(loggedOut);
    const installPath = writeCodexPluginEntry(loggedOut);
    const again = detectOn(loggedOut, "claude");
    expect(again.writersIntoClaudeSkills).toContain("argent");
    expect(again.bridges.codexPlugin).toEqual({ installed: true, version: "1.0.6", installPath });

    // The fakes were what ran: `codex login status` was asked with the harness env.
    const status = loggedOut.calls().find((c) => c.argv[0] === "login" && c.argv[1] === "status");
    expect(status).toBeDefined();
    expect(status!.env.FAKE_CLI_MODE).toBe("login-out");
  } finally {
    loggedOut.cleanup();
  }

  const none = makeHarness({ mode: "no-cli" });
  try {
    const d = detectOn(none, "claude", noCliEnv(none));
    expect(d.claude).toEqual({ installed: false, version: null });
    expect(d.codex).toMatchObject({ installed: false, version: null });
    expect(d.codex.loggedIn).toBe(false);
    expect(d.bridges.cc).toBeNull();
    expect(d.bridges.superpowersCodex).toEqual({ installed: false });
    expect(d.bridges.codexPlugin).toBeNull();
    expect(d.writersIntoClaudeSkills).toEqual([]);
    expect(none.calls()).toEqual([]);
  } finally {
    none.cleanup();
  }
});

test("contract-writer is never written and always resolves to claude", () => {
  const h = makeHarness();
  try {
    // A --set naming contract-writer is refused or ignored; either way it never reaches the file.
    for (const set of ["contract-writer=codex", "contract-writer=claude"]) {
      rmSync(userFile(h), { force: true });
      let threw = false;
      try {
        write(h, { host: "claude", scope: "user", profile: "split", sets: [set] });
      } catch {
        threw = true;
      }
      if (threw || !existsSync(userFile(h))) {
        write(h, { host: "claude", scope: "user", profile: "split" });
      }
      const file = readJson(userFile(h));
      expect(Object.keys(file.roles ?? {})).not.toContain("contract-writer");
      expect(JSON.stringify(file)).not.toContain("contract-writer");
      expect(resolve(h, { host: "claude" }).roles["contract-writer"]).toMatchObject({
        runtime: "claude",
        resolvedRuntime: "claude",
      });
    }

    // Same on a Codex host, where every other role may point at codex.
    rmSync(userFile(h), { force: true });
    write(h, { host: "codex", scope: "user", profile: "uniform" });
    expect(Object.keys(readJson(userFile(h)).roles ?? {})).not.toContain("contract-writer");
    expect(resolve(h, { host: "codex" }).roles["contract-writer"].resolvedRuntime).toBe("claude");
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("egress entries per provider, class, and host", () => {
  const h = makeHarness();
  try {
    const path = write(h, { host: "claude", scope: "user", profile: "split", egress: ["openai=review,doer"] });
    expect(path).toBe(userFile(h));
    const claudeFile = readJson(userFile(h));
    expect(claudeFile.egress.openai).toEqual(["review", "doer"]);
    expect(claudeFile.egress.anthropic ?? []).toEqual([]);
    // split on a Claude host needs openai for both classes; both acknowledged, nothing missing.
    const r = resolve(h, { host: "claude" });
    expect(r.egress).toEqual({ openai: ["review", "doer"], anthropic: [] });
    expect(r.egressMissing).toEqual([]);
    expectNoNetworkAccess(h);

    rmSync(userFile(h), { force: true });
    write(h, { host: "codex", scope: "user", profile: "split", egress: ["anthropic=review"] });
    const codexFile = readJson(userFile(h));
    expect(codexFile.egress.anthropic).toEqual(["review"]);
    expect(codexFile.egress.openai ?? []).toEqual([]);
    expect(resolve(h, { host: "codex" }).egress).toEqual({ openai: [], anthropic: ["review"] });
    expectNoNetworkAccess(h);

    // Only openai/anthropic providers and review/doer classes exist.
    rmSync(userFile(h), { force: true });
    expect(() => write(h, { host: "claude", scope: "user", profile: "split", egress: ["google=review"] })).toThrow();
    expect(() => write(h, { host: "claude", scope: "user", profile: "split", egress: ["openai=everything"] })).toThrow();
    expect(existsSync(userFile(h))).toBe(false);
  } finally {
    h.cleanup();
  }
});

test("re-run preserves customizations", () => {
  const h = makeHarness();
  try {
    // A plain write carries the header fields and no roles (nothing differs from the preset).
    write(h, { host: "claude", scope: "user", profile: "split" });
    const plain = readJson(userFile(h));
    expect(plain).toMatchObject({ version: 1, profile: "split", max_parallel: 3, task_budget_minutes: 30, task_idle_minutes: 10 });
    expect(plain.roles ?? {}).toEqual({});
    expect(plain).not.toHaveProperty("project");

    write(h, { host: "claude", scope: "user", profile: "split", sets: ["doer=claude:opus"], egress: ["openai=review"] });
    const first = readJson(userFile(h));
    expect(first.roles.doer).toMatchObject({ runtime: "claude", model: "opus" });
    expect(first.egress.openai).toEqual(["review"]);
    expect(resolve(h, { host: "claude" }).roles.doer).toMatchObject({
      model: "opus",
      source: "user:~/.agents/vibe/routing.json",
    });

    // Re-run with the same profile and no sets: the customized role and egress survive.
    write(h, { host: "claude", scope: "user", profile: "split" });
    const second = readJson(userFile(h));
    expect(second.roles.doer.model).toBe("opus");
    expect(second.egress.openai).toEqual(["review"]);

    // A new --set naming the role replaces it.
    write(h, { host: "claude", scope: "user", profile: "split", sets: ["doer=claude:sonnet"] });
    const third = readJson(userFile(h));
    expect(third.roles.doer.model).toBe("sonnet");
    expect(third.egress.openai).toEqual(["review"]);
    expect(resolve(h, { host: "claude" }).roles.doer.model).toBe("sonnet");
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("write at project scope carries the project block with defaults detected from the lockfile", () => {
  const h = makeHarness();
  const lockfiles = ["bun.lock", "package-lock.json", "pnpm-lock.yaml"];
  const useLockfile = (name: string | null) => {
    for (const f of lockfiles) rmSync(join(h.project, f), { force: true });
    if (name) writeFileSync(join(h.project, name), "");
  };
  try {
    writeFileSync(join(h.project, "package.json"), JSON.stringify({ name: "p", private: true, scripts: { test: "bun test" } }));

    useLockfile("bun.lock");
    const path = write(h, { host: "claude", scope: "project", profile: "split" });
    expect(path).toBe(projectFile(h));
    const bunFile = readJson(projectFile(h));
    expect(bunFile.project).toMatchObject({
      install: "bun install --frozen-lockfile",
      test: "bun test",
      disposable_paths: ["node_modules", ".cache"],
    });
    expect(resolve(h, { host: "claude" }).project).toMatchObject({
      install: "bun install --frozen-lockfile",
      test: "bun test",
      disposable_paths: ["node_modules", ".cache"],
    });
    expectNoNetworkAccess(h);

    useLockfile("package-lock.json");
    write(h, { host: "claude", scope: "project", profile: "split" });
    expect(readJson(projectFile(h)).project).toMatchObject({ install: "npm ci", test: "npm test" });

    useLockfile("pnpm-lock.yaml");
    write(h, { host: "claude", scope: "project", profile: "split" });
    expect(readJson(projectFile(h)).project).toMatchObject({ install: "pnpm install --frozen-lockfile", test: "pnpm test" });

    useLockfile(null);
    write(h, { host: "claude", scope: "project", profile: "split" });
    expect(readJson(projectFile(h)).project).toMatchObject({ install: "", test: "" });

    // --project-install / --project-test beat the detected defaults.
    useLockfile("bun.lock");
    write(h, {
      host: "claude",
      scope: "project",
      profile: "split",
      projectInstall: "make deps",
      projectTest: "make check",
    });
    expect(readJson(projectFile(h)).project).toMatchObject({ install: "make deps", test: "make check" });

    // A user-scope write never carries a project block, whatever the cwd holds.
    write(h, { host: "claude", scope: "user", profile: "split" });
    expect(readJson(userFile(h))).not.toHaveProperty("project");
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("bridges prints the exact commands including $cc:setup, nothing runs under --dry-run", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    // The fakes report nothing installed: every Codex-host item is still needed, in order.
    const nothing = detectOn(h, "codex");
    expect(nothing.bridges).toEqual({ codexPlugin: null, cc: null, superpowersCodex: { installed: false } });
    expect(bridgeCommands(nothing, "codex", CC_PIN)).toEqual(CODEX_HOST_COMMANDS);
    expect(bridgeCommands(nothing, "claude", CC_PIN)).toEqual(CLAUDE_HOST_COMMANDS);

    // With the codex plugin registered, the Claude host needs nothing.
    writeCodexPluginEntry(h);
    const withPlugin = detectOn(h, "claude");
    expect(withPlugin.bridges.codexPlugin).toMatchObject({ installed: true });
    expect(bridgeCommands(withPlugin, "claude", CC_PIN)).toEqual([]);

    // The CLI prints the same lines and runs no install under --dry-run.
    const dry = run(h, ["bridges", "--host", "codex", "--dry-run"]);
    expect(dry.status).toBe(0);
    expect(dry.stdout.trimEnd().split("\n")).toEqual(CODEX_HOST_COMMANDS);
    const installs = h.calls().filter((c) => c.argv.includes("install") || c.argv.includes("add"));
    expect(installs).toEqual([]);
  } finally {
    h.cleanup();
  }
});

test("[agents] append-or-print", () => {
  const h = makeHarness();
  try {
    const before = ["[sandbox_workspace_write]", "writable_roots = []", ""].join("\n");
    const codexConfigPath = h.writeCodexConfig(before);
    const appended = ensureAgentsCap({ codexConfigPath, maxParallel: 3 });
    expect(appended.action).toBe("appended");
    expect(appended.lines.join("\n")).toBe(AGENTS_LINES.join("\n"));
    const after = readFileSync(codexConfigPath, "utf8");
    expect(after).toBe(before + "\n[agents]\nmax_concurrent_threads_per_session = 6\n");
    expectNoNetworkAccess(h);

    // A config that already has [agents] is left byte-identical; the exact lines are handed back for the user.
    const existing = ["[agents]", "max_concurrent_threads_per_session = 2", "", "[sandbox_workspace_write]", "writable_roots = []", ""].join("\n");
    h.writeCodexConfig(existing);
    const printed = ensureAgentsCap({ codexConfigPath, maxParallel: 3 });
    expect(printed).toEqual({ action: "print", lines: AGENTS_LINES });
    expect(readFileSync(codexConfigPath, "utf8")).toBe(existing);
  } finally {
    h.cleanup();
  }
});

test("never writes network_access", () => {
  const h = makeHarness();
  try {
    const codexConfigPath = h.writeCodexConfig(["[sandbox_workspace_write]", "writable_roots = []", ""].join("\n"));

    expect(JSON.stringify(buildRoutingFile({ host: "codex", scope: "user", profile: "split" }))).not.toContain("network_access");

    write(h, { host: "codex", scope: "user", profile: "split", egress: ["anthropic=review,doer"] });
    writeFileSync(join(h.project, "bun.lock"), "");
    write(h, { host: "codex", scope: "project", profile: "split", egress: ["anthropic=review,doer"] });
    ensureAgentsCap({ codexConfigPath, maxParallel: 3 });
    expectNoNetworkAccess(h);

    // The CLI path too, on both hosts.
    expect(run(h, ["write", "--host", "codex", "--scope", "user", "--profile", "split", "--yes"]).status).toBe(0);
    expect(run(h, ["write", "--host", "claude", "--scope", "user", "--profile", "split", "--yes"]).status).toBe(0);
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("CLI: detect --json exits 0 with the detection, write without --yes exits 2, --host is required", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    const detected = run(h, ["detect", "--host", "claude", "--json"]);
    expect(detected.status).toBe(0);
    const parsed = JSON.parse(detected.stdout);
    expect(parsed).toHaveProperty("codex");
    expect(parsed).toHaveProperty("claude");
    expect(parsed.codex).toMatchObject({ installed: true, loggedIn: true });

    const unconfirmed = run(h, ["write", "--host", "claude", "--scope", "user", "--profile", "split"]);
    expect(unconfirmed.status).toBe(2);
    expect(existsSync(userFile(h))).toBe(false);

    expect(run(h, ["detect"]).status).toBe(2);
    expect(run(h, ["bridges", "--dry-run"]).status).toBe(2);
  } finally {
    h.cleanup();
  }
});

test("bridges runs the missing commands only with --yes", () => {
  // Claude host, no codex@ysainson entry. Without --yes the command only prints (like --dry-run):
  // the lines are on stdout and nothing reaches the fake `claude`.
  const claudeHost = makeHarness({ mode: "ok" });
  try {
    const printed = run(claudeHost, ["bridges", "--host", "claude"]);
    expect(printed.status).toBe(0);
    expect(printed.stdout.trimEnd().split("\n")).toEqual(CLAUDE_HOST_COMMANDS);
    expect(claudeHost.calls().filter((c) => c.argv.includes("install") || c.argv.includes("add"))).toEqual([]);

    // With --yes the one install runs through the fake `claude`.
    const result = run(claudeHost, ["bridges", "--host", "claude", "--yes"]);
    expect(result.status).toBe(0);
    const installs = claudeHost.calls().filter((c) => c.argv.includes("install"));
    expect(installs.map((c) => c.argv)).toEqual([["plugin", "install", "codex@ysainson"]]);
  } finally {
    claudeHost.cleanup();
  }

  // Codex host, nothing installed: with --yes the three installs run in order through the fake `codex`,
  // and the $cc:setup reminder still closes stdout (the fake exits 0 for unknown subcommands,
  // so the calls log is the evidence).
  const codexHost = makeHarness({ mode: "ok" });
  try {
    const result = run(codexHost, ["bridges", "--host", "codex", "--yes"]);
    expect(result.status).toBe(0);
    const ran = codexHost.calls().filter((c) => c.argv.includes("add") || c.argv.includes("install"));
    expect(ran.map((c) => c.argv)).toEqual([
      ["plugin", "marketplace", "add", "sendbird/codex-marketplace", "--ref", "b614ba66b8194f71a4c5e64c916a91fc2f8ee600"],
      ["plugin", "add", "cc@sendbird"],
      ["plugin", "add", "superpowers@openai-curated"],
    ]);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe("run $cc:setup inside Codex, then restart Codex if it asks");
  } finally {
    codexHost.cleanup();
  }
});

test("show prints the resolved table and bridge readiness", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    write(h, { host: "claude", scope: "user", profile: "split" });
    const plain = run(h, ["show", "--host", "claude"]);
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain('<VIBE_ROUTING host="claude"');
    expect(plain.stdout).toMatch(/bridge/i);
    expect(plain.stdout).not.toContain("argent");

    // With the marker present, show names argent as a writer into .claude/skills.
    writeArgentMarker(h);
    const withArgent = run(h, ["show", "--host", "claude"]);
    expect(withArgent.status).toBe(0);
    expect(withArgent.stdout).toContain("argent");
  } finally {
    h.cleanup();
  }
});

test("agents-cap CLI: appends the two lines, or prints them when [agents] exists", () => {
  const h = makeHarness();
  try {
    const before = ["[sandbox_workspace_write]", "writable_roots = []", ""].join("\n");
    const codexConfigPath = h.writeCodexConfig(before);
    const appended = run(h, ["agents-cap", "--max-parallel", "3", "--codex-config", codexConfigPath]);
    expect(appended.status).toBe(0);
    expect(readFileSync(codexConfigPath, "utf8")).toBe(before + "\n[agents]\nmax_concurrent_threads_per_session = 6\n");

    const existing = ["[agents]", "max_concurrent_threads_per_session = 2", ""].join("\n");
    h.writeCodexConfig(existing);
    const printed = run(h, ["agents-cap", "--max-parallel", "3", "--codex-config", codexConfigPath]);
    expect(printed.status).toBe(0);
    expect(printed.stdout).toContain(AGENTS_LINES.join("\n"));
    expect(readFileSync(codexConfigPath, "utf8")).toBe(existing);
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("detect finds cc and superpowers in the real plugin-list shape", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    const both = detectOn(h, "codex", { ...h.env, FAKE_CODEX_PLUGINS: "cc@sendbird,superpowers@openai-curated" });
    expect(both.bridges.cc).toEqual({ installed: true, version: "1.5.0" });
    expect(both.bridges.superpowersCodex.installed).toBe(true);
    expect(bridgeCommands(both, "codex", CC_PIN)).toEqual([]);

    // Only cc present: superpowers is the one missing item, and the reminder still closes the list.
    const ccOnly = detectOn(h, "codex", { ...h.env, FAKE_CODEX_PLUGINS: "cc@sendbird" });
    expect(ccOnly.bridges.cc).toEqual({ installed: true, version: "1.5.0" });
    expect(ccOnly.bridges.superpowersCodex.installed).toBe(false);
    expect(bridgeCommands(ccOnly, "codex", CC_PIN)).toEqual([
      "codex plugin add superpowers@openai-curated",
      "run $cc:setup inside Codex, then restart Codex if it asks",
    ]);
  } finally {
    h.cleanup();
  }
});

test("a re-run without --profile keeps the file's profile", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    expect(run(h, ["write", "--host", "claude", "--scope", "user", "--profile", "uniform", "--yes"]).status).toBe(0);
    expect(readJson(userFile(h)).profile).toBe("uniform");

    // Detection under `ok` would default to split; the existing file wins when --profile is absent.
    expect(run(h, ["write", "--host", "claude", "--scope", "user", "--yes"]).status).toBe(0);
    expect(readJson(userFile(h)).profile).toBe("uniform");
  } finally {
    h.cleanup();
  }
});

test("a project-scope re-run keeps hand-set project fields and writes all five keys", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    const handSet = {
      install: "make deps",
      test: "make check",
      disposable_paths: ["dist"],
      env_passthrough: ["FOO"],
      secret_allowlist: ["fixtures/x.env"],
    };
    h.writeProjectRouting({ version: 1, profile: "tiered", project: handSet });
    expect(run(h, ["write", "--host", "claude", "--scope", "project", "--cwd", h.project, "--yes"]).status).toBe(0);
    expect(readJson(projectFile(h)).project).toEqual(handSet);
    expect(readJson(projectFile(h)).profile).toBe("tiered");

    // Fresh project write: the lockfile defaults plus the two empty lists.
    rmSync(projectFile(h), { force: true });
    writeFileSync(join(h.project, "bun.lock"), "");
    expect(run(h, ["write", "--host", "claude", "--scope", "project", "--cwd", h.project, "--yes"]).status).toBe(0);
    expect(readJson(projectFile(h)).project).toEqual({
      install: "bun install --frozen-lockfile",
      test: "bun test",
      disposable_paths: ["node_modules", ".cache"],
      env_passthrough: [],
      secret_allowlist: [],
    });
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("agents-cap creates the config directory when missing", () => {
  const h = makeHarness();
  try {
    const codexConfigPath = join(h.root, "nodir", "config.toml");
    expect(ensureAgentsCap({ codexConfigPath, maxParallel: 3 }).action).toBe("appended");
    expect(existsSync(codexConfigPath)).toBe(true);
    const content = readFileSync(codexConfigPath, "utf8");
    const nonEmpty = content.split("\n").filter((l) => l.trim() !== "");
    expect(nonEmpty).toEqual(AGENTS_LINES);
    // A fresh file starts at [agents], with no leading blank line.
    expect(content.startsWith("[agents]")).toBe(true);
  } finally {
    h.cleanup();
  }
});

test("write rejects an unknown --profile", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    const bogus = run(h, ["write", "--host", "claude", "--scope", "user", "--profile", "bogus", "--yes"]);
    expect(bogus.status).toBe(2);
    expect(bogus.stderr.trim().length).toBeGreaterThan(0);
    expect(existsSync(userFile(h))).toBe(false);
  } finally {
    h.cleanup();
  }
});

test("a project-scope re-run with --profile keeps the hand-set project block", () => {
  const h = makeHarness({ mode: "ok" });
  const rerun = () => run(h, ["write", "--host", "claude", "--scope", "project", "--cwd", h.project, "--profile", "tiered", "--yes"]);
  try {
    // No lockfile: an explicit --profile does not disturb a hand-set block.
    const handSet = {
      install: "make deps",
      test: "make check",
      disposable_paths: ["dist"],
      env_passthrough: ["FOO"],
      secret_allowlist: ["x.env"],
    };
    h.writeProjectRouting({ version: 1, profile: "tiered", project: handSet });
    expect(rerun().status).toBe(0);
    expect(readJson(projectFile(h))).toMatchObject({ profile: "tiered", project: handSet });

    // A stored block lacking `test`: only that gap is filled from the lockfile, the rest stays.
    const { test: _omitted, ...withoutTest } = handSet;
    h.writeProjectRouting({ version: 1, profile: "tiered", project: withoutTest });
    writeFileSync(join(h.project, "bun.lock"), "");
    expect(rerun().status).toBe(0);
    expect(readJson(projectFile(h)).project).toEqual({ ...withoutTest, test: "bun test" });
    expectNoNetworkAccess(h);
  } finally {
    h.cleanup();
  }
});

test("write refuses a symlinked target or container", () => {
  const h = makeHarness({ mode: "ok" });
  const writeProject = () => run(h, ["write", "--host", "claude", "--scope", "project", "--cwd", h.project, "--yes"]);
  const relRoutingPath = join(".agents", "vibe", "routing.json");
  try {
    // The routing file itself is a symlink pointing outside the project.
    const victim = join(h.home, "victim.json");
    writeFileSync(victim, '{"keep":true}');
    symlinkSync(victim, projectFile(h));
    const linkedFile = writeProject();
    expect(linkedFile.status).toBe(2);
    expect(linkedFile.stderr).toContain(relRoutingPath);
    expect(readFileSync(victim, "utf8")).toBe('{"keep":true}');
    unlinkSync(projectFile(h));

    // The container directory is a symlink to a directory under HOME.
    const evilDir = join(h.home, "evil-dir");
    mkdirSync(evilDir);
    rmSync(h.projectRoutingDir, { recursive: true, force: true });
    symlinkSync(evilDir, h.projectRoutingDir);
    const linkedDir = writeProject();
    expect(linkedDir.status).toBe(2);
    expect(linkedDir.stderr).toContain(join(".agents", "vibe"));
    expect(readdirSync(evilDir)).toEqual([]);
    unlinkSync(h.projectRoutingDir);

    // A dangling symlink at the routing path: refused, and nothing appears at the target.
    mkdirSync(h.projectRoutingDir, { recursive: true });
    const nowhere = join(h.home, "nowhere.json");
    symlinkSync(nowhere, projectFile(h));
    const dangling = writeProject();
    expect(dangling.status).toBe(2);
    expect(dangling.stderr).toContain(relRoutingPath);
    expect(existsSync(nowhere)).toBe(false);
  } finally {
    h.cleanup();
  }
});

test("agents-cap preserves the config mode and leaves no temp file", () => {
  const h = makeHarness();
  try {
    const before = 'api_key = "x"\n';
    const codexConfigPath = h.writeCodexConfig(before);
    chmodSync(codexConfigPath, 0o600);
    expect(ensureAgentsCap({ codexConfigPath, maxParallel: 3 }).action).toBe("appended");
    expect(statSync(codexConfigPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(codexConfigPath, "utf8")).toBe(before + "\n[agents]\nmax_concurrent_threads_per_session = 6\n");
    expect(readdirSync(join(h.home, ".codex"))).toEqual(["config.toml"]);

    // A file agents-cap creates itself is private too.
    const fresh = join(h.home, "fresh", "config.toml");
    expect(ensureAgentsCap({ codexConfigPath: fresh, maxParallel: 3 }).action).toBe("appended");
    expect(statSync(fresh).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(h.home, "fresh"))).toEqual(["config.toml"]);
  } finally {
    h.cleanup();
  }
});

test("init never echoes file content in a JSON error", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    writeFileSync(userFile(h), "not json AWS_SECRET_xyz");
    const result = run(h, ["write", "--host", "claude", "--scope", "user", "--yes"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(join(".agents", "vibe", "routing.json"));
    expect(result.stderr).not.toContain("AWS_SECRET");
    expect(result.stdout).not.toContain("AWS_SECRET");
    // The unreadable file is left alone rather than overwritten.
    expect(readFileSync(userFile(h), "utf8")).toBe("not json AWS_SECRET_xyz");
  } finally {
    h.cleanup();
  }
});

test("agents-cap validates --max-parallel as an integer in 1..32", () => {
  const h = makeHarness();
  try {
    const before = "[other]\nfoo = 1\n";
    const codexConfigPath = h.writeCodexConfig(before);
    for (const bad of ["1e308", "-1", "0", "2.5", "33"]) {
      const result = run(h, ["agents-cap", "--max-parallel", bad, "--codex-config", codexConfigPath]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("--max-parallel");
      expect(readFileSync(codexConfigPath, "utf8")).toBe(before);
    }
    const ok = run(h, ["agents-cap", "--max-parallel", "3", "--codex-config", codexConfigPath]);
    expect(ok.status).toBe(0);
    expect(readFileSync(codexConfigPath, "utf8")).toBe(before + "\n[agents]\nmax_concurrent_threads_per_session = 6\n");
  } finally {
    h.cleanup();
  }
});

test("a user-scope write never carries a project key", () => {
  const h = makeHarness({ mode: "ok" });
  try {
    // A hand-added project block at user scope would make the resolver reject the file.
    h.writeUserRouting({ version: 1, profile: "tiered", project: { install: "x" }, custom_note: "keep" });
    expect(run(h, ["write", "--host", "claude", "--scope", "user", "--yes"]).status).toBe(0);
    const file = readJson(userFile(h));
    expect(file).not.toHaveProperty("project");
    expect(file.custom_note).toBe("keep");
    expect(resolve(h, { host: "claude" }).profile).toBe("tiered");
  } finally {
    h.cleanup();
  }
});

test("write rejects values the resolver would refuse", () => {
  const h = makeHarness({ mode: "ok" });
  const routingCli = join(root, "plugins", "vibe", "scripts", "routing.mjs");
  try {
    // More than 32 disposable paths: refused before anything lands on disk.
    const forty = Array.from({ length: 40 }, (_, i) => `d${String(i).padStart(9, "0")}`).join(",");
    const tooMany = run(h, ["write", "--host", "claude", "--scope", "project", "--cwd", h.project, "--project-disposable", forty, "--yes"]);
    expect(tooMany.status).toBe(2);
    expect(existsSync(projectFile(h))).toBe(false);
    expect(resolve(h, { host: "claude" }).profile).toBe("tiered");

    // A model that is really a CLI flag, and a runtime that does not exist.
    for (const set of ["doer=claude:--dangerously-skip-permissions", "doer=bogus"]) {
      const bad = run(h, ["write", "--host", "claude", "--scope", "user", "--set", set, "--yes"]);
      expect(bad.status).toBe(2);
      expect(existsSync(userFile(h))).toBe(false);
      expect(resolve(h, { host: "claude" }).profile).toBe("tiered");
    }

    // The resolver CLI agrees: with no file written, it still resolves to the defaults.
    const resolved = spawnSync(process.execPath, [routingCli, "resolve", "--host", "claude", "--json"], {
      cwd: h.project,
      env: h.env,
      encoding: "utf8",
    });
    expect(resolved.status).toBe(0);
    expect(JSON.parse(resolved.stdout).profile).toBe("tiered");
  } finally {
    h.cleanup();
  }
});

test("write refuses a routing file that is not a JSON object", () => {
  const h = makeHarness({ mode: "ok" });
  const routingCli = join(root, "plugins", "vibe", "scripts", "routing.mjs");
  try {
    for (const content of ["null", '"str"']) {
      writeFileSync(userFile(h), content);
      const result = run(h, ["write", "--host", "claude", "--scope", "user", "--yes"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(join(".agents", "vibe", "routing.json"));
      expect(readFileSync(userFile(h), "utf8")).toBe(content);

      // The resolver refuses the same file with a one-line RoutingError, not a stack trace.
      const resolved = spawnSync(process.execPath, [routingCli, "resolve", "--host", "claude"], {
        cwd: h.project,
        env: h.env,
        encoding: "utf8",
      });
      expect(resolved.status).toBe(2);
      const stderr = resolved.stderr.trimEnd();
      expect(stderr.length).toBeGreaterThan(0);
      expect(stderr.split("\n")).toHaveLength(1);
      expect(stderr).not.toMatch(/\bat \S*\//);
    }
  } finally {
    h.cleanup();
  }
});
