/**
 * Development seed — run by `pnpm db:seed`, and automatically by
 * `prisma migrate reset`, which is what makes a wiped database usable again in
 * one command.
 *
 * Idempotent by design: every row is an `upsert` keyed on a natural unique
 * column, so running it twice changes nothing and running it against a database
 * that already has data adds only what is missing. That is what lets it be safe
 * to re-run after every migration.
 *
 * It is compiled by the package's own `tsc` into dist/ alongside the client
 * rather than executed through a TypeScript runner — one toolchain, same as the
 * rest of this package.
 */
import { hash } from "@node-rs/argon2";

import { createPrismaClient, type Prisma, UserRole } from "./index";

/**
 * The password every seeded account shares, so signing in as any role during
 * development is one thing to remember rather than five.
 *
 * It is committed, and that is safe for exactly one reason: nothing seeds a
 * deployed database. `prisma migrate deploy` — what production runs — does not
 * run seeds, and these addresses exist only on a local Postgres. Should that
 * ever stop being true, this constant is the first thing that has to go.
 */
const DEV_PASSWORD = "moodnight-dev";

/**
 * Enough users to exercise every role and give `GET /users` something to
 * return. The names are placeholders for a poetry site, not real accounts.
 *
 * The root account is the one row here that cannot simply be copied: the
 * database allows a single ROOT, so if some other email already holds the role
 * this upsert fails on the `users_one_root` index instead of quietly creating a
 * second owner. That is the intended outcome — the seed is not the thing that
 * gets to decide who the owner is on a database that already answered.
 */
const USERS: Omit<Prisma.UserCreateInput, "passwordHash">[] = [
  { email: "root@moodnight.dev", name: "Ліна", surname: "Костенко", role: UserRole.ROOT },
  { email: "admin@moodnight.dev", name: "Леся", surname: "Українка", role: UserRole.ADMIN },
  { email: "editor@moodnight.dev", name: "Іван", surname: "Франко", role: UserRole.EDITOR },
  { email: "author@moodnight.dev", name: "Тарас", surname: "Шевченко", role: UserRole.AUTHOR },
  { email: "vasyl@moodnight.dev", name: "Василь", surname: "Стус", role: UserRole.AUTHOR },
];

async function seed(): Promise<void> {
  const prisma = createPrismaClient();

  // Hashed once and shared by every row: argon2 is deliberately slow, and five
  // identical passwords need one computation, not five. The API verifies
  // whatever parameters this produces — a PHC string carries its own — so the
  // library defaults are enough here and the tuned settings stay in apps/api,
  // where they are actually paid for on every login.
  const passwordHash = await hash(DEV_PASSWORD);

  try {
    for (const user of USERS) {
      const row = { ...user, passwordHash };

      await prisma.user.upsert({
        where: { email: user.email },
        // Reset the row to the seed's version, so editing this file and
        // re-running it actually applies — the alternative, `update: {}`,
        // silently keeps whatever is already there.
        update: row,
        create: row,
      });
    }

    console.log(`Seeded ${USERS.length} users. Password for all of them: ${DEV_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  // A failed seed must not look like a successful one to `migrate reset` or CI.
  process.exitCode = 1;
});
