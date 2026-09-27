/**
 * Test harness for the multi-runtime routing/dispatch contracts: a throwaway
 * HOME + git-repo project, with fake `codex` and `claude` executables on PATH
 * so tests never shell out to the real CLIs. Every fake invocation logs one
 * JSON line (`{ argv, cwd, env, stdin }`) to `FAKE_CLI_LOG`, then behaves per
 * `FAKE_CLI_MODE` — see `FakeMode` below. `FAKE_CODEX_PLUGINS` (comma-separated
 * plugin ids, e.g. `cc@sendbird,superpowers@openai-curated`) makes the fake
 * `codex plugin list --json` report those as installed, in the real shape.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const EXEC_FIXTURE = join(REPO_ROOT, "tools", "fixtures", "codex-exec.jsonl");

export type FakeMode = "ok" | "hang" | "fail" | "write" | "trap-term" | "login-out" | "no-cli";

export type FakeCliCall = { argv: string[]; cwd: string; env: Record<string, string>; stdin: string };

export type Harness = {
  root: string;
  home: string;
  userRoutingDir: string;
  project: string;
  projectRoutingDir: string;
  env: NodeJS.ProcessEnv;
  calls(): FakeCliCall[];
  writeUserRouting(obj: unknown): string;
  writeProjectRouting(obj: unknown): string;
  writeCodexConfig(toml: string): string;
  cleanup(): void;
};

/** The body of a fake `codex`/`claude` executable, with its name and the exec-replay fixture path baked in. */
function fakeCliScript(name: string, execFixturePath: string): string {
  const versionText = name === "codex" ? "codex-cli 0.153.2" : "2.1.278 (Claude Code)";
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const cwd = process.cwd();
const mode = process.env.FAKE_CLI_MODE || "ok";
const logPath = process.env.FAKE_CLI_LOG;
const session = process.env.FAKE_CLI_SESSION;

// Reads fd 0 synchronously — assumes the caller always pipes stdin (spawnSync
// with a "stdio" pipe, never an inherited TTY), same as the real codex/claude CLIs.
let stdin = "";
try {
  stdin = fs.readFileSync(0, "utf8");
} catch {
  stdin = "";
}

if (logPath) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  fs.appendFileSync(logPath, JSON.stringify({ argv, cwd, env, stdin }) + "\\n");
}

function flagValue(flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

function writeExecReplay() {
  const raw = fs.readFileSync(${JSON.stringify(execFixturePath)}, "utf8");
  const lines = raw
    .split("\\n")
    .filter(Boolean)
    .map((line) => {
      const obj = JSON.parse(line);
      if (session && obj.type === "thread.started") {
        obj.thread_id = session;
      }
      return JSON.stringify(obj);
    });
  process.stdout.write(lines.join("\\n") + "\\n");
  const outFile = flagValue("-o");
  if (outFile) {
    fs.writeFileSync(outFile, "ok");
  }
}

if (mode === "hang") {
  setInterval(() => {}, 1 << 30);
} else if (mode === "trap-term") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1 << 30);
} else if (mode === "fail") {
  process.exit(1);
} else if (mode === "write") {
  fs.writeFileSync(path.join(cwd, "written.txt"), "");
  process.exit(0);
} else if (argv.includes("--version")) {
  process.stdout.write(${JSON.stringify(versionText)} + "\\n");
  process.exit(0);
} else if (argv[0] === "login" && argv[1] === "status") {
  if (mode === "login-out") {
    process.stdout.write("Not logged in\\n");
    process.exit(1);
  } else {
    process.stdout.write("Logged in using ChatGPT\\n");
    process.exit(0);
  }
} else if (argv[0] === "plugin" && argv[1] === "list") {
  // FAKE_CODEX_PLUGINS="cc@sendbird,superpowers@openai-curated" -> one entry per id in the
  // real \`codex plugin list --json\` shape (observed on codex-cli 0.153.2); unset -> none.
  const installed = (process.env.FAKE_CODEX_PLUGINS || "")
    .split(",")
    .filter(Boolean)
    .map((pluginId) => {
      const at = pluginId.indexOf("@");
      return {
        pluginId,
        name: pluginId.slice(0, at),
        marketplaceName: pluginId.slice(at + 1),
        version: "1.5.0",
        installed: true,
        enabled: true,
      };
    });
  process.stdout.write(JSON.stringify({ installed }) + "\\n");
  process.exit(0);
} else if (argv[0] === "exec") {
  writeExecReplay();
  process.exit(0);
} else {
  process.exit(0);
}
`;
}

/** Run `git`, scoped to the harness's own throwaway HOME; throws with stderr on a non-zero exit. */
function runGit(args: string[], cwd: string, home: string): void {
  const result = spawnSync("git", args, { cwd, env: { ...process.env, HOME: home }, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
    throw new Error(`git ${args.join(" ")} (in ${cwd}) failed: ${detail}`);
  }
}

/** A throwaway HOME + git-repo project, with fake `codex`/`claude` CLIs on PATH per `opts.mode`. */
export function makeHarness(opts: { mode?: FakeMode; session?: string } = {}): Harness {
  const mode = opts.mode ?? "ok";
  const root = mkdtempSync(join(tmpdir(), "vibe-harness-"));
  const home = join(root, "home");
  const userRoutingDir = join(home, ".agents", "vibe");
  const project = join(root, "project");
  const projectRoutingDir = join(project, ".agents", "vibe");
  const bin = join(root, "bin");
  const log = join(root, "fake-cli-log.jsonl");

  mkdirSync(userRoutingDir, { recursive: true });
  mkdirSync(projectRoutingDir, { recursive: true });
  mkdirSync(bin, { recursive: true });

  runGit(["init", "-q", "-b", "main"], project, home);
  runGit(
    [
      "-c",
      "user.name=VIBE Harness",
      "-c",
      "user.email=vibe-harness@vibe.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      "init",
    ],
    project,
    home,
  );

  if (mode !== "no-cli") {
    for (const name of ["codex", "claude"]) {
      const path = join(bin, name);
      writeFileSync(path, fakeCliScript(name, EXEC_FIXTURE));
      chmodSync(path, 0o755);
    }
  }

  // "no-cli" must make the real machine's codex/claude unreachable too, not just
  // skip writing the fakes — PATH is the fixture bin dir alone, no fallback.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: mode === "no-cli" ? bin : `${bin}:${process.env.PATH ?? ""}`,
    HOME: home,
    FAKE_CLI_MODE: mode,
    FAKE_CLI_LOG: log,
  };
  if (opts.session) {
    env.FAKE_CLI_SESSION = opts.session;
  }

  return {
    root,
    home,
    userRoutingDir,
    project,
    projectRoutingDir,
    env,
    calls(): FakeCliCall[] {
      let raw: string;
      try {
        raw = readFileSync(log, "utf8");
      } catch {
        return [];
      }
      const out: FakeCliCall[] = [];
      for (const line of raw.split("\n")) {
        if (!line) {
          continue;
        }
        try {
          out.push(JSON.parse(line) as FakeCliCall);
        } catch {
          // A killed fake CLI (hang/trap-term) can leave a torn final line — drop it.
        }
      }
      return out;
    },
    writeUserRouting(obj: unknown): string {
      const path = join(userRoutingDir, "routing.json");
      writeFileSync(path, JSON.stringify(obj, null, 2));
      return path;
    },
    writeProjectRouting(obj: unknown): string {
      const path = join(projectRoutingDir, "routing.json");
      writeFileSync(path, JSON.stringify(obj, null, 2));
      return path;
    },
    writeCodexConfig(toml: string): string {
      const dir = join(home, ".codex");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, "config.toml");
      writeFileSync(path, toml);
      return path;
    },
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
