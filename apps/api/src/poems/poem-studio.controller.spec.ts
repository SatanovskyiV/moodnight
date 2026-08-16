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
  editRow,
  reviewRow,
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

  /**
   * The one field on this API whose *contents* depend on who asked for it.
   *
   * Both halves are worth a case of their own, because the failure modes point
   * in opposite directions and only one of them is visible: an author who is
   * not told why their poem came back has been told nothing they can act on,
   * and an author who is told *who* sent it back has been given something the
   * site deliberately keeps between moderators.
   */
  describe("the review on a poem", () => {
    /** A poem sent back, with the decision that sent it. */
    const rejected = (authorId = USER_ID) =>
      studioPoemRow({
        status: "REJECTED",
        publishedAt: null,
        authorId,
        reviews: [reviewRow()],
      });

    it("is null on a poem nobody has decided on", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.review).toBeNull();
    });

    it("tells the author the verdict and the reason", async () => {
      prisma.poem.findUnique.mockResolvedValue(rejected());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.review).toMatchObject({
        action: "REJECT",
        note: "Друга строфа обривається раніше за думку.",
        decidedAt: "2026-03-01T12:13:14.000Z",
      });
    });

    /** Rule 5. The verdict is the author's; the name behind it is not. */
    it("does not tell the author who decided", async () => {
      prisma.poem.findUnique.mockResolvedValue(rejected());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.review.reviewer).toBeNull();
      // Not merely absent from `reviewer`: the name must not have reached the
      // response by any other route either.
      expect(JSON.stringify(body)).not.toContain("Орися");
    });

    it("tells an editor who decided", async () => {
      prisma.poem.findUnique.mockResolvedValue(rejected());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.review.reviewer).toMatchObject({
        slug: "orysia-vechirnia",
        penName: "Орися Вечірня",
        initials: "ОВ",
        roleTitle: "Хранитель слова",
      });
    });

    /**
     * `AUTHOR_FIELDS` is what the reviewer is selected by, and `role` is not in
     * it — so the wire carries the decorative title and never the permission.
     * The same boundary the schema draws around a poem's author.
     */
    it("never carries the reviewer's permission", async () => {
      prisma.poem.findUnique.mockResolvedValue(rejected());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.review.reviewer.role).toBeUndefined();
    });

    /** The list shape carries it too — a dashboard shows why a poem came back. */
    it("rides along on the rows of the dashboard", async () => {
      prisma.poem.findMany.mockResolvedValue([rejected()]);

      const { body } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.items[0].review).toMatchObject({ action: "REJECT", reviewer: null });
    });

    /**
     * An editor's own studio is still their own shelf, and the rule is about
     * the caller rather than about the screen: they moderate, so they see the
     * name, even on their own poem.
     */
    it("follows the caller's role and not the endpoint", async () => {
      prisma.poem.findMany.mockResolvedValue([rejected(OTHER_USER_ID)]);

      const { body } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[0].review.reviewer).toMatchObject({ penName: "Орися Вечірня" });
    });
  });

  /**
   * The second field whose contents depend on the caller — and the one that
   * draws the line further than the review does.
   *
   * A review withholds a name and keeps the verdict, because an author is owed
   * something they can act on. `lastEdit` withholds all of itself, including
   * from the poem's own author: rule 6 in ./poem-access, where the cost of that
   * choice is written out. These cases are what would fail if the two rules were
   * ever collapsed into one predicate on the grounds that they look alike.
   */
  describe("the last edit on a poem", () => {
    /** A poem an editor has rewritten once since its author wrote it. */
    const edited = (authorId = USER_ID) =>
      studioPoemRow({
        authorId,
        revisions: [editRow({ version: 2, editor: reviewRow().reviewer })],
      });

    it("tells an editor which version the poem is on and whose hand it was", async () => {
      prisma.poem.findUnique.mockResolvedValue(edited());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.lastEdit).toMatchObject({
        version: 2,
        editedAt: "2026-02-20T07:08:09.000Z",
        editor: { penName: "Орися Вечірня" },
      });
    });

    /** Rule 6, and the half that is a real cost rather than an obvious one. */
    it("tells the author nothing, on their own poem", async () => {
      prisma.poem.findUnique.mockResolvedValue(edited());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(200);

      expect(body.lastEdit).toBeNull();
      // Not merely nulled: neither the editor's name nor the count may have
      // reached the response by some other route.
      expect(JSON.stringify(body)).not.toContain("Орися");
    });

    /** Version 1 is the poem as written, and it is still an answer worth giving. */
    it("says version 1 for a poem nobody has rewritten", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.lastEdit).toMatchObject({ version: 1, editor: { penName: "Тарас Шевченко" } });
    });

    it("never carries the editor's permission", async () => {
      prisma.poem.findUnique.mockResolvedValue(edited());

      const { body } = await request(app.getHttpServer())
        .get(`/studio/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.lastEdit.editor.role).toBeUndefined();
    });

    /** Rides along on a list, which is where an editor actually reads it. */
    it("appears on the rows of the dashboard for an editor, and not for an author", async () => {
      prisma.poem.findMany.mockResolvedValue([edited(OTHER_USER_ID)]);

      const { body: forEditor } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asEditor))
        .expect(200);

      prisma.poem.findMany.mockResolvedValue([edited()]);

      const { body: forAuthor } = await request(app.getHttpServer())
        .get("/studio/poems")
        .set(...bearer(asAuthor))
        .expect(200);

      expect(forEditor.items[0].lastEdit).toMatchObject({ version: 2 });
      expect(forAuthor.items[0].lastEdit).toBeNull();
    });
  });
});
