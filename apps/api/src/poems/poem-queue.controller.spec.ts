import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@moodnight/db";
import { REVIEW_NOTE_MAX } from "@moodnight/shared";
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
  ownershipRow,
  POEM_ID,
  type PrismaMock,
  prismaError,
  queuedPoemRow,
  reviewRow,
  studioPoemRow,
  USER_ID,
  UUID_V4,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { PoemQueueController } from "./poem-queue.controller";
import { PoemQueueService } from "./poem-queue.service";
import { PoemReviewController } from "./poem-review.controller";

/**
 * The moderation queue and the two decisions that empty it, over HTTP.
 *
 * The cases worth having here are the ones that are invisible when everything
 * goes right: that the list cannot be asked about anything other than what is
 * waiting, that a decision writes two rows and not one, that a poem which has
 * already left the queue cannot be decided on twice, and that a rejection
 * without a reason never reaches the database at all.
 *
 * Both controllers are mounted together because they share one service, and the
 * transaction that service runs is the thing most of this file is about.
 */
describe("Moderation queue endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  let asAuthor: string;
  let asEditor: string;
  let asAdmin: string;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [PoemQueueController, PoemReviewController],
      providers: [
        PoemQueueService,
        ...authTestProviders,
        // Not used by anything under test — see the note in the write path's
        // spec. It shares the stubbed Prisma below.
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const tokens = moduleRef.get(TokensService);
    asAuthor = await accessTokenFor(tokens, "AUTHOR", USER_ID);
    asEditor = await accessTokenFor(tokens, "EDITOR", OTHER_USER_ID);
    asAdmin = await accessTokenFor(tokens, "ADMIN", OTHER_USER_ID);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.poem.findMany.mockResolvedValue([queuedPoemRow()]);
    prisma.poem.count.mockResolvedValue(1);
    // Waiting to be read, which is what every decision case starts from.
    prisma.poem.findUnique.mockResolvedValue(
      ownershipRow({ status: "PENDING_REVIEW", publishedAt: null }),
    );
    prisma.poem.update.mockResolvedValue(studioPoemRow());
  });

  afterAll(async () => {
    await app.close();
  });

  /** The arguments the service handed Prisma's `findMany`. */
  const queried = () => {
    const [args] = prisma.poem.findMany.mock.calls[0] as [
      { where: Prisma.PoemWhereInput; orderBy: Prisma.PoemOrderByWithRelationInput[] },
    ];

    return args;
  };

  /** The `where` and `data` the decision handed Prisma's `update`. */
  const moved = () => {
    const [args] = prisma.poem.update.mock.calls[0] as [
      { where: Prisma.PoemWhereUniqueInput; data: Prisma.PoemUncheckedUpdateInput },
    ];

    return args;
  };

  /** The `data` of the `Review` the decision wrote. */
  const recorded = () => {
    const [args] = prisma.review.create.mock.calls[0] as [
      { data: Prisma.ReviewUncheckedCreateInput },
    ];

    return args.data;
  };

  describe("GET /admin/queue", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).get("/admin/queue").expect(401);
      expect(prisma.poem.findMany).not.toHaveBeenCalled();
    });

    /** The floor. An author writing poems is not somebody who reads the queue. */
    it("refuses an author", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asAuthor))
        .expect(403);

      expect(prisma.poem.findMany).not.toHaveBeenCalled();
    });

    it("answers an editor", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(body).toMatchObject({ total: 1, page: 1 });
    });

    /** `@Roles` names the lowest role it accepts, not the only one. */
    it("answers an admin, who is above an editor", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asAdmin))
        .expect(200);
    });

    it("only ever asks for poems waiting to be read", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(queried().where).toMatchObject({ AND: [{ status: "PENDING_REVIEW" }] });
    });

    /**
     * The endpoint *is* the status, so there is no parameter for it — and the
     * strict query schema turns the attempt into a 400 naming the key rather
     * than something quietly ignored.
     */
    it("refuses an attempt to ask for another status", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue?status=PUBLISHED")
        .set(...bearer(asEditor))
        .expect(400);

      expect(prisma.poem.findMany).not.toHaveBeenCalled();
    });

    /** The one ascending list on the site: the longest wait is read first. */
    it("orders by submission, oldest first, unless asked otherwise", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(queried().orderBy).toEqual([{ submittedAt: "asc" }, { id: "asc" }]);
    });

    it("narrows to one poet when asked", async () => {
      await request(app.getHttpServer())
        .get("/admin/queue?author=vasyl-stus")
        .set(...bearer(asEditor))
        .expect(200);

      expect(queried().where).toMatchObject({
        AND: [{ status: "PENDING_REVIEW" }, { author: { slug: { in: ["vasyl-stus"] } } }],
      });
    });

    it("sends the first lines rather than the whole poem", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[0]).toMatchObject({ truncated: true, status: "PENDING_REVIEW" });
      expect(body.items[0].body).toBeUndefined();
    });

    /** A poem waiting for the first time has nothing behind it yet. */
    it("carries no review on a poem that has never been decided on", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[0].review).toBeNull();
    });

    /**
     * The queue's own use of the field: a resubmitted poem shows what was said
     * about it last time and who said it, so an editor knows whether they are
     * reading it for the first time.
     */
    it("carries the last decision, reviewer and all, on a resubmitted poem", async () => {
      prisma.poem.findMany.mockResolvedValue([queuedPoemRow({ reviews: [reviewRow()] })]);

      const { body } = await request(app.getHttpServer())
        .get("/admin/queue")
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[0].review).toMatchObject({
        action: "REJECT",
        note: "Друга строфа обривається раніше за думку.",
        decidedAt: "2026-03-01T12:13:14.000Z",
        reviewer: { penName: "Орися Вечірня" },
      });
    });
  });

  describe("POST /poems/:id/approve", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).post(`/poems/${POEM_ID}/approve`).send({}).expect(401);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses an author", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asAuthor))
        .send({})
        .expect(403);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("publishes the poem and records who said so, in one transaction", async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(200);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(moved().data).toMatchObject({ status: "PUBLISHED" });
      expect(recorded()).toMatchObject({
        poemId: POEM_ID,
        reviewerId: OTHER_USER_ID,
        action: "APPROVE",
        note: null,
      });
      expect(body).toMatchObject({ id: POEM_ID, status: "PUBLISHED" });
    });

    /**
     * The race, and the reason the status is in the `where` as well as being
     * checked first: two editors deciding at once must not both write a row.
     */
    it("guards the update on the poem still being in the queue", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(200);

      expect(moved().where).toEqual({ id: POEM_ID, status: "PENDING_REVIEW" });
    });

    it("409s when another editor got there first", async () => {
      prisma.poem.update.mockRejectedValue(prismaError("P2025"));

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(409);
    });

    it("stamps the publication date on a poem that has never held one", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(200);

      expect(moved().data.publishedAt).toBeInstanceOf(Date);
    });

    /**
     * A poem taken down, revised, resubmitted and approved again keeps its place
     * in the feed. The column answers "when did this become public", and that is
     * still the first time.
     */
    it("leaves an existing publication date alone", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        ownershipRow({ status: "PENDING_REVIEW", publishedAt: new Date("2026-03-04T05:06:07Z") }),
      );

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(200);

      expect(moved().data.publishedAt).toBeUndefined();
    });

    it("keeps an optional note on the record", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({ note: "Третя строфа тепер тримає весь вірш." })
        .expect(200);

      expect(recorded().note).toBe("Третя строфа тепер тримає весь вірш.");
    });

    it("404s an id no poem has", async () => {
      prisma.poem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(404);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /** A draft was never submitted, so there is nothing in the queue to decide on. */
    it("409s a poem that is not waiting", async () => {
      prisma.poem.findUnique.mockResolvedValue(ownershipRow({ status: "DRAFT" }));

      const { body } = await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(409);

      expect(body.message).toContain("DRAFT");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("409s a poem that is already published", async () => {
      prisma.poem.findUnique.mockResolvedValue(ownershipRow({ status: "PUBLISHED" }));

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(409);
    });

    it("400s an id that is a UUID of the wrong version", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${UUID_V4}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(400);

      expect(prisma.poem.findUnique).not.toHaveBeenCalled();
    });

    it("400s a body carrying a key the schema does not know", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({ status: "PUBLISHED" })
        .expect(400);
    });

    /**
     * The one thing an editor deciding on their own poem should produce: a row
     * naming them. The site is small enough that a four-eyes rule would stop the
     * only editor posting at all, and `PATCH status: PUBLISHED` has always been
     * open to them — so the queue records rather than refuses.
     */
    it("lets an editor approve their own poem, and says who did", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        ownershipRow({ status: "PENDING_REVIEW", publishedAt: null, authorId: OTHER_USER_ID }),
      );

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/approve`)
        .set(...bearer(asEditor))
        .send({})
        .expect(200);

      expect(recorded().reviewerId).toBe(OTHER_USER_ID);
    });
  });

  describe("POST /poems/:id/reject", () => {
    /** The body every case that is about something else sends. */
    const withNote = { note: "Друга строфа обривається раніше за думку." };

    it("refuses an author", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asAuthor))
        .send(withNote)
        .expect(403);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("sends the poem back and keeps the reason", async () => {
      prisma.poem.update.mockResolvedValue(
        studioPoemRow({ status: "REJECTED", publishedAt: null }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(200);

      expect(moved().data).toEqual({ status: "REJECTED" });
      expect(recorded()).toMatchObject({
        poemId: POEM_ID,
        reviewerId: OTHER_USER_ID,
        action: "REJECT",
        note: withNote.note,
      });
      expect(body).toMatchObject({ status: "REJECTED" });
    });

    /**
     * The rule the whole endpoint exists for. Without it, rejecting would be
     * `PATCH status: REJECTED` and an author would be told nothing.
     */
    it("refuses a rejection with no reason", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send({})
        .expect(400);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a note that is only whitespace", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send({ note: "   " })
        .expect(400);
    });

    /** The column is `VarChar(2000)`; a longer note would be a 500 from Postgres. */
    it("refuses a note longer than the column", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send({ note: "я".repeat(REVIEW_NOTE_MAX + 1) })
        .expect(400);
    });

    it("does not touch the publication date", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(200);

      expect(moved().data.publishedAt).toBeUndefined();
    });

    it("409s a poem that is not waiting", async () => {
      prisma.poem.findUnique.mockResolvedValue(ownershipRow({ status: "REJECTED" }));

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(409);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("404s an id no poem has", async () => {
      prisma.poem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(404);
    });
  });

  /**
   * What comes back from a decision, which is the poem carrying the decision
   * just taken. Both cases here are about the same thing at two levels: the
   * order the two writes run in, and the response that order makes possible.
   */
  describe("the decision in the answer", () => {
    /** The body a rejection needs, spelled again — the sibling block's is its own. */
    const withNote = { note: "Друга строфа обривається раніше за думку." };

    /**
     * The load-bearing half. The poem is re-read through `STUDIO_FIELDS`, which
     * selects the newest `Review` along with it — so an update running before
     * the insert would answer with the *previous* verdict, or with none at all.
     * Asserted on the order the mocks were called in rather than on the
     * response, because the stubs cannot reproduce a transaction seeing its own
     * writes; what a spec can honestly check here is which write went first.
     */
    it("writes the review before it re-reads the poem", async () => {
      await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(200);

      const [wrote] = prisma.review.create.mock.invocationCallOrder;
      const [read] = prisma.poem.update.mock.invocationCallOrder;

      // Named rather than asserted straight through `toBeLessThan`, so a run
      // where one of them never happened fails as "undefined" here instead of
      // as a comparison against nothing.
      expect({ wrote, read }).toEqual({ wrote: expect.any(Number), read: expect.any(Number) });
      expect(wrote as number).toBeLessThan(read as number);
    });

    it("answers with the decision on the poem", async () => {
      prisma.poem.update.mockResolvedValue(
        studioPoemRow({ status: "REJECTED", publishedAt: null, reviews: [reviewRow()] }),
      );

      const { body } = await request(app.getHttpServer())
        .post(`/poems/${POEM_ID}/reject`)
        .set(...bearer(asEditor))
        .send(withNote)
        .expect(200);

      expect(body.review).toMatchObject({
        action: "REJECT",
        reviewer: { penName: "Орися Вечірня" },
      });
    });
  });
});
