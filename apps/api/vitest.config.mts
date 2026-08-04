import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Vitest transforms with SWC rather than its default esbuild, and that is not a
 * preference — esbuild does not implement `emitDecoratorMetadata`. Without the
 * `design:paramtypes` entries that flag emits, Nest has no way to tell what a
 * constructor is asking for, and every test that builds a module dies at
 * `Nest can't resolve dependencies of the UsersController`.
 *
 * The decorator options below are stated inline instead of being read from
 * tsconfig.json, so the transform a test runs through is described in the file
 * that configures it.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        target: "es2023",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    // Colocated with what they test — `users.service.spec.ts` next to
    // `users.service.ts` — so a file and its tests move together and neither
    // can be renamed without the other showing up in the same diff.
    include: ["src/**/*.spec.ts"],
    environment: "node",
    // Reporters, `expect`, and `vi` are imported explicitly in each spec.
    // Globals would save the import line at the cost of making a test file
    // depend on the runner having configured them.
    globals: false,
  },
});
