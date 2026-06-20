/**
 * Pure semver math for the release sidecar. Each VIBE plugin is versioned
 * independently in its own plugin.json; these functions turn conventional-commit
 * history into the next version. No IO — release.ts wires them to git + plugin.json.
 */
export type BumpLevel = "patch" | "minor" | "major";

/** Pad or trim a version string to exactly three numeric parts (x.y.z). */
export function normalize(version: string): string {
  const parts = version.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3).join(".");
}

/** Apply a semver bump, zeroing the lower components. */
export function bumpVersion(version: string, bump: BumpLevel): string {
  const [major, minor, patch] = normalize(version).split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

/** Highest bump implied by a set of conventional-commit subjects/bodies. */
export function detectBump(messages: string[]): BumpLevel {
  for (const msg of messages) {
    // Breaking: a `type!:` bang, or a `BREAKING CHANGE:` footer line (anchored, so
    // a passing mention of the phrase mid-subject is not a false major).
    if (/^BREAKING CHANGE:/m.test(msg) || /^[a-z]+(\([^)]*\))?!:/.test(msg)) {
      return "major";
    }
  }
  for (const msg of messages) {
    if (/^feat(\([^)]*\))?:/.test(msg)) {
      return "minor";
    }
  }
  return "patch";
}

/** The next version after applying the bump implied by `messages`. */
export function nextVersion(current: string, messages: string[]): string {
  return bumpVersion(current, detectBump(messages));
}
