import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    reencode: "src/index.ts",
  },
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
});
