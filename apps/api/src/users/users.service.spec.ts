import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import {
  createPrismaMock,
  ONE_ROOT_INDEX,
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
   * When Phase 3 adds `passwordHash`, this is the test that fails if a `select`
   * anywhere in the service is dropped and Prisma falls back to every scalar.
   */
  const PUBLIC_FIELDS = {
    id: true,
    email: true,
    name: true,
    surname: true,
    role: true,
    createdAt: true,
    updatedAt: true,
  };

  beforeEach(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe("findAll", () => {
    it("selects only the public columns, newest first, breaking ties by id", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: PUBLIC_FIELDS,
        // Both keys matter: `createdAt` alone leaves rows written in the same
        // millisecond in an order Postgres is free to change between requests.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("maps Prisma's Dates to ISO strings", async () => {
      prisma.user.findMany.mockResolvedValue([userRow()]);

      await expect(service.findAll()).resolves.toEqual([userJson()]);
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
        data: { ...input, email: "poet@moodnight.dev" },
        select: PUBLIC_FIELDS,
      });
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
    it("leaves a patch without an email alone", async () => {
      prisma.user.update.mockResolvedValue(userRow());

      await service.update(USER_ID, { name: "Ольга" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { name: "Ольга" },
        select: PUBLIC_FIELDS,
      });
    });

    it("rethrows a database error it does not recognise", async () => {
      const unknown = prismaError("P1001");
      prisma.user.update.mockRejectedValue(unknown);

      await expect(service.update(USER_ID, { name: "Ольга" })).rejects.toBe(unknown);
    });
  });

  describe("remove", () => {
    // The row is not read back — nothing renders it and the route is a 204 —
    // so the delete asks Postgres for one column instead of seven.
    it("carries only the id back from the database", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await service.remove(USER_ID);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { id: true },
      });
    });

    it("resolves to nothing", async () => {
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await expect(service.remove(USER_ID)).resolves.toBeUndefined();
    });

    it("rethrows a database error it does not recognise", async () => {
      const unknown = prismaError("P1001");
      prisma.user.delete.mockRejectedValue(unknown);

      await expect(service.remove(USER_ID)).rejects.toBe(unknown);
    });
  });
});
