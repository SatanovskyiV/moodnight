import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@moodnight/db";
import { POEM_BODY_MAX } from "@moodnight/shared";
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
  studioPoemRow,
  TAG_ID,
  tagRow,
  USER_ID,
  UUID_V4,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { PoemWritesController } from "./poem-writes.controller";
import { PoemWritesService } from "./poem-writes.service";

/**
 * The write path, exercised over HTTP.
 *
 * What separates these cases from the read path's is that almost none of them
 * is about the happy path. Creating a poem is one line of Prisma; the rules
 * worth pinning are the ones that say *no* — an author cannot publish their own
 * work, cannot touch somebody else's, cannot post under another name, and
 * cannot delete a poem readers already have the address of. Every one of those
 * is invisible in a successful request, and every one of them is the reason
 * this path is guarded at all.
 *
 * Tokens are real, signed and verified by the same `TokensService` the
 * application uses, so the ownership cases exercise a claim that actually came
 * out of a signature rather than a mock that agrees.
 */
describe("Poem write endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  /** The author every fixture poem belongs to — `ownershipRow`'s default. */
  let asAuthor: string;
  /** A second author, who owns nothing here. */
  let asOtherAuthor: string;
  let asEditor: string;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [PoemWritesController],
      providers: [
        PoemWritesService,
        ...authTestProviders,
        // Not used by anything under test: `authTestProviders` carries the
        // refresh strategy, which reads an account's token version, and Nest
        // resolves the whole graph whether or not a route reaches it. It shares
        // the stubbed Prisma below, so it has nothing of its own to configure.
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
    // No neighbouring slugs, so `deriveSlug` settles on the unsuffixed base.
    prisma.poem.findMany.mockResolvedValue([]);
    prisma.poem.findUnique.mockResolvedValue(ownershipRow());
    prisma.poem.create.mockResolvedValue(studioPoemRow({ status: "DRAFT", publishedAt: null }));
    prisma.poem.update.mockResolvedValue(studioPoemRow());
    prisma.poem.delete.mockResolvedValue({ id: POEM_ID });
    prisma.tag.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  /** A body that satisfies the schema, for the cases that are about something else. */
  const aPoem = { title: "Тінь над полем", body: "Тінь над полем лягла,\nі вітер затих." };

  /** The `data` the service handed Prisma's `create`. */
  const created = () => {
    const [args] = prisma.poem.create.mock.calls[0] as [{ data: Prisma.PoemUncheckedCreateInput }];

    return args.data;
  };

  /** The `data` the service handed Prisma's `update`. */
  const updated = () => {
    const [args] = prisma.poem.update.mock.calls[0] as [{ data: Prisma.PoemUncheckedUpdateInput }];

    return args.data;
  };

  describe("POST /poems", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).post("/poems").send(aPoem).expect(401);
      expect(prisma.poem.create).not.toHaveBeenCalled();
    });

    it("writes a draft owned by whoever is asking", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      expect(created()).toMatchObject({ authorId: USER_ID, title: "Тінь над полем" });
      expect(body).toMatchObject({ status: "DRAFT", publishedAt: null });
    });

    /**
     * `status` is left off the insert entirely when the client omits it, so the
     * column's `@default(DRAFT)` decides. Writing an explicit "DRAFT" here
     * would work today and would be a second copy of the default to keep in
     * step with packages/db.
     */
    it("leaves the status to the column's default when none is asked for", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      expect(created()).not.toHaveProperty("status");
      expect(created()).not.toHaveProperty("publishedAt");
    });

    /**
     * The rule the moderation queue exists for. Without it every author is
     * their own editor and `PENDING_REVIEW` is a status nobody would choose.
     */
    it("refuses an author who tries to publish outright", async () => {
      const { body } = await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, status: "PUBLISHED" })
        .expect(403);

      expect(body.message).toMatch(/PENDING_REVIEW/);
      expect(prisma.poem.create).not.toHaveBeenCalled();
    });

    it("lets an author submit to the queue", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, status: "PENDING_REVIEW" })
        .expect(201);

      expect(created()).toMatchObject({ status: "PENDING_REVIEW" });
      expect(created()).not.toHaveProperty("publishedAt");
    });

    /**
     * An editor may publish in one step — and the date has to be stamped in the
     * same write, because the public feed's constraint is `status` *and*
     * `publishedAt: { not: null }`. A poem published without one would be
     * invisible on both endpoints and look like a bug in the feed.
     */
    it("stamps a publication date when an editor publishes outright", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asEditor))
        .send({ ...aPoem, status: "PUBLISHED" })
        .expect(201);

      expect(created().status).toBe("PUBLISHED");
      expect(created().publishedAt).toBeInstanceOf(Date);
    });

    /**
     * There is no `authorId` on the schema, so posting under somebody else's
     * name is not a thing the endpoint refuses — it is a thing it cannot
     * express. Strict parsing turns the attempt into a 400 about an unknown
     * key rather than a field that gets quietly dropped.
     */
    it("has no way to name another author", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, authorId: OTHER_USER_ID })
        .expect(400);
    });

    /** Nor a slug: the address is the server's to derive and then keep. */
    it("derives the slug from the title and takes none from the client", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, slug: "moia-adresa" })
        .expect(400);

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      expect(created().slug).toBe("tin-nad-polem");
    });

    it("suffixes a slug somebody already has", async () => {
      prisma.poem.findMany.mockResolvedValue([{ slug: "tin-nad-polem" }]);

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      expect(created().slug).toBe("tin-nad-polem-2");
    });

    /**
     * Two requests can read the same set of taken slugs and settle on the same
     * suffix. The unique index is what actually decides, and a 409 saying
     * nothing was written is a better answer than the 500 the raw failure
     * would be.
     */
    it("answers a lost slug race with a 409 that says nothing was created", async () => {
      prisma.poem.create.mockRejectedValue(prismaError("P2002", "poems_slug_key"));

      const { body } = await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(409);

      expect(body.message).toMatch(/Nothing was created/);
    });

    it("files the poem under the themes it names", async () => {
      prisma.tag.findMany.mockResolvedValue([tagRow()]);

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, tags: ["melankholiia"] })
        .expect(201);

      expect(created().tags).toEqual({ create: [{ tagId: TAG_ID }] });
    });

    /**
     * Themes are curated. Creating one by writing a poem is how an archive
     * acquires five spellings of the same word, so an unknown slug is a 400
     * that names it rather than a sixth row in `tags`.
     */
    it("refuses a theme the archive does not have, and says which", async () => {
      prisma.tag.findMany.mockResolvedValue([tagRow()]);

      const { body } = await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, tags: ["melankholiia", "vydumane"] })
        .expect(400);

      expect(String(body.message)).toMatch(/vydumane/);
      expect(prisma.poem.create).not.toHaveBeenCalled();
    });

    /**
     * `PoemTag`'s primary key is the pair, so the same slug twice would be a
     * unique violation surfacing as a 409 — for what is plainly one theme
     * named twice.
     */
    it("collapses a theme named twice", async () => {
      prisma.tag.findMany.mockResolvedValue([tagRow()]);

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, tags: ["melankholiia", "melankholiia"] })
        .expect(201);

      expect(created().tags).toEqual({ create: [{ tagId: TAG_ID }] });
    });

    it("refuses an empty poem and one past the length cap", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, body: "" })
        .expect(400);

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send({ ...aPoem, body: "я".repeat(POEM_BODY_MAX + 1) })
        .expect(400);

      expect(prisma.poem.create).not.toHaveBeenCalled();
    });

    /**
     * An access token outlives the account it names by up to its TTL. The
     * insert then fails on the `author_id` foreign key, and the honest answer
     * is that the token is no longer good — not a 500.
     */
    it("answers a token for a deleted account with a 401", async () => {
      prisma.poem.create.mockRejectedValue(prismaError("P2003"));

      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(401);
    });
  });

  describe("PATCH /poems/:id", () => {
    it("changes a poem the caller wrote", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title: "Тінь над полем, друга редакція" })
        .expect(200);

      expect(updated()).toMatchObject({ title: "Тінь над полем, друга редакція" });
    });

    /**
     * A poem's address is settled once. Following the title would break every
     * link anybody has shared, which is the promise `User.slug` makes too — and
     * the reason retitling is free rather than a redirect problem.
     */
    it("does not move the slug when the title changes", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title: "Зовсім інша назва" })
        .expect(200);

      expect(updated()).not.toHaveProperty("slug");
    });

    it("refuses to touch somebody else's poem", async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asOtherAuthor))
        .send({ title: "Не моє" })
        .expect(403);

      expect(body.message).toMatch(/somebody else/);
      expect(prisma.poem.update).not.toHaveBeenCalled();
    });

    it("lets an editor change anybody's", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ status: "PUBLISHED" })
        .expect(200);

      expect(updated()).toMatchObject({ status: "PUBLISHED" });
    });

    it("stamps the publication date the first time, and only then", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ status: "PUBLISHED" })
        .expect(200);

      expect(updated().publishedAt).toBeInstanceOf(Date);
    });

    /**
     * A poem taken down and put back keeps its place in the feed rather than
     * jumping to the top as though it were new — the column answers "when did
     * this become public", and that is still the first time.
     */
    it("keeps the original date when a poem is published again", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        ownershipRow({ status: "DRAFT", publishedAt: new Date("2026-03-04T05:06:07.000Z") }),
      );

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ status: "PUBLISHED" })
        .expect(200);

      expect(updated()).not.toHaveProperty("publishedAt");
    });

    it("refuses an author who tries to publish their own poem", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ status: "PUBLISHED" })
        .expect(403);

      expect(prisma.poem.update).not.toHaveBeenCalled();
    });

    it("lets its author submit it to the queue, and take it back down", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ status: "PENDING_REVIEW" })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ status: "DRAFT" })
        .expect(200);
    });

    /** The front page is an editorial decision, not a property of the text. */
    it("refuses an author who tries to feature their own poem", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ featured: true })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ featured: true })
        .expect(200);
    });

    /** Rejecting carries a note on a `Review` row, so it is not a field here. */
    it("does not accept a rejection as a status", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ status: "REJECTED" })
        .expect(400);
    });

    it("replaces the whole set of themes rather than adding to it", async () => {
      prisma.tag.findMany.mockResolvedValue([tagRow()]);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ tags: ["melankholiia"] })
        .expect(200);

      expect(updated().tags).toEqual({ deleteMany: {}, create: [{ tagId: TAG_ID }] });
    });

    it("files a poem under nothing when the list is empty", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ tags: [] })
        .expect(200);

      expect(updated().tags).toEqual({ deleteMany: {}, create: [] });
    });

    it("leaves the themes alone when the field is absent", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title: "Тільки назва" })
        .expect(200);

      expect(updated()).not.toHaveProperty("tags");
      expect(prisma.tag.findMany).not.toHaveBeenCalled();
    });

    /**
     * Prisma stamps `updatedAt` on every `update` whether or not the data
     * changes anything, so an accepted `{}` would move a poem's "saved" time
     * for nothing.
     */
    it("refuses a patch that changes nothing", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({})
        .expect(400);

      expect(prisma.poem.update).not.toHaveBeenCalled();
    });

    it("404s for a poem that is not there", async () => {
      prisma.poem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title: "Немає" })
        .expect(404);
    });

    it("400s on an id of the wrong UUID version", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${UUID_V4}`)
        .set(...bearer(asAuthor))
        .send({ title: "Немає" })
        .expect(400);
    });
  });

  describe("DELETE /poems/:id", () => {
    it("deletes a draft of the caller's own, with no body", async () => {
      const { body } = await request(app.getHttpServer())
        .delete(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(204);

      expect(body).toEqual({});
      expect(prisma.poem.delete).toHaveBeenCalledWith({
        where: { id: POEM_ID },
        select: { id: true },
      });
    });

    /**
     * The rule that makes this endpoint safe to have at all: a published poem
     * has an address readers may have shared, and deleting it turns that into a
     * 404 nobody chose. Taking it down first is reversible, and makes the
     * deletion a second decision rather than a surprise inside the first.
     */
    it("refuses to delete a poem that is currently published", async () => {
      prisma.poem.findUnique.mockResolvedValue(ownershipRow({ status: "PUBLISHED" }));

      const { body } = await request(app.getHttpServer())
        .delete(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(409);

      expect(body.message).toMatch(/DRAFT/);
      expect(prisma.poem.delete).not.toHaveBeenCalled();
    });

    /** Including from an editor — the rule is about the poem, not the caller. */
    it("refuses an editor the same way", async () => {
      prisma.poem.findUnique.mockResolvedValue(ownershipRow({ status: "PUBLISHED" }));

      await request(app.getHttpServer())
        .delete(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .expect(409);
    });

    it("refuses to delete somebody else's poem", async () => {
      await request(app.getHttpServer())
        .delete(`/poems/${POEM_ID}`)
        .set(...bearer(asOtherAuthor))
        .expect(403);

      expect(prisma.poem.delete).not.toHaveBeenCalled();
    });

    it("404s for a poem that is already gone", async () => {
      prisma.poem.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .expect(404);
    });

    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).delete(`/poems/${POEM_ID}`).expect(401);
    });
  });
});
