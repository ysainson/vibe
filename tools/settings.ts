/**
 * The `.claude/settings.json` shape that wires a project to a plugin marketplace:
 * register the marketplace, then enable plugins from it. This is the canonical
 * shape `/vibe:setup` writes into a scaffolded project, pinned here so the
 * documented onboarding contract stays correct.
 */
export type ProjectSettings = {
  extraKnownMarketplaces: Record<string, { source: { source: "github"; repo: string } }>;
  enabledPlugins: Record<string, true>;
};

/**
 * Build the project settings that register `marketplaceName` (sourced from the
 * GitHub `repo`) and enable each plugin in `pluginNames` from it.
 */
export function buildProjectSettings(
  marketplaceName: string,
  repo: string,
  pluginNames: string[],
): ProjectSettings {
  const enabledPlugins: Record<string, true> = {};
  for (const name of pluginNames) {
    enabledPlugins[`${name}@${marketplaceName}`] = true;
  }

  return {
    extraKnownMarketplaces: {
      [marketplaceName]: { source: { source: "github", repo } },
    },
    enabledPlugins,
  };
}
