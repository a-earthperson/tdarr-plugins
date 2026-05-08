export const plugins: readonly [
  {
    readonly artifactName: "reencode";
    readonly entry: "src/plugins/reencode/index.ts";
    readonly rootArtifact: "reencode.js";
  },
  {
    readonly artifactName: "two-pass-loudness";
    readonly entry: "src/plugins/two-pass-loudness/index.ts";
    readonly rootArtifact: "two-pass-loudness.js";
  },
] = [
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

export const pluginBuildEntries: Record<(typeof plugins)[number]["artifactName"], (typeof plugins)[number]["entry"]> =
  Object.fromEntries(plugins.map((plugin) => [plugin.artifactName, plugin.entry])) as Record<
    (typeof plugins)[number]["artifactName"],
    (typeof plugins)[number]["entry"]
  >;
