import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TokensService } from "../auth/tokens.service";
import { PrismaService } from "../prisma/prisma.service";
import { authTestImports, authTestProviders } from "../testing/auth-harness";
import {
  createPrismaMock,
  ONE_ROOT_INDEX,
  OTHER_USER_ID,
  type PrismaMock,
  prismaError,
  USER_ID,
  UUID_V4,
  userJson,
  userRow,
} from "../testing/prisma-mock";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * The users endpoints, exercised over HTTP.
 *
 * These go through a real Nest application rather than calling the controller's
 * methods directly, because most of what a route promises is not in its method
 * body: the UUID pipe, the zod pipe, `@HttpCode(204)`, the guards, and the
 * mapping from a thrown `ConflictException` to a 409 payload all live in the
 * framework. A direct call would test the one line that delegates to the
 * service and quietly skip everything a client actually depends on.
 *
 * Only the database is faked — the tokens are real ones, signed and verified by
 * the same `TokensService` the application uses, so these cases exercise
 * signature checking rather than a mock that always agrees.
 *
 * The application is otherwise assembled the way main.ts assembles it, which
 * stays easy to keep true because main.ts registers no global pipes, filters,
 * interceptors or guards — the guards are on the controller, where they are
 * visible from the routes they protect.
 */
describe("Users endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  /** Real access tokens, one per role, minted once for the whole file. */
  let asEditor: string;
  let asAdmin: string;
  let asRoot: string;
  let asAuthor: string;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [UsersController],
      providers: [UsersService, ...authTestProviders, { provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const tokens = moduleRef.get(TokensService);
    [asAuthor, asEditor, asAdmin, asRoot] = await Promise.all([
      tokens.signAccess(OTHER_USER_ID, "AUTHOR"),
      tokens.signAccess(OTHER_USER_ID, "EDITOR"),
      tokens.signAccess(OTHER_USER_ID, "ADMIN"),
      tokens.signAccess(OTHER_USER_ID, "ROOT"),
    ]);
  });

  // Built once and shared: `init()` is the expensive part, and each test sets
  // up the stub responses it needs, so there is no state to leak between them.
  beforeEach(() => {
    vi.clearAllMocks();
    // Both write paths read the target's role first to decide whether the row
    // is the root account. Unless a case says otherwise, it is not.
    prisma.user.findUnique.mockResolvedValue(userRow());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** `.set(...auth(asAdmin))` — the header pair, spelled once. */
  const auth = (token: string): [string, string] => ["authorization", `Bearer ${token}`];

  describe("GET /users", () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
    });

    it("returns a page of users with the timestamps serialised as ISO strings", async () => {
      prisma.user.findMany.mockResolvedValue([userRow(), userRow({ id: OTHER_USER_ID })]);
      prisma.user.count.mockResolvedValue(2);

      const response = await http()
        .get("/users")
        .set(...auth(asEditor))
        .expect(200);

      expect(response.body).toEqual({
        items: [userJson(), userJson({ id: OTHER_USER_ID })],
        total: 2,
        page: 1,
        perPage: 20,
        pageCount: 1,
      });
    });

    it("returns an empty page rather than a 404 when there are no users", async () => {
      const response = await http()
        .get("/users")
        .set(...auth(asEditor))
        .expect(200);

      expect(response.body).toEqual({ items: [], total: 0, page: 1, perPage: 20, pageCount: 0 });
    });

    /**
     * The whole point of going over HTTP for these: a query string is strings
     * and arrays of strings, and everything the service relies on — a numeric
     * `page`, a `role` that is a list whether one was sent or three — happens
     * in the pipe between the two. Calling the service directly would skip it.
     */
    it("turns the query string into the query the database is asked", async () => {
      await http()
        .get(
          "/users?page=2&perPage=5&search=%20леся%20укра%20&sort=surname&order=asc&role=ADMIN&role=EDITOR",
        )
        .set(...auth(asEditor))
        .expect(200);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { name: { contains: "леся", mode: "insensitive" } },
                  { surname: { contains: "леся", mode: "insensitive" } },
                  { email: { contains: "леся", mode: "insensitive" } },
                ],
              },
              {
                OR: [
                  { name: { contains: "укра", mode: "insensitive" } },
                  { surname: { contains: "укра", mode: "insensitive" } },
                  { email: { contains: "укра", mode: "insensitive" } },
                ],
              },
            ],
            role: { in: ["ADMIN", "EDITOR"] },
          },
          orderBy: [{ surname: "asc" }, { id: "asc" }],
          skip: 5,
          take: 5,
        }),
      );
    });

    it("answers the unfiltered first page when no parameters are sent", async () => {
      await http()
        .get("/users")
        .set(...auth(asEditor))
        .expect(200);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: 0,
          take: 20,
        }),
      );
    });

    // A table that keeps its controls in the URL writes these the moment they
    // are cleared, and a 400 for a cleared search box is not a usable API.
    it("reads emptied parameters as absent ones", async () => {
      await http()
        .get("/users?search=&role=&sort=&order=&page=")
        .set(...auth(asEditor))
        .expect(200);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });

    // Each of these is a column the endpoint deliberately does not expose to
    // ordering, filtering or paging — and every one of them has to be refused
    // before a query is built, not after.
    it("400s on a query it does not accept, without asking the database", async () => {
      for (const query of [
        "sort=passwordHash",
        "sort=tokenVersion",
        "order=sideways",
        "role=SUPERUSER",
        "perPage=1000",
        "page=0",
        "email=poet@moodnight.dev",
        "nmae=Леся",
      ]) {
        await http()
          .get(`/users?${query}`)
          .set(...auth(asEditor))
          .expect(400);
      }

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it("names the offending parameter in the 400", async () => {
      const response = await http()
        .get("/users?sort=passwordHash")
        .set(...auth(asEditor))
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("sort")]),
      );
    });
  });

  describe("GET /users/:id", () => {
    it("returns the user", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      const response = await http()
        .get(`/users/${USER_ID}`)
        .set(...auth(asEditor))
        .expect(200);

      expect(response.body).toEqual(userJson());
    });

    it("404s when no row has that id", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await http()
        .get(`/users/${USER_ID}`)
        .set(...auth(asEditor))
        .expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("400s on an id that is not a UUID, without querying", async () => {
      await http()
        .get("/users/not-a-uuid")
        .set(...auth(asEditor))
        .expect(400);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    // The distinction the controller's `ParseUUIDPipe({ version: "7" })` buys:
    // a v4 id cannot have come from this database, so it is a malformed request
    // and not a lookup that happens to miss.
    it("400s on a well-formed UUID of the wrong version", async () => {
      const response = await http()
        .get(`/users/${UUID_V4}`)
        .set(...auth(asEditor))
        .expect(400);

      expect(response.body.message).toContain("uuid");
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /users", () => {
    const body = {
      email: "New.Poet@Moodnight.dev",
      name: "Іван",
      surname: "Франко",
    };

    it("creates the user and answers 201", async () => {
      prisma.user.create.mockResolvedValue(userRow({ email: "new.poet@moodnight.dev" }));

      const response = await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send(body)
        .expect(201);

      expect(response.body).toEqual(userJson({ email: "new.poet@moodnight.dev" }));
    });

    // The unique index is case-sensitive, so this is the request that decides
    // whether `Poet@…` and `poet@…` can both be registered.
    it("lowercases the email before writing it", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send(body)
        .expect(201);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "new.poet@moodnight.dev" }),
        }),
      );
    });

    it("accepts an explicit role and passes it through", async () => {
      prisma.user.create.mockResolvedValue(userRow({ role: "EDITOR" }));

      await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send({ ...body, role: "EDITOR" })
        .expect(201);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "EDITOR" }) }),
      );
    });

    it("omits role entirely when the client does, leaving the column default to apply", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send(body)
        .expect(201);

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data).not.toHaveProperty("role");
    });

    it("400s and writes nothing when a required field is missing", async () => {
      const { surname: _surname, ...withoutSurname } = body;

      const response = await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send(withoutSurname)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("surname")]),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("400s on a malformed email", async () => {
      const response = await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send({ ...body, email: "not-an-email" })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("email")]),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    // `createUserSchema` is `.strict()`. A misspelled key is a request that
    // would otherwise appear to succeed while silently dropping a field.
    it("400s on an unrecognised key", async () => {
      const response = await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send({ ...body, sirname: "Франко" })
        .expect(400);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("sirname")]),
      );
    });

    it("409s when the email is taken, naming the normalised address", async () => {
      prisma.user.create.mockRejectedValue(prismaError("P2002"));

      const response = await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send(body)
        .expect(409);

      expect(response.body.message).toBe(
        "A user with the email new.poet@moodnight.dev already exists.",
      );
    });

    // ROOT is a legal value in the schema, so the request gets as far as the
    // database and comes back refused by the single-root index. The message has
    // to say which of the two unique indexes rejected it — a client told "that
    // email is taken" about an address nobody has would have nothing to act on.
    it("409s about the root account when a second one is created", async () => {
      prisma.user.create.mockRejectedValue(prismaError("P2002", ONE_ROOT_INDEX));

      const response = await http()
        .post("/users")
        .set(...auth(asRoot))
        .send({ ...body, role: "ROOT" })
        .expect(409);

      expect(response.body.message).toContain("already a root account");
    });

    it("passes ROOT through to the database rather than rejecting it up front", async () => {
      prisma.user.create.mockResolvedValue(userRow({ role: "ROOT" }));

      const response = await http()
        .post("/users")
        .set(...auth(asRoot))
        .send({ ...body, role: "ROOT" })
        .expect(201);

      expect(response.body.role).toBe("ROOT");
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "ROOT" }) }),
      );
    });
  });

  describe("PATCH /users/:id", () => {
    it("applies a partial change and returns the updated user", async () => {
      prisma.user.update.mockResolvedValue(userRow({ name: "Ольга" }));

      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ name: "Ольга" })
        .expect(200);

      expect(response.body).toEqual(userJson({ name: "Ольга" }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID }, data: { name: "Ольга" } }),
      );
    });

    it("lowercases an email being changed", async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ email: "Renamed@Moodnight.DEV" })
        .expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: "renamed@moodnight.dev" } }),
      );
    });

    // Prisma stamps `updatedAt` on every `update`, so an empty patch is not a
    // harmless no-op — it would rewrite the row's history to say something
    // changed. The schema's refinement is what stops it, and this is the test
    // that would notice if it were dropped.
    it("400s on an empty body", async () => {
      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("at least one")]),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("400s on an unrecognised key", async () => {
      await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ nickname: "Kamenyar" })
        .expect(400);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("400s on a malformed id before reading the body", async () => {
      await http()
        .patch("/users/not-a-uuid")
        .set(...auth(asAdmin))
        .send({ name: "Ольга" })
        .expect(400);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("404s when the row is gone", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2025"));

      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ name: "Ольга" })
        .expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("409s when the new email is taken", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2002"));

      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ email: "Taken@Moodnight.dev" })
        .expect(409);

      expect(response.body.message).toBe(
        "A user with the email taken@moodnight.dev already exists.",
      );
    });

    it("409s when promoting an account to ROOT while one already holds it", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2002", ONE_ROOT_INDEX));

      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asRoot))
        .send({ role: "ROOT" })
        .expect(409);

      expect(response.body.message).toContain("already a root account");
    });
  });

  describe("DELETE /users/:id", () => {
    it("answers 204 with no body", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      const response = await http()
        .delete(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .expect(204);

      expect(response.text).toBe("");
      expect(prisma.user.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } }),
      );
    });

    // Deleting something that is already gone is a client mistake worth
    // reporting, not an idempotent success — the documented behaviour, kept
    // honest here because it is the kind of thing a refactor "simplifies" away.
    it("404s when the row is already gone", async () => {
      prisma.user.delete.mockRejectedValue(prismaError("P2025"));

      const response = await http()
        .delete(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("400s on a malformed id, without deleting anything", async () => {
      await http()
        .delete("/users/not-a-uuid")
        .set(...auth(asAdmin))
        .expect(400);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * The hole this controller documented for two phases, closed.
   *
   * Every case here asserts that nothing reached the database, because a guard
   * that runs *after* the work is not a guard. Nest runs guards before pipes
   * and before the handler, which is what these `not.toHaveBeenCalled` lines
   * are actually pinning down.
   */
  describe("who may do what", () => {
    // Sequential rather than a `Promise.all`: supertest starts a fresh
    // ephemeral listener per request, and five at once against the same server
    // intermittently resets the connection.
    it("401s on every route without a token", async () => {
      await http().get("/users").expect(401);
      await http().get(`/users/${USER_ID}`).expect(401);
      await http().post("/users").send({}).expect(401);
      await http().patch(`/users/${USER_ID}`).send({ name: "Ольга" }).expect(401);
      await http().delete(`/users/${USER_ID}`).expect(401);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("401s on a token this API did not sign", async () => {
      const forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IlJPT1QifQ.not-a-signature";

      await http()
        .get("/users")
        .set(...auth(forged))
        .expect(401);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    // The reads hand out every member's email address, which is why they are
    // not open to the authors those addresses belong to.
    it("403s an author trying to read the user list", async () => {
      await http()
        .get("/users")
        .set(...auth(asAuthor))
        .expect(403);
      await http()
        .get(`/users/${USER_ID}`)
        .set(...auth(asAuthor))
        .expect(403);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it("403s an editor trying to write, while letting the same editor read", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await http()
        .get("/users")
        .set(...auth(asEditor))
        .expect(200);

      await http()
        .post("/users")
        .set(...auth(asEditor))
        .send({ email: "poet@moodnight.dev", name: "Леся", surname: "Українка" })
        .expect(403);
      await http()
        .delete(`/users/${USER_ID}`)
        .set(...auth(asEditor))
        .expect(403);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    // `@Roles("EDITOR")` means "EDITOR or above" — the ladder is compared by
    // rank, so a route names the lowest role it accepts and every role above it
    // passes without being listed.
    it("lets a role above the requirement through", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await http()
        .get("/users")
        .set(...auth(asAdmin))
        .expect(200);
      await http()
        .get("/users")
        .set(...auth(asRoot))
        .expect(200);
    });

    it("403s an admin appointing a root, without reaching the database", async () => {
      await http()
        .post("/users")
        .set(...auth(asAdmin))
        .send({ email: "poet@moodnight.dev", name: "Леся", surname: "Українка", role: "ROOT" })
        .expect(403);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    /**
     * The specific escalation the old comment named: an admin who could delete
     * the root account could then create a new one and appoint themselves,
     * since the database only ever enforced that the role was unique — never
     * who was allowed to take it.
     */
    it("403s an admin editing or deleting the root account", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: "ROOT" }));

      await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ email: "mine@moodnight.dev" })
        .expect(403);
      await http()
        .delete(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .expect(403);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("lets the root demote itself, which is what keeps the role transferable", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: "ROOT" }));
      prisma.user.update.mockResolvedValue(userRow({ role: "ADMIN" }));

      await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asRoot))
        .send({ role: "ADMIN" })
        .expect(200);
    });

    // `updateUserSchema` has no `password`, deliberately: deriving it from the
    // create schema would let any admin overwrite another account's password
    // and then sign in as its owner.
    it("400s an attempt to set a password through the admin update route", async () => {
      const response = await http()
        .patch(`/users/${USER_ID}`)
        .set(...auth(asAdmin))
        .send({ password: "taking-this-account" })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("password")]),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
