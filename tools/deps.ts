/**
 * Dependency resolution the mechanical `claude plugin validate --strict` gate doesn't
 * do: it schema-checks the `dependencies` field's type, not whether each name actually
 * resolves to another plugin in this marketplace.
 */
export type PluginDeps = { name: string; dependencies?: string[] };

/** Dependencies that don't resolve to any marketplace plugin name, paired with their plugin. */
export function unresolvedDeps(
  plugins: PluginDeps[],
  marketplaceNames: string[],
): { plugin: string; dependency: string }[] {
  const names = new Set(marketplaceNames);
  const out: { plugin: string; dependency: string }[] = [];
  for (const pl of plugins) {
    for (const dep of pl.dependencies ?? []) {
      if (!names.has(dep)) {
        out.push({ plugin: pl.name, dependency: dep });
      }
    }
  }
  return out;
}
