import { defineConfig } from "tsup";
import fs from "node:fs/promises";
import path from "node:path";
import { plugins, pluginBuildEntries } from "./src/plugins/manifest";

export default defineConfig({
  entry: pluginBuildEntries,
  format: ["cjs"],
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  platform: "node",
  target: "node18",
  outDir: "dist",
  outExtension() {
    return {
      js: ".js",
    };
  },
  async onSuccess() {
    await Promise.all(
      plugins.map(async (plugin) => {
        await fs.copyFile(
          path.join("dist", `${plugin.artifactName}.js`),
          plugin.rootArtifact
        );
      })
    );
  },
});
