// Which database a `pnpm db:*` command is about to talk to, and whether it is
// allowed to.
//
// The problem this exists to prevent is a specific one, and it has already
// happened once here: `packages/db/.env` is loaded automatically by every
// Prisma command, so whatever it points at is what `db:migrate`, `db:seed` and
// `db:reset` act on. Point it at production for an afternoon's convenience and
// `pnpm db:reset` — one keystroke away from `pnpm db:seed` in shell history —
// silently means "drop the production database and reseed it with accounts
// whose password is `moodnight-dev`".
//
// So the two directions are made explicit and asymmetric:
//
//   * the destructive commands assert their target is local, and stop if not;
//   * the production commands load a second file, `.env.neon`, that nothing
//     else reads, and announce the host before they run.
//
// Neither can be reached by accident, and neither depends on the developer
// remembering which file `.env` currently points at.
//
// No dependencies: Node 24 parses env files (`process.loadEnvFile`) and
// connection strings (WHATWG `URL`) on its own, and a guard that itself needs
// an install step is a guard that gets skipped.

import { existsSync } from "node:fs";
import path from "node:path";

/** `packages/db`, regardless of the directory the script was invoked from. */
const PACKAGE_ROOT = path.join(import.meta.dirname, "..");

/**
 * Hostnames that count as "not production".
 *
 * Deliberately a small allowlist rather than a denylist of known Neon hosts:
 * the failure that matters is a production string slipping through, so anything
 * unrecognised has to be treated as remote. A new local setup that this misses
 * is a visible, harmless error; a missed remote host is the outage.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

/**
 * The connection string a Prisma command would use, read the same way
 * prisma.config.ts reads it — `DIRECT_URL` first, falling back to
 * `DATABASE_URL` — so this never guards a different URL than the one that ends
 * up being connected to.
 */
function connectionUrl() {
  return process.env.DIRECT_URL ?? process.env.DATABASE_URL;
}

/**
 * The host part of a connection string, for messages and for the locality test.
 *
 * Returns `null` rather than throwing on an unparseable string: a malformed URL
 * is Prisma's error to report, with its own better message, and swallowing it
 * here would only make the real problem harder to see. It is still treated as
 * non-local by {@link isLocal}.
 */
export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isLocal(url) {
  const host = hostOf(url);
  return host !== null && LOCAL_HOSTNAMES.has(host);
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * Load `packages/db/.env` and refuse to continue unless it points somewhere
 * local.
 *
 * `label` is the command being guarded, and appears in the refusal — "pnpm
 * db:reset refuses to run against ep-….neon.tech" is a sentence someone can act
 * on, where a bare "not a local database" is not.
 */
export function requireLocal(label) {
  const envFile = path.join(PACKAGE_ROOT, ".env");

  if (!existsSync(envFile)) {
    die(
      `${label} needs a database, and packages/db/.env does not exist.\n\n` +
        `  cp packages/db/.env.example packages/db/.env\n` +
        `  pnpm db:up`,
    );
  }

  process.loadEnvFile(envFile);
  const url = connectionUrl();

  if (!url) {
    die(`${label} needs DATABASE_URL set in packages/db/.env. See .env.example.`);
  }

  if (!isLocal(url)) {
    die(
      `${label} is refusing to run: packages/db/.env points at ${hostOf(url) ?? "an unparseable host"}, ` +
        `which is not a local database.\n\n` +
        `This command drops, rewrites or seeds data, so it is allowed against localhost only.\n\n` +
        `If you meant to reach production, the only commands that go there are:\n\n` +
        `  pnpm db:prod:status   — list migrations the deployed database is missing\n` +
        `  pnpm db:prod:deploy   — apply them\n\n` +
        `If you meant to work locally, point packages/db/.env back at the container\n` +
        `(see .env.example) and run 'pnpm db:up'.`,
    );
  }
}

/**
 * Load `packages/db/.env.neon` into this process, for the two commands that are
 * supposed to reach production.
 *
 * Both variables are set from the one unpooled string. `DIRECT_URL` is what
 * prisma.config.ts actually uses, but `DATABASE_URL` is overwritten too so that
 * nothing further down can quietly fall back to the local container — the whole
 * point of this path is that there is no ambiguity about where it lands.
 */
export function loadProduction(label) {
  const envFile = path.join(PACKAGE_ROOT, ".env.neon");

  if (!existsSync(envFile)) {
    die(
      `${label} needs packages/db/.env.neon, which does not exist.\n\n` +
        `  cp packages/db/.env.neon.example packages/db/.env.neon\n\n` +
        `Then paste Neon's DIRECT (unpooled, no "-pooler" in the host) string into it.`,
    );
  }

  process.loadEnvFile(envFile);
  const url = process.env.DIRECT_URL;

  if (!url) {
    die(`${label} needs DIRECT_URL set in packages/db/.env.neon. See .env.neon.example.`);
  }

  // The mirror of requireLocal, and worth having rather than assuming: a
  // .env.neon left pointing at the container turns "deploy to production" into
  // a no-op that reports success, which is a worse outcome than a refusal.
  if (isLocal(url)) {
    die(
      `${label} is refusing to run: packages/db/.env.neon points at ${hostOf(url)}, ` +
        `which is the local database, not production.\n\n` +
        `For local work use 'pnpm db:migrate'. This command exists only to reach Neon.`,
    );
  }

  process.env.DATABASE_URL = url;

  return url;
}
