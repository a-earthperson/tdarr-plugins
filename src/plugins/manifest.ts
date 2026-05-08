export const plugins = [
  {
    artifactName: "reencode",
    entry: "src/plugins/reencode/index.ts",
    rootArtifact: "reencode.js",
  },
  {
    artifactName: "two-pass-loudness",
    entry: "src/plugins/two-pass-loudness/index.ts",
    rootArtifact: "two-pass-loudness.js",
  },
] as const;

export const pluginBuildEntries = Object.fromEntries(
  plugins.map((plugin) => [plugin.artifactName, plugin.entry])
) as Record<(typeof plugins)[number]["artifactName"], (typeof plugins)[number]["entry"]>;
