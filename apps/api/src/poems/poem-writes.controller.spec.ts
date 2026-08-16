import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Prisma } from "@moodnight/db";
import { POEM_BODY_MAX, POEM_REVISIONS_MAX } from "@moodnight/shared";
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
  contentRow,
  createPrismaMock,
  OTHER_USER_ID,
  ownershipRow,
  POEM_ID,
  type PrismaMock,
  prismaError,
  REVISION_ID,
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
    prisma.poem.findUnique.mockResolvedValue(contentRow());
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
        contentRow({ status: "DRAFT", publishedAt: new Date("2026-03-04T05:06:07.000Z") }),
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

  /**
   * Rule 4 — nothing overwrites a poem's text without keeping it.
   *
   * These are the cases the `PoemRevision` table exists for, and they are worth
   * their own block because the thing being asserted is invisible in the
   * response: every one of these requests succeeds identically whether or not a
   * version was written, and the difference is a row nobody asked for. An editor
   * may reach somebody else's poem, so without these the site could rewrite a
   * poem published under an author's name and keep no account of having done it.
   *
   * The pairs matter more than the individual cases. "A change is recorded" and
   * "a non-change is not" are one rule read from both ends, and a version written
   * on every PATCH would pass the first half while making the trail useless.
   */
  describe("keeping the text it replaces", () => {
    /** The `data` the service handed the revision's `create`. */
    const versioned = () => {
      const [args] = prisma.poemRevision.create.mock.calls[0] as [
        { data: Prisma.PoemRevisionUncheckedCreateInput },
      ];

      return args.data;
    };

    it("writes the first version alongside the poem, credited to its author", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      // Nested inside the poem's own insert rather than a second call: one
      // statement, so a poem cannot exist without its original.
      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
      expect(created()).toMatchObject({
        revisions: {
          create: { editorId: USER_ID, version: 1, title: aPoem.title, body: aPoem.body },
        },
      });
    });

    it("carries a missing subtitle into the first version as null", async () => {
      await request(app.getHttpServer())
        .post("/poems")
        .set(...bearer(asAuthor))
        .send(aPoem)
        .expect(201);

      expect(created()).toMatchObject({ revisions: { create: { subtitle: null } } });
    });

    it("records a rewritten body, and what the poem will say rather than the patch", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Зовсім інші слова." })
        .expect(200);

      // The title was not sent, so the version carries the one already on the
      // row — a snapshot of the whole poem, not of the request.
      expect(versioned()).toMatchObject({
        poemId: POEM_ID,
        editorId: USER_ID,
        title: contentRow().title,
        body: "Зовсім інші слова.",
      });
    });

    it("records a retitling too, not only a rewritten body", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title: "Друга редакція" })
        .expect(200);

      expect(versioned()).toMatchObject({ title: "Друга редакція", body: contentRow().body });
    });

    it("records a subtitle being removed, which is a change and not an absence", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ subtitle: null })
        .expect(200);

      expect(versioned()).toMatchObject({ subtitle: null, title: contentRow().title });
    });

    it("credits the editor when the edit is to somebody else's poem", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ body: "Виправлений рядок." })
        .expect(200);

      // The poem still belongs to USER_ID; the version belongs to whoever typed
      // it. This is the whole reason the table names an editor separately.
      expect(versioned()).toMatchObject({ editorId: OTHER_USER_ID, poemId: POEM_ID });
    });

    it("writes the version before the poem, so the answer carries the new one", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Ще інші слова." })
        .expect(200);

      // Both writes land in one `$transaction`, and the version comes first:
      // `STUDIO_FIELDS` reads the newest version back as `lastEdit`, and a
      // transaction sees its own writes, so the other order would answer with
      // the version this patch replaced.
      //
      // Asserted on the *position in the array* rather than on which delegate
      // was called first, because those are different facts here. Prisma runs an
      // array transaction in order, but building a query and running it are two
      // moments — a real `PrismaPromise` does nothing until it is handed over,
      // while these stubs resolve the instant they are called. Only the array
      // says what the database will do.
      const [operations] = prisma.$transaction.mock.calls[0] as [Promise<unknown>[]];
      const [version, poem] = await Promise.all(operations);

      expect(operations).toHaveLength(2);
      expect(version).toEqual({ id: REVISION_ID });
      expect(poem).toMatchObject({ id: POEM_ID });
    });

    it("writes nothing when the patch only moves the poem's status", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ status: "PENDING_REVIEW" })
        .expect(200);

      expect(prisma.poem.update).toHaveBeenCalled();
      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
      // And no transaction at all: a patch that changes no text costs exactly
      // what it cost before there was a trail.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("writes nothing when an editor only features a poem", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ featured: true })
        .expect(200);

      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
    });

    it("writes nothing when the patch resends the text the poem already has", async () => {
      const { title, subtitle, body } = contentRow();

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ title, subtitle, body })
        .expect(200);

      // A form that submits every field it rendered is the ordinary client, and
      // a version per save would fill the trail with rows saying nothing
      // happened.
      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
    });

    it("writes nothing when the themes change but the words do not", async () => {
      prisma.tag.findMany.mockResolvedValue([tagRow()]);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ tags: ["melankholiia"] })
        .expect(200);

      expect(updated()).toHaveProperty("tags");
      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
    });

    it("keeps no version when the caller was refused the poem in the first place", async () => {
      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asOtherAuthor))
        .send({ body: "Не моє." })
        .expect(403);

      expect(prisma.poemRevision.create).not.toHaveBeenCalled();
    });
  });

  /**
   * The version number, and the ceiling on how many of them one poem keeps.
   *
   * The number is a column rather than a row's position in the trail, which is
   * what pruning makes necessary: drop the middle of a history and positions
   * shift, so a version an editor referred to yesterday would mean a different
   * row today. These cases pin the two halves of that — that the number is
   * chosen from what the poem already holds and never reused, and that passing
   * the cap costs the middle of the trail and never its beginning.
   */
  describe("numbering and the history cap", () => {
    /** The `data` the service handed the revision's `create`. */
    const versioned = () => {
      const [args] = prisma.poemRevision.create.mock.calls[0] as [
        { data: Prisma.PoemRevisionUncheckedCreateInput },
      ];

      return args.data;
    };

    /** The `where` the prune handed `deleteMany`. */
    const pruned = () => {
      const [args] = prisma.poemRevision.deleteMany.mock.calls[0] as [
        { where: Prisma.PoemRevisionWhereInput },
      ];

      return args.where;
    };

    it("numbers a new version one past the highest the poem holds", async () => {
      prisma.poem.findUnique.mockResolvedValue(contentRow({ revisions: [{ version: 7 }] }));

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Восьма редакція." })
        .expect(200);

      expect(versioned()).toMatchObject({ version: 8 });
    });

    /**
     * The highest, not a count. A pruned poem has fewer rows than it has had
     * versions, and counting would hand out a number some dropped row already
     * used — which the unique index would then refuse.
     */
    it("numbers past the highest even when older versions have been pruned", async () => {
      prisma.poem.findUnique.mockResolvedValue(contentRow({ revisions: [{ version: 137 }] }));

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Сто тридцять восьма." })
        .expect(200);

      expect(versioned()).toMatchObject({ version: 138 });
    });

    /**
     * Two editors saved at the same moment: both read the same highest version,
     * both tried to write one past it, and the unique index refused the second.
     * A 409 and not a 500 — the loser can re-read and re-apply, and the poem's
     * own update rolled back with the version, so nothing half-landed.
     */
    it("answers a lost numbering race with a 409 that says nothing changed", async () => {
      prisma.$transaction.mockRejectedValueOnce(prismaError("P2002"));

      const { body } = await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asEditor))
        .send({ body: "Одночасно." })
        .expect(409);

      expect(body.message).toMatch(/another editor saved this poem/i);
      expect(body.message).toMatch(/nothing was changed/i);
    });

    it("leaves the trail alone while the poem is under the cap", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        contentRow({ revisions: [{ version: POEM_REVISIONS_MAX - 1 }] }),
      );

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Рівно сто." })
        .expect(200);

      // The hundredth version is the last one that fits; nothing is dropped yet.
      expect(versioned()).toMatchObject({ version: POEM_REVISIONS_MAX });
      expect(prisma.poemRevision.deleteMany).not.toHaveBeenCalled();
    });

    it("drops the oldest versions once the poem passes the cap", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        contentRow({ revisions: [{ version: POEM_REVISIONS_MAX }] }),
      );
      prisma.poemRevision.findMany.mockResolvedValue([{ id: REVISION_ID }]);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Сто перша." })
        .expect(200);

      // The survivors are named off the index, one short of the cap — the
      // original is kept on top of them.
      const [survivors] = prisma.poemRevision.findMany.mock.calls[0] as [
        { orderBy: unknown; take: number },
      ];

      expect(survivors).toMatchObject({
        orderBy: { version: "desc" },
        take: POEM_REVISIONS_MAX - 1,
      });
      expect(prisma.poemRevision.deleteMany).toHaveBeenCalled();
    });

    /** The one version a prune may never take. */
    it("never drops the poem's original", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        contentRow({ revisions: [{ version: POEM_REVISIONS_MAX + 40 }] }),
      );
      prisma.poemRevision.findMany.mockResolvedValue([{ id: REVISION_ID }]);

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Далеко за межею." })
        .expect(200);

      expect(pruned()).toMatchObject({
        poemId: POEM_ID,
        version: { not: 1 },
        id: { notIn: [REVISION_ID] },
      });
    });

    /**
     * The prune is housekeeping, so it must not be able to fail the edit. An
     * author told their poem was not saved when it was is a far worse outcome
     * than a trail one row too long, which the next edit corrects anyway.
     */
    it("still answers 200 when the prune fails", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        contentRow({ revisions: [{ version: POEM_REVISIONS_MAX + 1 }] }),
      );
      prisma.poemRevision.findMany.mockRejectedValueOnce(new Error("connection lost"));

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ body: "Попри все." })
        .expect(200);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    /** Housekeeping only. A patch that writes no version prunes nothing. */
    it("does not prune when the patch changed no text", async () => {
      prisma.poem.findUnique.mockResolvedValue(
        contentRow({ revisions: [{ version: POEM_REVISIONS_MAX + 40 }] }),
      );

      await request(app.getHttpServer())
        .patch(`/poems/${POEM_ID}`)
        .set(...bearer(asAuthor))
        .send({ status: "PENDING_REVIEW" })
        .expect(200);

      expect(prisma.poemRevision.deleteMany).not.toHaveBeenCalled();
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
