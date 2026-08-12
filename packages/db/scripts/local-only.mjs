// Gate for the destructive `pnpm db:*` scripts. Exits 0 when packages/db/.env
// points at a local database and 1 with an explanation when it does not, so it
// composes as `node scripts/local-only.mjs "pnpm db:reset" && prisma ...` in
// package.json.
//
// Separate from the Prisma command rather than wrapping it, because the check
// has to happen before Prisma opens a connection — and because a gate that
// stands next to the command it guards is one anybody editing package.json can
// see they are removing.
//
// The argument is the user-facing name of the command being guarded ("pnpm
// db:reset"), not the underlying Prisma one: it is what the developer typed and
// what they need to reconsider.

import { requireLocal } from "./target.mjs";

requireLocal(process.argv[2] ?? "This command");
