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
  role: "ROOT" | "ADMIN" | "EDITOR" | "AUTHOR";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The password every fixture account has, and the argon2id hash of it.
 *
 * The hash is a literal rather than something computed in a `beforeAll`, and
 * that is worth the ugliness: argon2 is deliberately slow, and hashing this
 * once per test file would add real time to a suite that is meant to run on
 * every save. Verifying against it is fast enough — one hash computation per
 * assertion that needs one.
 *
 * Regenerate with:
 *
 *   node -e "require('@node-rs/argon2').hash('correct-horse-battery', \
 *     { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }).then(console.log)"
 */
export const FIXTURE_PASSWORD = "correct-horse-battery";
export const FIXTURE_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$d6QP9bLT2OtTk6mfDwhSJQ$0uI+iqHGCHnTtzaTThw3cGG2jgXd3UVfi3ea3XGg3Jw";

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
    active: true,
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
 * A row as the login path reads it — `CREDENTIAL_FIELDS`, not the public ones.
 * Defaults to an account whose password is {@link FIXTURE_PASSWORD}; pass
 * `{ passwordHash: null }` for one that has never set a password.
 */
export function credentialRow(overrides: Partial<CredentialRowFixture> = {}) {
  return {
    id: USER_ID,
    role: "AUTHOR" as const,
    active: true,
    passwordHash: FIXTURE_PASSWORD_HASH as string | null,
    tokenVersion: 0,
    ...overrides,
  };
}

export interface CredentialRowFixture {
  id: string;
  role: UserRowFixture["role"];
  active: boolean;
  passwordHash: string | null;
  tokenVersion: number;
}

/** A row as the refresh path reads it — `SESSION_FIELDS`. */
export function sessionRow(overrides: Partial<Omit<CredentialRowFixture, "passwordHash">> = {}) {
  return { id: USER_ID, role: "AUTHOR" as const, active: true, tokenVersion: 0, ...overrides };
}

/** Ids for the poem fixtures, same UUIDv7 shape as the user ones. */
export const POEM_ID = "0192f5a2-1e4d-7c5f-b061-3c4d5e6f7081";

/** Fixed, so a spec can name the exact ISO string a poem's `publishedAt` becomes. */
const PUBLISHED_AT = new Date("2026-03-04T05:06:07.000Z");

/** Fixed, so a spec can name the exact ISO string a poem's `submittedAt` becomes. */
const SUBMITTED_AT = new Date("2026-02-28T09:10:11.000Z");

export interface PoemRowFixture {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  publishedAt: Date | null;
  createdAt: Date;
  readCount: number;
  featured: boolean;
  author: {
    slug: string;
    penName: string;
    initials: string;
    roleTitle: string | null;
    avatarUrl: string | null;
  };
  tags: { tag: { name: string; slug: string } }[];
}

/**
 * A poem row exactly as the service selects it — including the join rows on
 * `tags`, which arrive wrapped and are flattened by the mapper.
 *
 * The body is eight lines, which matters: the teaser is cut at six, so this
 * fixture exercises the truncation rather than sliding under it. A spec that
 * wants the other case passes a shorter `body`.
 */
export function poemRow(overrides: Partial<PoemRowFixture> = {}): PoemRowFixture {
  return {
    id: POEM_ID,
    slug: "tin-nad-polem",
    title: "Тінь над полем",
    subtitle: "із циклу «Спалені листи»",
    body: ["один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім"].join("\n"),
    publishedAt: PUBLISHED_AT,
    createdAt: CREATED_AT,
    readCount: 1247,
    featured: false,
    author: {
      slug: "taras-shevchenko",
      penName: "Тарас Шевченко",
      initials: "ТШ",
      roleTitle: "Мандрівний поет",
      avatarUrl: null,
    },
    tags: [{ tag: { name: "Меланхолія", slug: "melankholiia" } }],
    ...overrides,
  };
}

/** Fixed, so a spec can name the exact ISO string a decision's `decidedAt` becomes. */
const DECIDED_AT = new Date("2026-03-01T12:13:14.000Z");

export interface ReviewRowFixture {
  action: "APPROVE" | "REJECT";
  note: string | null;
  createdAt: Date;
  reviewer: PoemRowFixture["author"];
}

/**
 * One decision as `REVIEW_FIELDS` selects it — the nested reviewer included,
 * which is the whole point of the fixture: the mapper's job is to decide whether
 * that object reaches the wire, and a row without one could not tell the two
 * answers apart.
 *
 * The reviewer is deliberately a different person from `poemRow`'s author, so a
 * spec asserting on a `penName` is asserting on the reviewer's and not on one
 * that happens to match.
 */
export function reviewRow(overrides: Partial<ReviewRowFixture> = {}): ReviewRowFixture {
  return {
    action: "REJECT",
    note: "Друга строфа обривається раніше за думку.",
    createdAt: DECIDED_AT,
    reviewer: {
      slug: "orysia-vechirnia",
      penName: "Орися Вечірня",
      initials: "ОВ",
      roleTitle: "Хранитель слова",
      avatarUrl: null,
    },
    ...overrides,
  };
}

/**
 * A poem as the *write* path selects it — `STUDIO_FIELDS`, which is the read
 * path's columns plus the three an author cannot work without and the poem's
 * last moderation decision.
 *
 * Defaults to a published poem so a spec has to say `{ status: "DRAFT" }` when
 * it means one; the alternative default would let the "a published poem cannot
 * be deleted" case pass without ever exercising it.
 *
 * `reviews` defaults to empty — the ordinary state of a poem nobody has decided
 * on — so a spec that cares about the review says `{ reviews: [reviewRow()] }`
 * and one that does not still exercises the null branch.
 */
export function studioPoemRow(overrides: Partial<StudioPoemRowFixture> = {}) {
  return {
    ...poemRow(),
    status: "PUBLISHED" as const,
    submittedAt: SUBMITTED_AT as Date | null,
    updatedAt: UPDATED_AT,
    authorId: USER_ID,
    reviews: [] as ReviewRowFixture[],
    ...overrides,
  };
}

export interface StudioPoemRowFixture extends PoemRowFixture {
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
  submittedAt: Date | null;
  updatedAt: Date;
  /**
   * At most one row, because `LATEST_REVIEW` selects the newest and takes one.
   * An array all the same, since that is what a to-many relation comes back as
   * and the mapper is what unwraps it.
   */
  reviews: ReviewRowFixture[];
  /**
   * Selected only by `PoemStudioService.findById`, which needs it to ask whether
   * the caller may reach this poem — `STUDIO_FIELDS` alone does not include it,
   * because it is not on the wire.
   *
   * Present on every row this helper builds rather than on a sixth fixture, and
   * harmless where it is not selected: a stub that returns one more column than
   * the query asked for is what a real client does too, since the mapper picks
   * its fields by name. Defaults to {@link USER_ID}, the account the auth
   * harness mints its tokens for, so the ordinary case is "this poem is mine".
   */
  authorId: string;
}

/**
 * A poem as the moderation queue holds it: waiting, never published, and with a
 * submission date to be ordered by.
 *
 * Its own helper rather than `studioPoemRow({ status: "PENDING_REVIEW" })` at
 * every call site, because the three fields have to agree — a PENDING_REVIEW row
 * carrying a `publishedAt` is a state the application cannot produce, and a spec
 * built on one would prove nothing about the code that runs.
 */
export function queuedPoemRow(overrides: Partial<StudioPoemRowFixture> = {}) {
  return studioPoemRow({
    status: "PENDING_REVIEW",
    publishedAt: null,
    submittedAt: SUBMITTED_AT,
    ...overrides,
  });
}

/**
 * The three columns the write path reads before it decides whether a caller may
 * write — `OWNERSHIP_FIELDS`.
 *
 * `authorId` defaults to {@link USER_ID}, the account the auth harness mints its
 * tokens for, so the ordinary case is "this poem is mine". A spec testing the
 * ownership rule passes `OTHER_USER_ID`, and the difference between the two is
 * the whole of that rule.
 */
export function ownershipRow(
  overrides: Partial<{
    authorId: string;
    status: StudioPoemRowFixture["status"];
    publishedAt: Date | null;
  }> = {},
) {
  return {
    authorId: USER_ID,
    status: "DRAFT" as StudioPoemRowFixture["status"],
    publishedAt: null as Date | null,
    ...overrides,
  };
}

/** A tag as `resolveTags` selects it: the id it needs and the slug it checks. */
export const TAG_ID = "0192f5a3-2f5e-7d60-b172-4d5e6f708192";

/** The id a stubbed `Review` insert comes back with. Nothing reads it; the row does. */
export const REVIEW_ID = "0192f5a4-3061-7e71-8283-5e6f70819203";

export function tagRow(overrides: Partial<{ id: string; slug: string }> = {}) {
  return { id: TAG_ID, slug: "melankholiia", ...overrides };
}

/**
 * Only the delegate methods the app actually calls. Adding a query elsewhere
 * means adding it here too, and the failure when it is missing —
 * `prisma.user.upsert is not a function` — points straight at the untested call.
 */
export function createPrismaMock() {
  return {
    user: {
      // Defaulted to an empty result, unlike its siblings, because two very
      // different callers share it: a list endpoint, which always stubs it, and
      // `deriveProfile` on the *create* path, which reads the neighbouring
      // slugs and which no test about creating a user is written to think
      // about. Returning `undefined` there fails inside the service with a
      // `.map` on nothing, a long way from anything the test is asserting. A
      // list spec that forgets to stub it still fails — on an empty page.
      findMany: vi.fn().mockResolvedValue([]),
      // Paired with `findMany` by every list endpoint: the page and the total
      // are two queries against one `where`, so a spec that stubs one and not
      // the other gets an undefined total rather than a passing test.
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    poem: {
      // Defaulted to an empty result for the same reason the users one is: the
      // write path's `deriveSlug` reads the neighbouring slugs, and no spec
      // about creating a poem is written to think about that query.
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
      // `findFirst` and not `findUnique` on the read path: the public lookup
      // carries the PUBLISHED constraint alongside the slug, which `findUnique`
      // has no way to accept. The write path uses `findUnique` below, because it
      // looks a poem up by its id and applies the constraints itself.
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tag: {
      // The write path resolves tag slugs to ids before it writes a poem.
      // Defaulted to nothing, so a spec that sends `tags` without stubbing this
      // fails on the 400 it would really get rather than on `undefined.length`.
      findMany: vi.fn().mockResolvedValue([]),
    },
    review: {
      // Written by the queue's two decisions and by nothing else. `deleteMany`
      // is the seed's, not the API's, and is absent for the reason the note
      // above gives: a delegate that appears here is one the application calls.
      create: vi.fn().mockResolvedValue({ id: REVIEW_ID }),
    },
    /**
     * The array form, which is the only one the application uses.
     *
     * `Promise.all` is a faithful enough stand-in for what a spec can observe:
     * the real thing runs the operations in one database transaction, and every
     * delegate above already returns a settled promise, so the results arrive in
     * order and a rejection from either operation rejects the whole call. What
     * this cannot reproduce is the rollback — the other operation's mock has
     * already "succeeded" — so a spec asserting that a failed decision wrote no
     * `Review` is asserting against the fake rather than against Postgres. That
     * half belongs to a test with a real database, which this file's own note
     * explains the absence of.
     */
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
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
 *
 * `target` is the constraint the database rejected the write on, and it is
 * optional here for a reason: Prisma sets it on a P2002 but not on every error,
 * and the service has to read a missing one as "the email index" rather than
 * throwing on `undefined`. Omitting it is therefore a case worth stubbing, not
 * a shortcut.
 *
 * Both shapes are allowed because Prisma reports both — Postgres sends the
 * index name as a string, other connectors an array of column names — and the
 * service claims to handle either.
 */
export function prismaError(
  code: string,
  target?: string | string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Stubbed Prisma failure (${code}).`, {
    code,
    clientVersion: "test",
    ...(target === undefined ? {} : { meta: { target } }),
  });
}

/** The partial unique index that allows a single ROOT row. */
export const ONE_ROOT_INDEX = "users_one_root";
