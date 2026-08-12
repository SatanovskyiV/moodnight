import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "prototype/**",
      // Generated Prisma client — the generator's output, not hand-written code.
      "packages/db/src/generated/**",
      // Likewise the orval client, generated from apps/api/openapi.json. It is
      // still typechecked, which is the check that matters for it: lint rules
      // are about how code is written and nobody writes this one. Both paths
      // are listed because `pnpm lint` runs from the root and from apps/web.
      "apps/web/src/lib/api/generated/**",
      "src/lib/api/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Package scripts: plain ESM run by node straight from package.json, never
    // bundled, never compiled. They need Node's globals declared, and the three
    // they actually use are listed rather than pulling in the `globals` package
    // — a guard script that needs an extra install to lint is one more reason
    // for someone to delete it.
    files: ["**/scripts/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
