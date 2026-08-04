import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
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
 * body: the UUID pipe, the zod pipe, `@HttpCode(204)`, and the mapping from a
 * thrown `ConflictException` to a 409 payload all live in the framework. A
 * direct call would test the one line that delegates to the service and quietly
 * skip everything a client actually depends on.
 *
 * Only the database is faked. The application is otherwise assembled the way
 * main.ts assembles it — which is easy to keep true because main.ts registers
 * no global pipes, filters, or interceptors, so there is nothing here that has
 * to be remembered and mirrored.
 */
describe("Users endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  // Built once and shared: `init()` is the expensive part, and each test sets
  // up the stub responses it needs, so there is no state to leak between them.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe("GET /users", () => {
    it("returns every user with the timestamps serialised as ISO strings", async () => {
      prisma.user.findMany.mockResolvedValue([userRow(), userRow({ id: OTHER_USER_ID })]);

      const response = await http().get("/users").expect(200);

      expect(response.body).toEqual([userJson(), userJson({ id: OTHER_USER_ID })]);
    });

    it("returns an empty array rather than a 404 when there are no users", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const response = await http().get("/users").expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe("GET /users/:id", () => {
    it("returns the user", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      const response = await http().get(`/users/${USER_ID}`).expect(200);

      expect(response.body).toEqual(userJson());
    });

    it("404s when no row has that id", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await http().get(`/users/${USER_ID}`).expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("400s on an id that is not a UUID, without querying", async () => {
      await http().get("/users/not-a-uuid").expect(400);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    // The distinction the controller's `ParseUUIDPipe({ version: "7" })` buys:
    // a v4 id cannot have come from this database, so it is a malformed request
    // and not a lookup that happens to miss.
    it("400s on a well-formed UUID of the wrong version", async () => {
      const response = await http().get(`/users/${UUID_V4}`).expect(400);

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

      const response = await http().post("/users").send(body).expect(201);

      expect(response.body).toEqual(userJson({ email: "new.poet@moodnight.dev" }));
    });

    // The unique index is case-sensitive, so this is the request that decides
    // whether `Poet@…` and `poet@…` can both be registered.
    it("lowercases the email before writing it", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await http().post("/users").send(body).expect(201);

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
        .send({ ...body, role: "EDITOR" })
        .expect(201);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "EDITOR" }) }),
      );
    });

    it("omits role entirely when the client does, leaving the column default to apply", async () => {
      prisma.user.create.mockResolvedValue(userRow());

      await http().post("/users").send(body).expect(201);

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data).not.toHaveProperty("role");
    });

    it("400s and writes nothing when a required field is missing", async () => {
      const { surname: _surname, ...withoutSurname } = body;

      const response = await http().post("/users").send(withoutSurname).expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("surname")]),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("400s on a malformed email", async () => {
      const response = await http()
        .post("/users")
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
        .send({ ...body, sirname: "Франко" })
        .expect(400);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("sirname")]),
      );
    });

    it("409s when the email is taken, naming the normalised address", async () => {
      prisma.user.create.mockRejectedValue(prismaError("P2002"));

      const response = await http().post("/users").send(body).expect(409);

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
        .send({ ...body, role: "ROOT" })
        .expect(409);

      expect(response.body.message).toContain("already a root account");
    });

    it("passes ROOT through to the database rather than rejecting it up front", async () => {
      prisma.user.create.mockResolvedValue(userRow({ role: "ROOT" }));

      const response = await http()
        .post("/users")
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

      const response = await http().patch(`/users/${USER_ID}`).send({ name: "Ольга" }).expect(200);

      expect(response.body).toEqual(userJson({ name: "Ольга" }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID }, data: { name: "Ольга" } }),
      );
    });

    it("lowercases an email being changed", async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await http().patch(`/users/${USER_ID}`).send({ email: "Renamed@Moodnight.DEV" }).expect(200);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: "renamed@moodnight.dev" } }),
      );
    });

    // Prisma stamps `updatedAt` on every `update`, so an empty patch is not a
    // harmless no-op — it would rewrite the row's history to say something
    // changed. The schema's refinement is what stops it, and this is the test
    // that would notice if it were dropped.
    it("400s on an empty body", async () => {
      const response = await http().patch(`/users/${USER_ID}`).send({}).expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("at least one")]),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("400s on an unrecognised key", async () => {
      await http().patch(`/users/${USER_ID}`).send({ nickname: "Kamenyar" }).expect(400);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("400s on a malformed id before reading the body", async () => {
      await http().patch("/users/not-a-uuid").send({ name: "Ольга" }).expect(400);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("404s when the row is gone", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2025"));

      const response = await http().patch(`/users/${USER_ID}`).send({ name: "Ольга" }).expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("409s when the new email is taken", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2002"));

      const response = await http()
        .patch(`/users/${USER_ID}`)
        .send({ email: "Taken@Moodnight.dev" })
        .expect(409);

      expect(response.body.message).toBe(
        "A user with the email taken@moodnight.dev already exists.",
      );
    });

    it("409s when promoting an account to ROOT while one already holds it", async () => {
      prisma.user.update.mockRejectedValue(prismaError("P2002", ONE_ROOT_INDEX));

      const response = await http().patch(`/users/${USER_ID}`).send({ role: "ROOT" }).expect(409);

      expect(response.body.message).toContain("already a root account");
    });
  });

  describe("DELETE /users/:id", () => {
    it("answers 204 with no body", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      const response = await http().delete(`/users/${USER_ID}`).expect(204);

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

      const response = await http().delete(`/users/${USER_ID}`).expect(404);

      expect(response.body.message).toBe(`No user with id ${USER_ID}.`);
    });

    it("400s on a malformed id, without deleting anything", async () => {
      await http().delete("/users/not-a-uuid").expect(400);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
