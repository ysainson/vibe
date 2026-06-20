/**
 * Pure release-notes rendering: group conventional-commit subjects into markdown
 * sections. Leaner than pulling in conventional-changelog, and testable.
 */
const SECTIONS: { type: string; heading: string }[] = [
  { type: "feat", heading: "Features" },
  { type: "fix", heading: "Fixes" },
];

/** Render grouped markdown release notes from conventional-commit subjects. */
export function releaseNotes(messages: string[]): string {
  if (messages.length === 0) {
    return "No notable changes.";
  }

  const byType = new Map<string, string[]>();
  for (const msg of messages) {
    const m = msg.match(/^([a-z]+)(\([^)]*\))?!?:\s*(.*)$/);
    const type = m ? m[1] : "other";
    const desc = m ? m[3] : msg;
    const bucket = byType.get(type) ?? [];
    bucket.push(desc);
    byType.set(type, bucket);
  }

  const out: string[] = [];
  const used = new Set<string>();
  for (const { type, heading } of SECTIONS) {
    const items = byType.get(type);
    if (items?.length) {
      out.push(`### ${heading}\n\n${items.map((d) => `- ${d}`).join("\n")}`);
      used.add(type);
    }
  }

  const other: string[] = [];
  for (const [type, items] of byType) {
    if (!used.has(type)) {
      other.push(...items);
    }
  }
  if (other.length) {
    out.push(`### Other\n\n${other.map((d) => `- ${d}`).join("\n")}`);
  }

  return out.join("\n\n");
}
