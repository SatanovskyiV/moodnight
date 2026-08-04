// Prisma 7 configuration for the CLI. Prisma 7 dropped the `prisma` key in
// package.json and no longer loads .env files by itself, so both jobs happen
// here: this file is the only thing that reads the environment on behalf of
// `prisma migrate`, `prisma studio` and friends.
//
// Runtime configuration is a separate concern and lives in src/client.ts —
// nothing the application imports goes through this file.
import "dotenv/config";

import path from "node:path";

import { defineConfig } from "prisma/config";

/**
 * Migrations, introspection and Studio connect through the **unpooled** host.
 * `DATABASE_URL` is the fallback so a plain local Postgres — which has no
 * separate pooled endpoint — works with one variable set.
 *
 * Left undefined when neither is set: `prisma generate`, `validate` and
 * `format` need no database at all, and failing them over a missing connection
 * string would break `pnpm install` on a fresh clone. The commands that do need
 * one then report "The datasource.url property is required in your Prisma
 * config file" — which means this variable is unset, not that a URL should be
 * hardcoded below.
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),

  migrations: {
    // Committed SQL, applied in order — the migration history is the record of
    // how production got its shape, so it is reviewed like any other code.
    path: path.join("prisma", "migrations"),

    // Run by `prisma db seed` and, more usefully, by `prisma migrate reset` —
    // so wiping a local database and getting it back populated is one command.
    // It goes through the package script rather than straight to `node` so the
    // seed is always compiled from current source before it runs.
    seed: "pnpm run seed",
  },

  datasource: {
    url: migrationUrl,

    // `prisma migrate dev` builds a throwaway database to detect drift. Neon
    // creates it automatically when the role may create databases; point this
    // at a scratch database (a Neon branch, or a second local one) when it may
    // not. Unused by `migrate deploy`, which is what production runs.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
