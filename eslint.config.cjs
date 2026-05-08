const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "methods/**", ".cursor/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts", "tsup.config.ts"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-namespace": "off",
    },
  }
);
