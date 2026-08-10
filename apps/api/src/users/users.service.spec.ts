import { DEFAULT_PER_PAGE, listUsersQuerySchema } from "@moodnight/shared";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import {
  createPrismaMock,
  ONE_ROOT_INDEX,
  OTHER_USER_ID,
  type PrismaMock,
  prismaError,
  USER_ID,
  userJson,
  userRow,
} from "../testing/prisma-mock";
import { UsersService } from "./users.service";

/**
 * What the queries themselves say — which columns are selected, in what order
 * rows come back, and what happens to a database error the service does not
 * recognise.
 *
 * None of that is visible over HTTP, so it is asserted here rather than in
 * users.controller.spec.ts. The two files divide along that line: the HTTP one
 * covers the contract a client sees, this one covers the instructions sent to
 * Postgres. Response bodies are not re-checked here.
 */
describe("UsersService", () => {
  let service: UsersService;
  let prisma: PrismaMock;

  /**
   * The exact `select` every read and write is expected to carry. Written out
   * rather than imported, because importing the constant from the service would
   * make this assertion true by construction — it has to be a second,
   * independent statement of the list for it to catch a column being added.
   *
   * `passwordHash` and `tokenVersion` are the reason this matters now rather
   * than in principle: both exist on the model, and a `select` dropped anywhere
   * in the service would have Prisma fall back to every scalar and start
   * returning a password hash from `GET /users`. This list is what fails first.
   */
  const PUBLIC_FIELDS = {
    id: true,
    email: true,
    name: true,
    surname: true,
    role: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  };

  /**
   * Who is asking. `update` takes the whole actor rather than a role, because
   * one of its rules — nobody retires their own account — is about which row is
   * making the request.
   *
   * Both hold `OTHER_USER_ID` while every test targets `USER_ID`, so the
   * default throughout is an administrator acting on somebody else. The one
   * test that wants the other case builds its actor inline, where the shared id
   * is the whole point of the assertion and worth seeing.
   */
  const ADMIN = { id: OTHER_USER_ID, role: "ADMIN" } as const;
  const ROOT = { id: OTHER_USER_ID, role: "ROOT" } as const;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe("list", () => {
    /** The query as the schema hands it over when a client sends nothing. */
    const defaults = listUsersQuerySchema.parse({});

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
    });

    it("selects only the public columns, newest first, breaking ties by id", async () => {
      await service.list(defaults);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        // Both keys matter: `createdAt` alone leaves rows written in the same
        // millisecond in an order Postgres is free to change between requests,
        // which is how a paged list starts repeating and skipping rows.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: DEFAULT_PER_PAGE,
        select: PUBLIC_FIELDS,
      });
    });

    it("maps Prisma's Dates to ISO strings", async () => {
      prisma.user.findMany.mockResolvedValue([userRow()]);
      prisma.user.count.mockResolvedValue(1);

      await expect(service.list(defaults)).resolves.toEqual({
        items: [userJson()],
        total: 1,
        page: 1,
        perPage: DEFAULT_PER_PAGE,
        pageCount: 1,
      });
    });

    /**
     * The two queries have to describe the same set of rows, or the count is
     * the total for a different search than the one that produced the page.
     * Asserting they were handed the identical object is what pins that down;
     * building the `where` twice is exactly the bug it would not catch.
     */
    it("counts with the same where clause as the page it accompanies", async () => {
      await service.list(listUsersQuerySchema.parse({ search: "леся", role: "ADMIN" }));

      const [findMany] = prisma.user.findMany.mock.calls[0] as [{ where: unknown }];
      const [count] = prisma.user.count.mock.calls[0] as [{ where: unknown }];

      expect(count.where).toEqual(findMany.where);
      expect(count).toEqual({ where: findMany.where });
    });

    it("reports how many pages the total divides into", async () => {
      prisma.user.count.mockResolvedValue(41);

      await expect(
        service.list(listUsersQuerySchema.parse({ perPage: "20" })),
      ).resolves.toMatchObject({ total: 41, pageCount: 3 });
    });

    // Not 1. A pager that says "page 1 of 1" over an empty table is claiming
    // there is something to look at.
    it("reports no pages at all when nothing matches", async () => {
      await expect(service.list(defaults)).resolves.toMatchObject({ total: 0, pageCount: 0 });
    });

    // Deleting the last row of the last page leaves a client asking for a page
    // that no longer exists; the honest answer is an empty one with the true
    // total, which is what lets it step back rather than handle a 404.
    it("answers an empty page past the end rather than refusing", async () => {
      prisma.user.count.mockResolvedValue(3);

      await expect(service.list(listUsersQuerySchema.parse({ page: "9" }))).resolves.toEqual({
        items: [],
        total: 3,
        page: 9,
        perPage: DEFAULT_PER_PAGE,
        pageCount: 1,
      });
    });
  });

  describe("findOne", () => {
    it("looks the row up by id with the public columns", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      await service.findOne(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: PUBLIC_FIELDS,
      });
    });

    it("throws a 404 rather than returning null", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(USER_ID)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("create", () => {
    const input = { email: "Poet@Moodnight.dev", name: "Леся", surname: "Українка" };

    it("writes the normalised email and selects the public columns back", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await service.create(input);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ...input, email: "poet@moodnight.dev" }),
        select: PUBLIC_FIELDS,
      });
    });

    /**
     * The three columns a row cannot exist without and no client may send.
     *
     * They are asserted here rather than folded into the case above because
     * they are a different claim: that one is about the email being lowercased,
     * this one is about the account arriving with a public identity nobody
     * asked for. The slug is the interesting one — it is the account's address
     * for the rest of its life, and it is derived here exactly once.
     */
    it("derives the public profile from the name, transliterating the slug", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await service.create(input);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            penName: "Леся Українка",
            initials: "ЛУ",
            slug: "lesia-ukrainka",
          }),
        }),
      );
    });

    // The suffix is what keeps two people with the same name from being one
    // 409. `deriveProfile` reads the slugs already taken under the same prefix
    // and steps past them; `-2` because the unsuffixed slug is the first.
    it("steps past a slug somebody already holds", async () => {
      prisma.user.findMany.mockResolvedValue([{ slug: "lesia-ukrainka" }]);
      prisma.user.create.mockResolvedValue(userRow());

      await service.create(input);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "lesia-ukrainka-2" }),
        }),
      );
    });

    // A P2002 naming the slug index is a genuine race — two requests picking
    // the same suffix — and has to be told apart from the email one, or an
    // administrator is sent looking for a duplicate address that does not exist.
    it("answers a slug collision with its own 409, not the email one", async () => {
      prisma.user.create.mockRejectedValue(prismaError("P2002", "users_slug_key"));

      await expect(service.create(input)).rejects.toMatchObject({ status: 409 });
      await expect(service.create(input)).rejects.toThrow(/slug/i);
    });

    /**
     * The catch is narrowed to P2002. Anything else — a dropped connection, a
     * failed constraint the code has never seen — has to keep travelling, so
     * Nest turns it into a 500 and it reaches the logs as an error.
     *
     * The failure this guards against is a `catch` widened to swallow every
     * Prisma error and report it as a conflict, which would turn an outage into
     * a stream of plausible-looking 409s.
     */
    it("rethrows a database error it does not recognise", async () => {
      const unknown = prismaError("P1001");
      prisma.user.create.mockRejectedValue(unknown);

      await expect(service.create(input)).rejects.toBe(unknown);
    });

    it("rethrows a non-Prisma error untouched", async () => {
      const boom = new Error("boom");
      prisma.user.create.mockRejectedValue(boom);

      await expect(service.create(input)).rejects.toBe(boom);
    });

    /**
     * Which of the table's two unique indexes was violated is read out of
     * `meta.target`, and Prisma does not report it in one shape — Postgres
     * sends the index name as a string, other connectors an array. The string
     * form is covered over HTTP in users.controller.spec.ts; the array is
     * checked here, because nothing about it is visible in a response body.
     *
     * Both messages are asserted, not just the root one: a check that matched
     * too eagerly would answer "there is already a root account" to someone who
     * merely reused an email, and that reads as a passing test.
     */
    it("recognises the single-root index whether the target is a string or an array", async () => {
      const root = { ...input, role: "ROOT" } as const;

      prisma.user.create.mockRejectedValue(prismaError("P2002", ONE_ROOT_INDEX));
      await expect(service.create(root)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("already a root account"),
      });

      prisma.user.create.mockRejectedValue(prismaError("P2002", [ONE_ROOT_INDEX]));
      await expect(service.create(root)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("already a root account"),
      });

      prisma.user.create.mockRejectedValue(prismaError("P2002", ["email"]));
      await expect(service.create(root)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("poet@moodnight.dev already exists"),
      });
    });
  });

  describe("update", () => {
    // Both write paths read the target's role first, to decide whether the row
    // being touched is the root account. Every case below stubs that read.
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ role: "AUTHOR" });
    });

    it("leaves a patch without an email alone", async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await service.update(USER_ID, { name: "Ольга" }, ADMIN);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { name: "Ольга" },
        select: PUBLIC_FIELDS,
      });
    });

    it("rethrows a database error it does not recognise", async () => {
      const unknown = prismaError("P1001");
      prisma.user.update.mockRejectedValue(unknown);

      await expect(service.update(USER_ID, { name: "Ольга" }, ADMIN)).rejects.toBe(unknown);
    });

    it("404s on a row that is gone before reaching the update", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update(USER_ID, { name: "Ольга" }, ADMIN)).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  /**
   * Retiring an account, which is the operation that actually applies to
   * somebody who has used the site — `Poem.author` and `Review.reviewer` are
   * both `Restrict`, so deleting them is refused by the database.
   */
  describe("deactivation", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ role: "AUTHOR" });
      prisma.user.update.mockResolvedValue(userRow({ active: false }));
    });

    /**
     * The column and the sign-out are one write, and that is the assertion —
     * not that both happened, but that they happened in the same statement.
     * Two calls would leave a window where the account is retired and its
     * refresh tokens still verify, and would let the second half fail on its
     * own.
     */
    it("ends every session in the same write that retires the account", async () => {
      await service.update(USER_ID, { active: false }, ADMIN);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { active: false, tokenVersion: { increment: 1 } },
        select: PUBLIC_FIELDS,
      });
    });

    // Nothing was issued while the account was down, so there is nothing to
    // invalidate — and bumping anyway would cost the owner the sessions they
    // are in the middle of being handed back.
    it("does not touch the token version when reactivating", async () => {
      await service.update(USER_ID, { active: true }, ADMIN);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { active: true },
        select: PUBLIC_FIELDS,
      });
    });

    /**
     * Unrecoverable by the person who did it: the write ends their session and
     * the login path then refuses the credential that would undo it. On a site
     * whose administration may be one person, nobody else may exist to undo it
     * for them.
     */
    it("refuses to let anyone retire the account they are asking from", async () => {
      const self = { id: USER_ID, role: "ADMIN" } as const;

      await expect(service.update(USER_ID, { active: false }, self)).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    // The rule is about retiring, not about the field: an account editing its
    // own name — or turning itself back on, which it cannot reach anyway — is
    // not what locks anybody out.
    it("lets an account edit itself in every other way", async () => {
      const self = { id: USER_ID, role: "ADMIN" } as const;

      await expect(service.update(USER_ID, { name: "Ольга" }, self)).resolves.toBeDefined();
    });

    // An admin may not touch the root account at all, and that check runs
    // before the write like the others.
    it("still refuses an admin retiring the root account", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ROOT" });

      await expect(service.update(USER_ID, { active: false }, ADMIN)).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("the two ROOT rules", () => {
    // The `users_one_root` index enforces that no two accounts hold the role.
    // These are the other half: who may hand it over. Both are checked before
    // any write is attempted, which is what the `not.toHaveBeenCalled` lines
    // are there to hold.
    it("refuses to let an admin appoint a root, on create or on update", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "AUTHOR" });

      const input = { email: "poet@moodnight.dev", name: "Леся", surname: "Українка" } as const;

      await expect(service.create({ ...input, role: "ROOT" }, "ADMIN")).rejects.toMatchObject({
        status: 403,
      });
      await expect(service.update(USER_ID, { role: "ROOT" }, ADMIN)).rejects.toMatchObject({
        status: 403,
      });

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    // The hole this closes by name: an admin who could delete the root account
    // could then create a new one and appoint themselves, since only the
    // uniqueness of the role was ever enforced and not who may take it.
    it("refuses to let an admin edit or delete the root account", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ROOT" });

      await expect(service.update(USER_ID, { name: "Ольга" }, ADMIN)).rejects.toMatchObject({
        status: 403,
      });
      await expect(service.remove(USER_ID, "ADMIN")).rejects.toMatchObject({ status: 403 });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("lets the root do both, which is what keeps the role transferable", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ROOT" });
      prisma.user.update.mockResolvedValue(userRow({ role: "AUTHOR" }));

      await expect(service.update(USER_ID, { role: "AUTHOR" }, ROOT)).resolves.toBeDefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });

    // Registration reaches `create` with nobody signed in. It is safe without
    // an actor only because `registerSchema` has no `role` field to carry — so
    // this asserts the absence of the check, not an exemption from it.
    it("skips the check entirely when there is no actor, as registration has none", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await expect(
        service.create({ email: "poet@moodnight.dev", name: "Леся", surname: "Українка" }),
      ).resolves.toBeDefined();
    });
  });

  describe("passwords", () => {
    const input = { email: "poet@moodnight.dev", name: "Леся", surname: "Українка" } as const;

    it("hashes the password and never writes the plaintext", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await service.create({ ...input, password: "nightfall-7" });

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];

      expect(data).not.toHaveProperty("password");
      expect(data.passwordHash).toEqual(expect.stringMatching(/^\$argon2id\$/));
      expect(JSON.stringify(data)).not.toContain("nightfall-7");
    });

    // An account may exist before it has a password; the column is nullable for
    // exactly that. Writing an explicit null would be the same outcome, but
    // omitting the key is what lets the column's own default stand.
    it("omits the column entirely when no password is given", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await service.create(input);

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data).not.toHaveProperty("passwordHash");
    });
  });

  describe("revokeSessions", () => {
    // `increment` and not a read-then-write: two sign-outs racing each other
    // both have to invalidate, and reading the value first would let the slower
    // one write back a number the faster one had already passed.
    it("increments the token version in the database rather than in memory", async () => {
      prisma.user.update.mockResolvedValue({ id: USER_ID });

      await service.revokeSessions(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true },
      });
    });

    it("404s when the account is already gone", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2025"));

      await expect(service.revokeSessions(USER_ID)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("findForAuth", () => {
    it("looks the account up by its normalised email and reads the hash", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.findForAuth("Poet@Moodnight.dev");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "poet@moodnight.dev" },
        // `active` is read beside the credential rather than in a query of its
        // own: the login path cannot verify a password without also holding the
        // answer to whether the account is allowed to use it.
        select: { id: true, role: true, active: true, passwordHash: true, tokenVersion: true },
      });
    });
  });

  describe("remove", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ role: "AUTHOR" });
    });

    // The row is not read back — nothing renders it and the route is a 204 —
    // so the delete asks Postgres for one column instead of seven.
    it("carries only the id back from the database", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await service.remove(USER_ID, "ADMIN");

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { id: true },
      });
    });

    it("resolves to nothing", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await expect(service.remove(USER_ID, "ADMIN")).resolves.toBeUndefined();
    });

    it("rethrows a database error it does not recognise", async () => {
      const unknown = prismaError("P1001");
      prisma.user.delete.mockRejectedValue(unknown);

      await expect(service.remove(USER_ID, "ADMIN")).rejects.toBe(unknown);
    });

    /**
     * The ordinary case, not an edge one. Both relations pointing at `users`
     * are `onDelete: Restrict`, so this is the answer for every account that
     * has published or moderated anything — which is every account anyone would
     * think to delete.
     *
     * Without the catch it reaches the client as a 500, and an administrator
     * learns only that something broke. The message has to name the alternative
     * that does apply, so the test asserts it points at deactivation rather
     * than merely carrying the right status.
     */
    it("409s rather than 500s when poems or reviews still point at the account", async () => {
      prisma.user.delete.mockRejectedValue(prismaError("P2003"));

      await expect(service.remove(USER_ID, "ADMIN")).rejects.toMatchObject({ status: 409 });
      await expect(service.remove(USER_ID, "ADMIN")).rejects.toThrow(/deactivate/i);
    });
  });
});
