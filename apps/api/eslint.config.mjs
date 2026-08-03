import base from "../../eslint.config.mjs";

const config = [
  ...base,
  {
    files: ["src/**/*.ts"],
    rules: {
      // NestJS DI relies on decorator metadata; empty module/class bodies are idiomatic.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];

export default config;
