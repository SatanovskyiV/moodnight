import { Prisma } from "@moodnight/db";
import { vi } from "vitest";

/**
 * The database, stubbed.
 *
 * Every test in this app runs against these fakes rather than a live Postgres,
 * which is a deliberate trade. What the tests then cover is everything between
 * the socket and the query — routing, the UUID and zod pipes, status codes, the
 * `Date` → ISO mapping, which Prisma error becomes which HTTP one — and what
 * they do not cover is whether the query itself is right. That second half
 * belongs to a test that talks to a real database; it needs Docker running,
 * which makes it a thing to run deliberately rather than on every save, and
 * docs/ROADMAP.md has no phase for it yet.
 *
 * The immediate reason is narrower: `pnpm test` has to pass on a laptop with no
 * containers up and in CI without a database service, or it stops being run.
 */

/** A user row exactly as `PUBLIC_FIELDS` selects it — `Date`s, not ISO strings. */
export interface UserRowFixture {
  id: string;
  email: string;
  name: string;
  surname: string;
  role: "ADMIN" | "EDITOR" | "AUTHOR";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UUIDv7s, because the routes validate the version and not merely the shape:
 * the third group starts with `7` and the fourth with one of `89ab`. A v4 id
 * fails these routes, which is what {@link UUID_V4} exists to prove.
 */
export const USER_ID = "0192f5a1-8c2b-7a3d-9e4f-1a2b3c4d5e6f";
export const OTHER_USER_ID = "0192f5a1-9d3c-7b4e-af50-2b3c4d5e6f70";

/** Well-formed, correctly a UUID, and the wrong version. */
export const UUID_V4 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Fixed timestamps, so an assertion can name the exact ISO string it expects. */
const CREATED_AT = new Date("2026-01-02T03:04:05.000Z");
const UPDATED_AT = new Date("2026-02-03T04:05:06.000Z");

export function userRow(overrides: Partial<UserRowFixture> = {}): UserRowFixture {
  return {
    id: USER_ID,
    email: "poet@moodnight.dev",
    name: "Леся",
    surname: "Українка",
    role: "AUTHOR",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** The same row as the API serialises it: timestamps as ISO strings. */
export function userJson(overrides: Partial<UserRowFixture> = {}) {
  const row = userRow(overrides);

  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Only the delegate methods the users service actually calls. Adding a query
 * elsewhere in the app means adding it here too, and the failure when it is
 * missing — `prisma.user.upsert is not a function` — points straight at the
 * untested call.
 */
export function createPrismaMock() {
  return {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

/**
 * A rejection that looks to the service like the real thing.
 *
 * The service narrows on `instanceof Prisma.PrismaClientKnownRequestError` and
 * then on `.code`, so a plain object with a `code` property would slip past the
 * catch and surface as a 500 — the tests would pass against a fake the code
 * cannot actually recognise. Constructing the real error class is what keeps
 * these assertions honest.
 */
export function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Stubbed Prisma failure (${code}).`, {
    code,
    clientVersion: "test",
  });
}
