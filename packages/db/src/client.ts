import { PrismaPg } from "@prisma/adapter-pg";

import { type Prisma, PrismaClient } from "./generated/prisma/client";

/**
 * Pool settings tuned for the serverless shape described in docs/ROADMAP.md
 * rather than for a long-lived server.
 */
const POOL = {
  /**
   * Every warm function instance opens its own pool and Vercel runs as many
   * instances as it likes, so a small per-instance ceiling is what keeps a
   * traffic spike from exhausting the database's connection limit.
   */
  max: 5,

  /**
   * Neon scales to zero and waking it takes a few seconds. The pg default of
   * 30s is generous enough, but naming it here documents that the first request
   * after an idle spell is expected to be slow rather than broken.
   */
  connectionTimeoutMillis: 15_000,

  /** Release idle connections instead of holding the database awake. */
  idleTimeoutMillis: 10_000,
};

/** Quiet by default: a successful query is not news, a slow or failing one is. */
const DEFAULT_LOG: Prisma.LogLevel[] = ["warn", "error"];

export interface PrismaConnectionConfig {
  /**
   * Pooled connection string — Neon's `-pooler` host. Defaults to
   * `process.env.DATABASE_URL`.
   *
   * Migrations do not come through here: they use the unpooled `DIRECT_URL`
   * that prisma.config.ts declares.
   */
  connectionString?: string;

  /** Defaults to warnings and errors. Add `"query"` when debugging. */
  log?: Prisma.LogLevel[];
}

/**
 * Constructor options for a Prisma client wired to Postgres through the pg
 * driver adapter.
 *
 * Prisma 7 dropped the bundled Rust query engine, so an adapter is no longer
 * optional — a client built without one cannot connect at all. Keeping that
 * choice in one function lets `apps/api` pass the result straight to `super()`
 * and any script share the same wiring.
 *
 * The adapter is `@prisma/adapter-pg` rather than `@prisma/adapter-neon`
 * deliberately: it speaks plain Postgres, so the same code path serves Neon in
 * production and a local Postgres in development. Neon's own driver would buy a
 * slightly cheaper connection handshake at the cost of making local development
 * depend on Neon; if cold starts ever justify it, swapping is a two-line change
 * confined to this file.
 */
export function prismaClientOptions(config: PrismaConnectionConfig = {}) {
  const connectionString = config.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy packages/db/.env.example to " +
        "packages/db/.env (or set it in the deployment's environment) before " +
        "connecting to the database.",
    );
  }

  return {
    adapter: new PrismaPg({ connectionString, ...POOL }),
    log: config.log ?? DEFAULT_LOG,
  };
}

/**
 * A ready-to-use client, for scripts and tests that own their own lifecycle and
 * call `$disconnect()` when finished.
 *
 * `apps/api` does not use this — Nest owns the lifecycle there, so its
 * `PrismaService` extends `PrismaClient` and passes {@link prismaClientOptions}
 * to `super()` instead. Either way, one client per process: each one carries a
 * connection pool.
 */
export function createPrismaClient(config: PrismaConnectionConfig = {}): PrismaClient {
  return new PrismaClient(prismaClientOptions(config));
}
