/**
 * Pure arg-builder for the per-plugin release commit log. Path-scoped to the plugin's
 * own directory (`-- <pluginDir>`) so a root-level commit — e.g. `chore(pins): ...`
 * touching only marketplace.json — never leaks into that plugin's release notes.
 */
export function releaseLogArgs(range: string, pluginDir: string): string[] {
  return ["log", range, "--format=%s", "--no-merges", "--", pluginDir];
}
