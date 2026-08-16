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
  reviewRow,
  revisionRow,
  USER_ID,
  UUID_V4,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { PoemRevisionsController } from "./poem-revisions.controller";
import { PoemRevisionsService } from "./poem-revisions.service";

/**
 * A poem's history, over HTTP.
 *
 * Two things are worth pinning here and the rest follows from them. The first is
 * who may ask: this is the one read on a poem that refuses the poem's own author
 * outright rather than answering them with less, so the 403 is the feature and
 * not an edge case. The second is the ordering, because a version's number is
 * its position — nothing stores it — which makes "oldest first" the difference
 * between a trail that reads forwards and one that numbers itself backwards
 * while looking entirely plausible.
 */
describe("Poem revision endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  /** The author of the fixture poem — who is refused here, on purpose. */
  let asAuthor: string;
  let asEditor: string;
  let asAdmin: string;

  /** The author as they were, and the editor's pass over them. */
  const original = revisionRow({
    id: "0192f5a5-4172-7f82-9394-6f7081920314",
    body: "Тінь над полем лягла.",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
  });

  const rewritten = revisionRow({
    id: "0192f5a6-5283-7093-a4a5-708192031425",
    version: 2,
    title: "Тінь над полем, друга редакція",
    body: "Тінь над полем лягла,\nі вітер затих.",
    createdAt: new Date("2026-02-20T07:08:09.000Z"),
    editor: reviewRow().reviewer,
  });

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [PoemRevisionsController],
      providers: [
        PoemRevisionsService,
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
    prisma.poemRevision.findMany.mockResolvedValue([original, rewritten]);
  });

  afterAll(async () => {
    await app.close();
  });

  /** The arguments the service handed Prisma. */
  const queried = () => {
    const [args] = prisma.poemRevision.findMany.mock.calls[0] as [
      {
        where: Prisma.PoemRevisionWhereInput;
        orderBy: Prisma.PoemRevisionOrderByWithRelationInput[];
      },
    ];

    return args;
  };

  describe("GET /poems/:id/revisions", () => {
    it("refuses a request with no token at all", async () => {
      await request(app.getHttpServer()).get(`/poems/${POEM_ID}/revisions`).expect(401);
      expect(prisma.poemRevision.findMany).not.toHaveBeenCalled();
    });

    /**
     * Rule 6, and the case this endpoint exists to get right. An author may read
     * their own poem in full at `GET /studio/poems/{id}` — what they may not
     * read is the account of what was changed in it and by whom, and here that
     * is the entire response, so it is refused rather than emptied.
     */
    it("refuses the poem's own author", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asAuthor))
        .expect(403);

      expect(body.message).toMatch(/EDITOR/);
      // The guard answers before the service, so nothing is even read.
      expect(prisma.poemRevision.findMany).not.toHaveBeenCalled();
    });

    it("answers an editor with every version, oldest first", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.items.map((item: { version: number }) => item.version)).toEqual([1, 2]);
      expect(body.items[0]).toMatchObject({
        version: 1,
        title: "Тінь над полем",
        body: "Тінь над полем лягла.",
        editedAt: "2026-01-02T03:04:05.000Z",
        editor: { penName: "Тарас Шевченко" },
      });
    });

    /** The point of the trail: the original survives whatever was done to it. */
    it("keeps the author's text as version 1 and the editor's as the next", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[1]).toMatchObject({
        version: 2,
        title: "Тінь над полем, друга редакція",
        editor: { penName: "Орися Вечірня" },
      });
      // Whole snapshots, not diffs — either version reads on its own.
      expect(body.items[1].body).toContain("і вітер затих");
    });

    /**
     * By `version` and not by `createdAt`: the number is unique per poem, so
     * there is no tie for two editors saving in the same millisecond to produce,
     * and the order the rows arrive in is the order their numbers already say.
     */
    it("asks for them oldest version first", async () => {
      await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(queried()).toMatchObject({
        where: { poemId: POEM_ID },
        orderBy: { version: "asc" },
      });
    });

    /**
     * A poem past `POEM_REVISIONS_MAX` has had the middle of its trail pruned,
     * and the numbers are what make that visible. Renumbering by position — which
     * is what the first draft of this endpoint did — would have presented a
     * hundred surviving rows as though they were versions 1 to 100 and the whole
     * story.
     */
    it("reports a pruned trail with its gap intact", async () => {
      prisma.poemRevision.findMany.mockResolvedValue([
        original,
        revisionRow({ id: "0192f5a7-6394-71a4-b5b6-819203142536", version: 52 }),
      ]);

      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items.map((item: { version: number }) => item.version)).toEqual([1, 52]);
    });

    it("carries the editor's name but never their permission", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items[1].editor).toMatchObject({
        slug: "orysia-vechirnia",
        roleTitle: "Хранитель слова",
      });
      expect(body.items[1].editor.role).toBeUndefined();
    });

    /** The floor is a floor, not an equality — an admin moderates too. */
    it("answers an admin", async () => {
      await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asAdmin))
        .expect(200);
    });

    it("404s for a poem that is not there", async () => {
      prisma.poemRevision.findMany.mockResolvedValue([]);
      prisma.poem.findUnique.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(404);

      expect(body.message).toContain(POEM_ID);
    });

    /**
     * The state the application cannot produce — a poem whose first version was
     * never written — is answered rather than asserted. If the invariant ever
     * breaks, an empty history is the true thing to say about it, and a 404 would
     * send an editor looking for a poem that is sitting in front of them.
     */
    it("answers an empty history for a poem that exists", async () => {
      prisma.poemRevision.findMany.mockResolvedValue([]);
      prisma.poem.findUnique.mockResolvedValue({ id: POEM_ID });

      const { body } = await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(body.items).toEqual([]);
    });

    /** One query on the ordinary path: the poem is only looked up on the miss. */
    it("does not confirm the poem exists when it has a history", async () => {
      await request(app.getHttpServer())
        .get(`/poems/${POEM_ID}/revisions`)
        .set(...bearer(asEditor))
        .expect(200);

      expect(prisma.poem.findUnique).not.toHaveBeenCalled();
    });

    it("400s on an id of the wrong UUID version", async () => {
      await request(app.getHttpServer())
        .get(`/poems/${UUID_V4}/revisions`)
        .set(...bearer(asEditor))
        .expect(400);

      expect(prisma.poemRevision.findMany).not.toHaveBeenCalled();
    });
  });
});
