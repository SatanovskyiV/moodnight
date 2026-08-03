import base from "../../eslint.config.mjs";

const config = [
  ...base,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        // Tells `consistent-type-imports` that constructor parameter types are
        // emitted as runtime metadata here. Without it the rule reads an
        // injected dependency as a type-only import and "fixes" it into one —
        // which erases the `design:paramtypes` entry Nest resolves providers
        // by, turning every injection into "Nest can't resolve dependencies"
        // at boot. Both flags are needed — the rule only makes the exception
        // when it sees legacy decorators *and* metadata emission, exactly as
        // tsconfig.json declares them.
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      // NestJS DI relies on decorator metadata; empty module/class bodies are idiomatic.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];

export default config;
