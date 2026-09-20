import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Contract for the shared secret-pattern list that /vibe:review's secrets
// pre-scan reads (docs/specs/2026-09-04-multi-runtime-vibe.md, contract 6;
// literal shape and the seven required patterns from the task 6 brief).
const patternsPath = join(
  import.meta.dir,
  "..",
  "plugins",
  "vibe",
  "scripts",
  "secret-patterns.json",
);

type Pattern = { name: string; regex: string };
type PatternFile = { version: number; patterns: Pattern[] };

const load = (): PatternFile => JSON.parse(readFileSync(patternsPath, "utf8"));

// One synthetic sample per required pattern; none is a real credential.
const samples: Record<string, string> = {
  "aws-access-key": "AKIA" + "ABCDEFGHIJKLMNOP",
  "gcp-api-key": "AIza" + "0123456789abcdefghijABCDEFGHIJ_-xyz",
  "github-token": "ghp_" + "0123456789abcdefghijklmnopqrstuvwxyz",
  "openai-key": "sk-proj-" + "abcdefghij0123456789ABCDEFGHIJ",
  "anthropic-key": "sk-ant-" + "api03-abcdefghijklmnopqrstuvwxyz",
  "private-key-block": "-----BEGIN RSA PRIVATE KEY-----",
  "bearer-token": "Bearer " + "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef",
};

test("parses with version 1 and a patterns array of { name, regex }", () => {
  const file = load();
  expect(file.version).toBe(1);
  expect(Array.isArray(file.patterns)).toBe(true);
  expect(file.patterns.length).toBeGreaterThan(0);
  for (const p of file.patterns) {
    expect(typeof p.name).toBe("string");
    expect(typeof p.regex).toBe("string");
  }
});

test("every regex compiles", () => {
  for (const p of load().patterns) {
    expect(() => new RegExp(p.regex)).not.toThrow();
  }
});

test("carries the seven required patterns, each matching its synthetic sample inside a line", () => {
  const byName = new Map(load().patterns.map((p) => [p.name, p.regex]));
  for (const [name, sample] of Object.entries(samples)) {
    const regex = byName.get(name);
    expect(regex, `missing pattern ${name}`).toBeDefined();
    expect(new RegExp(regex!).test(`const key = "${sample}";`), name).toBe(true);
  }
});

test("no pattern matches plain prose", () => {
  for (const p of load().patterns) {
    expect(new RegExp(p.regex).test("const greeting = 'hello world';"), p.name).toBe(false);
  }
});
