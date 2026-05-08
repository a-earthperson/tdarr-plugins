const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "methods/**", ".cursor/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "warn",
      "prefer-const": [
        "warn",
        {
          destructuring: "any",
          ignoreReadBeforeAssign: false,
        },
      ],
      "arrow-body-style": "off",
      "prefer-arrow-callback": "off",
      "no-console": "warn",
    },
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "tsup.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: false,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/typedef": [
        "error",
        {
          variableDeclaration: true,
        },
      ],
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-restricted-types": [
        "warn",
        {
          types: {
            String: true,
            Boolean: true,
            Number: true,
            Symbol: true,
            BigInt: true,
            Object: true,
            Function: true,
          },
        },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        {
          ignoreConditionalTests: true,
          ignoreMixedLogicalExpressions: true,
          ignorePrimitives: { string: true, number: true, boolean: true },
        },
      ],
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
      "@typescript-eslint/no-empty-function": "error",
      "no-empty": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // Balance signal/noise for mixed constant-like and conventional identifiers.
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "class", format: ["PascalCase"] },
        { selector: "interface", format: ["PascalCase"] },
        { selector: "typeAlias", format: ["PascalCase"] },
        {
          selector: "variable",
          modifiers: ["exported"],
          format: ["PascalCase", "UPPER_CASE", "camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          modifiers: ["exported"],
          format: ["camelCase", "PascalCase"],
        },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "enum", format: ["PascalCase"] },
        {
          selector: "property",
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
      "@typescript-eslint/member-ordering": [
        "warn",
        {
          default: {
            memberTypes: ["set"],
            order: "alphabetically",
          },
        },
      ],
      "@typescript-eslint/prefer-readonly": "warn",
      "@typescript-eslint/consistent-type-definitions": ["warn", "interface"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-namespace": "off",
    },
  },
  eslintConfigPrettier,
);
