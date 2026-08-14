import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@moodnight/db";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TokensService } from "../auth/tokens.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  accessTokenFor,
  authTestImports,
  authTestProviders,
  bearer,
} from "../testing/auth-harness";
import {
  createPrismaMock,
  OTHER_USER_ID,
  POEM_ID,
  type PrismaMock,
  queuedPoemRow,
  studioPoemRow,
  USER_ID,
  UUID_V4,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { PoemStudioController } from "./poem-studio.controller";
import { PoemStudioService } from "./poem-studio.service";

/**
 * The studio's read path, exercised over HTTP.
 *
 * Two properties carry most of these cases, and neither is visible in a
 * successful response:
 *
 * 1. **The list cannot be widened past its author.** `authorId` is a base
 *    constraint, so the assertions look at the `where` the service handed
 *    Prisma rather than at the rows that came back — a mock returns whatever it
 *    was told to, and the only honest question is what was asked.
 * 2. **The single read applies the ownership rule and not the base.** An editor
 *    must be able to open somebody else's pending poem in full, and an author
 *    must not.
 */
describe("Studio poem endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  /** The author every fixture poem belongs to. */
  let asAuthor: string;
  /** A second author, who owns nothing here. */
  let asOtherAuthor: string;
  /** An editor who is also not the author — the two rules have to be told apart. */
  let asEditor: string;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [PoemStudioController],
      providers: [
        PoemStudioService,
        ...authTestProviders,
        // Not used by anything under test: `authTestProviders` carries the
        // refresh strategy, which reads an account's token version, and Nest
        // resolves the whole graph whether or not a route reaches it.
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const tokens = moduleRef.get(TokensService);
    asAuthor = await accessTokenFor(tokens, "AUTHOR", USER_ID);
    asOtherAuthor = await accessTokenFor(tokens, "AUTHOR", OTHER_USER_ID);
    asEditor = await accessTokenFor(tokens, "EDITOR", OTHER_USER_ID);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.poem.findMany.mockResolvedValue([studioPoemRow({ status: "DRAFT" })]);
    prisma.poem.count.mockResolvedValue(1);
    prisma.poem.findUnique.mockResolvedValue(studioPoemRow({ authorId: USER_ID }));
  });

  afterAll(async () => {
    await app.close();
  });

  /** The `where` and `orderBy` the service handed Prisma's `findMany`. */
  const queried = () => {
    const [args] = prisma.poem.findMany.mock.calls[0] as [
      {
        where: Prisma.PoemWhereInput;
        orderBy: Prisma.PoemOrderByWithRelationInput[];
        skip: number;
        take: number;
      },
    ];

    return args;
  };

  describe("GET /studio/poems", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).get("/studio/poems").expect(401);
      expect(prisma.poem.findMany).not.toHaveBeenCalled();
    });

    it("answers a signed-in author with a page of their own poems", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(queried().where).toMatchObject({ AND: [{ authorId: USER_ID }] });
      expect(body).toMatchObject({ total: 1, page: 1, pageCount: 1 });
    });

    /**
     * The one thing the studio must never do. `authorId` is not a declared
     * filter, so the parameter is refused outright rather than reaching Prisma
     * and being AND-ed into irrelevance — the omission is the boundary, and a
     * 400 naming the key is what says so.
     */
    it("refuses an attempt to ask about somebody else's shelf", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems")
        .query({ authorId: OTHER_USER_ID })
        .set(...bearer(asAuthor))
        .expect(400);

      expect(prisma.poem.findMany).not.toHaveBeenCalled();
    });

    /** An editor's studio is their own work. The queue is where they read others'. */
    it("pins the list to the caller even when the caller moderates", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asEditor))
        .expect(200);

      expect(queried().where).toMatchObject({ AND: [{ authorId: OTHER_USER_ID }] });
    });

    it("filters by status, and by several at once", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems?status=DRAFT&status=REJECTED")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(queried().where).toMatchObject({ status: { in: ["DRAFT", "REJECTED"] } });
    });

    it("refuses a status the column cannot hold", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems?status=ABANDONED")
        .set(...bearer(asAuthor))
        .expect(400);
    });

    /** Most recently saved first — what a writer returning to the studio wants. */
    it("orders by updatedAt descending unless asked otherwise", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(queried().orderBy).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
    });

    it("sorts by the poem's journey when asked to sort by status", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems?sort=status&order=asc")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(queried().orderBy).toEqual([{ status: "asc" }, { id: "asc" }]);
    });

    it("refuses a sort the list does not offer", async () => {
      await request(app.getHttpServer())
        .get("/studio/poems?sort=body")
        .set(...bearer(asAuthor))
        .expect(400);
    });

    /**
     * The whole point of the summary shape. The body is read out of the
     * database — one round trip beats two — and cut before it reaches the wire.
     */
    it("sends the first lines rather than the whole poem", async () => {
      prisma.poem.findMany.mockResolvedValue([
        studioPoemRow({
          body: ["один", "два", "три", "чотири", "п'ять", "шість", "сім"].join("\n"),
        }),
      ]);

      const { body } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.items[0]).toMatchObject({
        teaser: "один\nдва\nтри\nчотири\nп'ять\nшість",
        truncated: true,
      });
      expect(body.items[0].body).toBeUndefined();
    });

    it("carries the status and both dates a draft actually has", async () => {
      prisma.poem.findMany.mockResolvedValue([queuedPoemRow()]);

      const { body } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.items[0]).toMatchObject({
        status: "PENDING_REVIEW",
        publishedAt: null,
        submittedAt: "2026-02-28T09:10:11.000Z",
      });
    });
  });

  describe("GET /studio/poems/:id", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).get(`/studio/poems/${POEM_ID}`).expect(401);
      expect(prisma.poem.findUnique).not.toHaveBeenCalled();
    });

    it("answers with the whole poem, body and all", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body).toMatchObject({ id: POEM_ID, status: "PUBLISHED" });
      expect(body.body).toContain("один");
      expect(body.teaser).toBeUndefined();
    });

    /**
     * The reason this route is not pinned to its author the way the list is: an
     * editor decides on poems they did not write, and six lines of teaser is not
     * enough to decide on.
     */
    it("lets an editor open somebody else's poem in full", async () => {
      prisma.poem.findUnique.mockResolvedValue(queuedPoemRow({ authorId: USER_ID }));

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body).toMatchObject({ status: "PENDING_REVIEW" });
    });

    /** A 403 and not a 404: the caller has signed in, and can act on the difference. */
    it("refuses an author somebody else's poem", async () => {
      await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asOtherAuthor))
        .expect(403);
    });

    it("404s an id no poem has", async () => {
      prisma.poem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(404);
    });

    /** The pipe checks the version, not merely the shape — no round trip for a v4. */
    it("400s an id that is a UUID of the wrong version", async () => {
      await request(app.getHttpServer())
        .get(`/studio/poems/${UUID_V4}`)
        .set(...bearer(asAuthor))
        .expect(400);

      expect(prisma.poem.findUnique).not.toHaveBeenCalled();
    });
  });
});
