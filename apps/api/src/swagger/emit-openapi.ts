import "reflect-metadata";

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module";
import { buildOpenApiDocument } from "./build-document";

/**
 * Writes the OpenAPI document to `apps/api/openapi.json`, which is committed
 * and is what orval generates apps/web's client from.
 *
 * The file exists so that generating a client never requires a running API.
 * Reading `/docs/json` instead would mean apps/web could only be built by
 * somebody who could also boot this app against a database — a rule CI and
 * Vercel's web project would both fail. Committing the document also puts every
 * contract change in the diff that causes it: rename a field in a zod schema
 * and the paths and schemas that move show up in the same commit.
 *
 * `preview: true` is what makes this runnable with no environment at all. In
 * preview mode Nest resolves the module graph — every controller, route and
 * decorator the document is built from — without instantiating a single
 * provider, so `PrismaService` is never constructed and no DATABASE_URL or JWT
 * secret is read. Nothing listens on a port either.
 */
async function emit(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  await app.init();

  const document = buildOpenApiDocument(app);
  await app.close();

  // `__dirname` is `apps/api/dist/swagger` — this runs compiled, not from src.
  const target = join(__dirname, "..", "..", "openapi.json");

  // Readable rather than minified — this file is committed, and its diff is how
  // a contract change is reviewed. The `openapi` script runs Prettier over it
  // afterwards, since `pnpm format:check` covers every JSON file in the repo
  // and would otherwise report this one on every run.
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

  const routes = Object.values(document.paths).reduce(
    (total, item) => total + Object.keys(item).length,
    0,
  );

  // Preview mode is the one thing here that could fail quietly: if a future
  // Nest release stopped exposing routes in it, the document would still be
  // valid and simply describe nothing, and orval would happily generate an
  // empty client from it.
  if (routes === 0) {
    throw new Error("The document has no operations — the module graph was not explored.");
  }

  console.log(`Wrote ${target} (${routes} operations).`);
}

emit().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
