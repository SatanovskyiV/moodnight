// Runs one Prisma command against the deployed Neon database, and is the only
// thing in the repo that does.
//
//   node scripts/prod.mjs migrate status
//   node scripts/prod.mjs migrate deploy
//
// Only those two are wired up in package.json. Nothing stops another being
// passed by hand, and nothing needs to: the danger was never that reaching
// production is possible, it is that it can happen without being intended.
// Typing this out is the intent.
//
// The connection string comes from packages/db/.env.neon, which no other
// command reads. It is exported into the child's environment rather than
// written anywhere, so prisma.config.ts picks it up through the ordinary
// DIRECT_URL path — and dotenv, which that file loads, leaves already-set
// variables alone, so the local .env cannot win against it.

import { spawnSync } from "node:child_process";

import { hostOf, loadProduction } from "./target.mjs";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("\nUsage: node scripts/prod.mjs <prisma args…>   (e.g. migrate status)\n");
  process.exit(1);
}

const label = `pnpm db:prod:${args.at(-1)}`;
const url = loadProduction(label);

// Named before the command runs, not after. `migrate deploy` prints the
// database it connected to on success, which is too late to be a confirmation
// and absent entirely when it fails on connect.
console.log(`\n→ ${args.join(" ")} against ${hostOf(url)} (production)\n`);

// `prisma` resolves through node_modules/.bin, which pnpm puts on PATH for
// scripts and which the child inherits. stdio is inherited so migration output
// and any prompt behave exactly as they would unwrapped.
const { status, error } = spawnSync("prisma", args, { stdio: "inherit" });

if (error) {
  console.error(`\nCould not run prisma: ${error.message}\n`);
  process.exit(1);
}

// `migrate status` exits non-zero whenever the database is not up to date, and
// pending migrations are the ordinary reason — which is the whole point of
// running it, and is what makes it usable as a gate. pnpm then reports that as
// ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL, which reads like the command broke.
//
// The exit code is preserved rather than swallowed, because a caller chaining
// this before a deploy needs it. Only the reading is supplied. It stays
// deliberately hedged: Prisma spends the same code on a failure to connect, so
// this cannot promise which happened, only say where to look.
if (status !== 0 && args.join(" ") === "migrate status") {
  console.log(
    `\nA non-zero exit here means the database is not up to date — normally that there are\n` +
      `migrations listed above waiting to be applied. Apply them with:\n\n` +
      `  pnpm db:prod:deploy\n\n` +
      `If nothing was listed, the failure was reaching the database, not its state.\n`,
  );
}

process.exit(status ?? 1);
