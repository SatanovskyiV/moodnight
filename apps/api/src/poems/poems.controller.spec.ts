import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@moodnight/db";
import { TEASER_LINES } from "@moodnight/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { createPrismaMock, poemRow, type PrismaMock } from "../testing/prisma-mock";
import { PoemsController } from "./poems.controller";
import { PoemsService } from "./poems.service";

/**
 * The public read path, exercised over HTTP.
 *
 * Two things separate this file from the users one, and both are the point of
 * the endpoints existing. There is **no auth harness**: these routes take no
 * token, so a test that supplied one would be testing something no reader does.
 * And the assertions that matter most are about what does *not* come back — a
 * draft, an author's email address, a status the client got to choose. Those
 * are the properties that make a response safe to cache at the edge and hand to
 * anybody, and none of them is visible in a happy path.
 */
describe("Poems endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      controllers: [PoemsController],
      providers: [PoemsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.poem.findMany.mockResolvedValue([poemRow()]);
    prisma.poem.count.mockResolvedValue(1);
    prisma.poem.findFirst.mockResolvedValue(poemRow());
  });

  afterAll(async () => {
    await app.close();
  });

  /** The `where` the service handed Prisma for the page, for the cases about it. */
  const whereSent = () => {
    const [args] = prisma.poem.findMany.mock.calls[0] as [{ where: { AND?: unknown[] } }];

    return args.where;
  };

  /**
   * A `where` fragment, checked by `tsc` against the type Prisma would check it
   * against at runtime.
   *
   * This exists because of a bug these tests did not catch: `listArgs` built
   * `{ featured: { in: [true] } }`, every assertion agreed with it, and Prisma
   * rejected it as a 500 — `BoolFilter` has no `in`. The mock accepts any shape,
   * so a test asserting the shape only proved the code agreed with itself.
   *
   * Routing an expectation through this annotation closes that: the *expected*
   * value has to be a legal `PoemWhereInput`, so a case can no longer assert a
   * clause Prisma would refuse. It costs one function call and turns a class of
   * runtime 500 into a failed build.
   */
  const asPrismaWhere = (fragment: Prisma.PoemWhereInput) => fragment;

  describe("GET /poems", () => {
    it("answers a page of poems with no token at all", async () => {
      const { body } = await request(app.getHttpServer()).get("/poems").expect(200);

      expect(body).toMatchObject({ total: 1, page: 1, perPage: 20, pageCount: 1 });
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        slug: "tin-nad-polem",
        title: "Тінь над полем",
        author: { penName: "Тарас Шевченко", initials: "ТШ" },
        tags: [{ name: "Меланхолія", slug: "melankholiia" }],
      });
    });

    /**
     * The constraint the whole service is built around, asserted as a fact
     * about the query rather than as an absence in the output — a fixture that
     * happened to contain no drafts would satisfy the weaker version.
     */
    it("pins the query to published poems", () => {
      return request(app.getHttpServer())
        .get("/poems")
        .expect(200)
        .then(() => {
          expect(whereSent().AND).toContainEqual(
            asPrismaWhere({ status: "PUBLISHED", publishedAt: { not: null } }),
          );
        });
    });

    /**
     * And it cannot be lifted. `status` is not a declared filter, so the strict
     * schema refuses the parameter outright — a client asking to see drafts is
     * told the parameter does not exist rather than being quietly ignored.
     */
    it("refuses a request that tries to choose its own status", async () => {
      await request(app.getHttpServer()).get("/poems?status=DRAFT").expect(400);
    });

    // The teaser is the reason a feed page is small. The body is read out of
    // the database and cut here; what crosses the wire is six lines and a flag.
    it("sends a teaser rather than the body", async () => {
      const { body } = await request(app.getHttpServer()).get("/poems").expect(200);

      expect(body.items[0].body).toBeUndefined();
      expect(body.items[0].teaser.split("\n")).toHaveLength(TEASER_LINES);
      expect(body.items[0].truncated).toBe(true);
    });

    /**
     * `truncated` is not derivable by the client: a six-line poem and the first
     * six lines of a sixty-line one arrive identically. Getting this wrong
     * means the card fades a complete poem or fails to fade an incomplete one.
     */
    it("says a short poem was not truncated", async () => {
      prisma.poem.findMany.mockResolvedValue([poemRow({ body: "один\nдва" })]);

      const { body } = await request(app.getHttpServer()).get("/poems").expect(200);

      expect(body.items[0].teaser).toBe("один\nдва");
      expect(body.items[0].truncated).toBe(false);
    });

    /**
     * An author's row carries their email, password hash and permission role.
     * A nested `author: true` would put all three on every card in a public
     * feed, so the service names the five display columns instead — and this is
     * the case that would fail the day somebody "simplifies" that select.
     */
    it("never exposes an author's account fields", async () => {
      const { body } = await request(app.getHttpServer()).get("/poems").expect(200);

      expect(body.items[0].author).toEqual({
        slug: "taras-shevchenko",
        penName: "Тарас Шевченко",
        initials: "ТШ",
        roleTitle: "Мандрівний поет",
        avatarUrl: null,
      });

      const [args] = prisma.poem.findMany.mock.calls[0] as [
        { select: { author: { select: Record<string, boolean> } } },
      ];
      expect(args.select.author.select).not.toHaveProperty("email");
      expect(args.select.author.select).not.toHaveProperty("role");
    });

    it("filters by tag through the relation mapping", async () => {
      await request(app.getHttpServer()).get("/poems?tag=nich&tag=sakralne").expect(200);

      expect(whereSent().AND).toContainEqual(
        asPrismaWhere({ tags: { some: { tag: { slug: { in: ["nich", "sakralne"] } } } } }),
      );
    });

    it("filters by author the same way", async () => {
      await request(app.getHttpServer()).get("/poems?author=vasyl-stus").expect(200);

      expect(whereSent().AND).toContainEqual(
        asPrismaWhere({ author: { slug: { in: ["vasyl-stus"] } } }),
      );
    });

    /**
     * The home page's Вогонь тижня, and the case that caught the `BoolFilter`
     * bug. `equals` and not `in`: a boolean is the one column Prisma will not
     * take a set for, and the expectation is typed so this cannot drift back.
     */
    it("filters by featured with equals, both ways round", async () => {
      await request(app.getHttpServer()).get("/poems?featured=true").expect(200);
      expect(whereSent()).toMatchObject(asPrismaWhere({ featured: { equals: true } }));

      vi.clearAllMocks();
      prisma.poem.findMany.mockResolvedValue([]);
      prisma.poem.count.mockResolvedValue(0);

      await request(app.getHttpServer()).get("/poems?featured=false").expect(200);
      expect(whereSent()).toMatchObject(asPrismaWhere({ featured: { equals: false } }));
    });

    /**
     * Naming both values a NOT NULL boolean can hold constrains nothing, so it
     * becomes no clause rather than an impossible one. The alternative reading —
     * an `in` over both — is the shape Prisma refuses outright.
     */
    it("drops a featured filter that names both values", async () => {
      await request(app.getHttpServer()).get("/poems?featured=true&featured=false").expect(200);

      expect(whereSent()).not.toHaveProperty("featured");
    });

    it("orders newest first unless asked otherwise", async () => {
      await request(app.getHttpServer()).get("/poems").expect(200);

      const [args] = prisma.poem.findMany.mock.calls[0] as [{ orderBy: unknown[] }];
      expect(args.orderBy).toEqual([{ publishedAt: "desc" }, { id: "desc" }]);
    });

    it("takes the readCount ordering the canon page wants", async () => {
      await request(app.getHttpServer()).get("/poems?sort=readCount&order=desc").expect(200);

      const [args] = prisma.poem.findMany.mock.calls[0] as [{ orderBy: unknown[] }];
      expect(args.orderBy).toEqual([{ readCount: "desc" }, { id: "desc" }]);
    });

    /**
     * Searching inside poems is deliberately not offered — the framework's
     * `search` is a leading-wildcard ILIKE, which is right for a title and
     * wrong for a body. `?body=` is therefore an unknown parameter and a 400,
     * not a search that quietly matches nothing.
     */
    it("does not search bodies", async () => {
      await request(app.getHttpServer()).get("/poems?body=вітер").expect(400);

      await request(app.getHttpServer()).get("/poems?search=тінь").expect(200);
      expect(JSON.stringify(whereSent())).not.toContain("body");
    });

    it("counts with the same where clause as the page it accompanies", async () => {
      await request(app.getHttpServer()).get("/poems?tag=nich").expect(200);

      const [find] = prisma.poem.findMany.mock.calls[0] as [{ where: unknown }];
      const [count] = prisma.poem.count.mock.calls[0] as [{ where: unknown }];

      expect(count).toEqual({ where: find.where });
    });

    it("pages", async () => {
      prisma.poem.count.mockResolvedValue(42);

      const { body } = await request(app.getHttpServer())
        .get("/poems?page=3&perPage=12")
        .expect(200);

      expect(body).toMatchObject({ page: 3, perPage: 12, total: 42, pageCount: 4 });

      const [args] = prisma.poem.findMany.mock.calls[0] as [{ skip: number; take: number }];
      expect(args).toMatchObject({ skip: 24, take: 12 });
    });
  });

  describe("GET /poems/:slug", () => {
    it("answers with the whole poem", async () => {
      const { body } = await request(app.getHttpServer()).get("/poems/tin-nad-polem").expect(200);

      expect(body.body.split("\n")).toHaveLength(8);
      expect(body).toMatchObject({ slug: "tin-nad-polem", readCount: 1247 });
      // The reading page has no use for a teaser, and sending both would be two
      // copies of the same text in one response.
      expect(body.teaser).toBeUndefined();
    });

    /**
     * `findFirst` and not `findUnique`, even though the column is unique: the
     * lookup carries the PUBLISHED constraint alongside the slug, and
     * `findUnique` accepts only unique columns in its `where`. Swapping them
     * back would make a draft fetchable by anybody who guessed its slug.
     */
    it("looks the slug up together with the published constraint", async () => {
      await request(app.getHttpServer()).get("/poems/tin-nad-polem").expect(200);

      expect(prisma.poem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "tin-nad-polem", status: "PUBLISHED", publishedAt: { not: null } },
        }),
      );
    });

    /**
     * A draft, a poem waiting in the queue and a slug nobody has used are one
     * answer. A 403 would confirm the poem exists, which is exactly the thing
     * worth not telling somebody who is guessing.
     */
    it("404s for anything not published, indistinguishably", async () => {
      prisma.poem.findFirst.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer()).get("/poems/nezakinchene").expect(404);

      expect(body.message).not.toMatch(/draft|review|forbidden/i);
    });
  });
});
