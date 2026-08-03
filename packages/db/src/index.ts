export * from "./client";

/**
 * The generated client's public surface: `PrismaClient`, the `Prisma` namespace
 * (input types, `LogLevel`, error classes), and — as the schema grows — the
 * model types and enums.
 *
 * Re-exported from here so nothing outside this package reaches into
 * `src/generated`: that path is an implementation detail of the generator and
 * is not committed.
 */
export * from "./generated/prisma/client";
