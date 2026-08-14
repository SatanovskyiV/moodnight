import { z } from "zod";

import { defineList } from "./list";

/**
 * A poem's contract, on both paths.
 *
 * **The read path** — what a reader's browser receives from `GET /poems` and
 * `GET /poems/:slug`, and the shapes the ISR pages are built from. Two schemas
 * describe a poem there rather than one, and the split is the whole design: a
 * **summary** carries a teaser and goes out twelve at a time to an infinite
 * feed, while the **full** poem carries its body and goes out once, to its own
 * page. Sending whole bodies to the feed would multiply the one payload the
 * scroller downloads over and over by the length of the longest poem on the
 * page, for text no card renders.
 *
 * **The write path** — what an author sends to `POST /poems` and
 * `PATCH /poems/:id`, and the third shape, {@link studioPoemSchema}, that both
 * answer with. It is not `poemSchema`: a poem that has just been created is a
 * draft, and a draft has a `status` worth seeing and no publication date at
 * all. Answering a create with a schema that promises `publishedAt` would mean
 * either lying about it or refusing to return the row that was just written.
 *
 * **The private read path** — `GET /studio/poems`, `GET /studio/poems/:id` and
 * `GET /admin/queue`, which repeat the summary/full split one level down:
 * {@link studioPoemSummarySchema} is a row in a dashboard or a queue and
 * `studioPoemSchema` is the poem an editor is about to decide on. Six shapes
 * for one model sounds like a lot until it is written out — they are three
 * audiences (a reader, an author, an editor) times two densities (a list, a
 * page), and collapsing any pair of them means one of the six sends a field its
 * audience should not have.
 */

/**
 * Where a poem is between a draft and a published page. Kept in step with the
 * `PoemStatus` enum in packages/db by the mapper in the API's poems service,
 * which assigns one into the other.
 *
 * Declared rather than re-exported from Prisma for the same reason
 * `userRoleSchema` is: this package is imported by the browser bundle and
 * nothing in @moodnight/db belongs there.
 */
export const poemStatusSchema = z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]).meta({
  description:
    "Where the poem is on its way to being public. Only PUBLISHED poems are " +
    "returned by the public endpoints.",
  example: "PUBLISHED",
});

export type PoemStatus = z.infer<typeof poemStatusSchema>;

/**
 * How many lines of a poem a card shows before the reader has to open it.
 *
 * Six, which is what the prototype's card truncated to and roughly one stanza —
 * enough to establish a voice, short enough that a card stays a card. Exported
 * because the API cuts the teaser and the web app renders the fade over it, and
 * a fade positioned for a different number of lines is a visible bug.
 */
export const TEASER_LINES = 6;

/**
 * An author as a reader meets them — on a card, under a title, on their own
 * page. A deliberate subset of `userSchema`: no email, no role, no timestamps.
 *
 * This is the shape that makes the public endpoints safe to cache at the edge.
 * A poem is served to anonymous readers by the million and its author's login
 * identity is not part of it, so the field simply is not selected rather than
 * being stripped somewhere downstream.
 *
 * `role` is absent for a second reason worth naming: the permission is nobody's
 * business but the site's, and {@link poemAuthorSchema.roleTitle} — the
 * decorative "Хранитель слова" — is the thing a reader is actually shown. The
 * two are different columns and conflating them is the mistake the schema is
 * shaped to prevent.
 */
export const poemAuthorSchema = z
  .object({
    slug: z.string().meta({
      description: "The author's address on the site.",
      example: "orysia-vechirnia",
    }),
    penName: z
      .string()
      .meta({ description: "The name shown to readers.", example: "Орися Вечірня" }),
    initials: z.string().meta({ description: "Up to two letters, for the avatar.", example: "ОВ" }),
    roleTitle: z.string().nullable().meta({
      description: "A decorative title, not a permission. Null if the author has none.",
      example: "Хранитель слова",
    }),
    avatarUrl: z.url().nullable().meta({
      description: "Null until Phase 6 gives avatars somewhere to live.",
    }),
  })
  .meta({ description: "A poem's author, as readers see them." });

export type PoemAuthor = z.infer<typeof poemAuthorSchema>;

/** A theme a poem belongs to. `id` is absent because the slug is the address. */
export const poemTagSchema = z
  .object({
    name: z.string().meta({ description: "The displayed Ukrainian name.", example: "Меланхолія" }),
    slug: z.string().meta({ description: "Its address.", example: "melankholiia" }),
  })
  .meta({ description: "A theme a poem is filed under." });

export type PoemTag = z.infer<typeof poemTagSchema>;

/**
 * Everything both shapes share. Not exported: it is a factoring device, and
 * what the API answers with is one of the two schemas built from it.
 *
 * `publishedAt` is non-nullable even though the column is. Every endpoint that
 * returns one of these constrains the query to published poems, and a published
 * poem has a publication date — so what the client receives is never null, and
 * describing it as nullable would push a branch into every consumer to handle a
 * case that cannot arrive.
 */
const poemCoreSchema = z.object({
  id: z.uuid().meta({ description: "UUIDv7 — time-ordered, so it sorts by creation." }),
  slug: z.string().meta({ description: "The poem's address.", example: "tin-nad-polem" }),
  title: z.string().min(1).max(200).meta({ example: "Тінь над полем" }),
  subtitle: z.string().max(200).nullable().meta({
    description: "The line under the title, if any.",
    example: "із циклу «Спалені листи»",
  }),
  author: poemAuthorSchema,
  tags: z.array(poemTagSchema).meta({ description: "Themes, possibly none." }),
  publishedAt: z.iso.datetime().meta({ description: "When the poem became public." }),
  readCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: "How many times it has been opened.", example: 1247 }),
  featured: z.boolean().meta({
    description: "Whether an editor has put it on the front page.",
    example: false,
  }),
});

/**
 * A poem as it appears in a list — the card in the feed.
 *
 * `teaser` is the first {@link TEASER_LINES} lines and `truncated` says whether
 * anything was cut. The flag is not derivable by the client: a poem of exactly
 * six lines and one of sixty both arrive with six, and only the server knows
 * which. Without it the card would either fade a complete poem or fail to fade
 * an incomplete one.
 */
export const poemSummarySchema = poemCoreSchema
  .extend({
    teaser: z.string().meta({
      description: `The first ${TEASER_LINES} lines, newline-separated.`,
    }),
    truncated: z.boolean().meta({
      description: "Whether the poem is longer than the teaser shows.",
      example: true,
    }),
  })
  .meta({ description: "A poem as a card in the feed shows it." });

export type PoemSummary = z.infer<typeof poemSummarySchema>;

/** A poem on its own page: the same fields, and the whole text. */
export const poemSchema = poemCoreSchema
  .extend({
    body: z.string().meta({
      description:
        "The poem, newline-separated, as its author typed it. Plain text — the " +
        "line breaks are content, so a client renders them and does not reflow them.",
    }),
  })
  .meta({ description: "A poem in full." });

export type Poem = z.infer<typeof poemSchema>;

/**
 * What `GET /poems` accepts and answers with — the public feed, and the second
 * use of the list framework in ./list.
 *
 * The choices, and why each is the one it is:
 *
 * - **searchable** — `title` and `subtitle` only. Leaving `body` out is
 *   deliberate and is the roadmap's Phase 5 line: the framework's `search` is a
 *   leading-wildcard `ILIKE`, which is right for a name and wrong for a poem.
 *   Searching *inside* poems is Postgres full-text, and it belongs beside this
 *   rather than smuggled into it.
 * - **sortable** — the three orderings the site actually offers a reader:
 *   newest, most read, and alphabetical. `createdAt` is absent on purpose —
 *   when a poem was *written* is the author's business, and a poem drafted in
 *   March and approved in August belongs at August's end of the feed.
 * - **filterable** — `featured`, which is a real boolean column so the ordinary
 *   filter machinery serves it. `status` is *not* here and must never be: the
 *   public endpoint pins it to PUBLISHED through `listArgs`' base constraint,
 *   which no query parameter can lift.
 * - **related** — `tag` and `author`, neither of which is a column on a poem.
 *   These are what `/tag/[slug]` and `/author/[slug]` are: the same feed with
 *   one more clause, rather than three endpoints that drift apart.
 *
 * Newest first is the default because that is what a feed means. A reader who
 * wants the canon sorts by `readCount`.
 */
const poemRelationFilters = {
  tag: z.string().max(80).meta({ description: "A tag's slug. Repeatable.", example: "sakralne" }),
  author: z
    .string()
    .max(120)
    .meta({ description: "An author's slug. Repeatable.", example: "orysia-vechirnia" }),
};

export const poemList = defineList({
  item: poemSummarySchema,
  searchable: ["title", "subtitle"],
  sortable: ["publishedAt", "readCount", "title"],
  filterable: ["featured"],
  // Shared with the moderation queue below rather than written out twice, so
  // `?author=` narrows by the same key in both places. `filterParam` wraps each
  // of these in a fresh schema per list, so there is no shared state to leak.
  related: poemRelationFilters,
  defaultSort: "publishedAt",
  defaultOrder: "desc",
});

/** The query parameters `GET /poems` accepts, parsed. */
export const listPoemsQuerySchema = poemList.query;

export type ListPoemsQuery = z.infer<typeof listPoemsQuerySchema>;

/** One page of poems, as `GET /poems` answers. */
export const poemPageSchema = poemList.page.meta({
  description: "A page of poems, and how many match in total.",
});

export type PoemPage = z.infer<typeof poemPageSchema>;

/**
 * Which way a decision went. Kept in step with the `ReviewAction` enum in
 * packages/db by the mapper in the API's poems module, the same arrangement
 * {@link poemStatusSchema} has.
 */
export const reviewActionSchema = z.enum(["APPROVE", "REJECT"]).meta({
  description: "APPROVE published the poem; REJECT sent it back to its author.",
  example: "REJECT",
});

export type ReviewAction = z.infer<typeof reviewActionSchema>;

/**
 * The last decision taken on a poem — who said what, and when.
 *
 * **Only the last one.** A poem rejected, revised and approved has two `Review`
 * rows behind it, and this is the newer. The whole trail is history worth
 * keeping in the table and not worth sending on every row of a queue: what a
 * client renders is "sent back on Tuesday, because —", and that is one row.
 *
 * **`reviewer` is nullable, and the null carries information.** It is not "the
 * decision was anonymous" — every `Review` names its reviewer in the database.
 * It means *this caller is not allowed to know*. Who moderates whom is
 * editorial business: an author is owed the verdict and the reason, which are
 * the two things they can act on, and is not owed the name of the person who
 * took the decision. The line is drawn in `reviewerFor` in the API's poem
 * mappers, and it is drawn there rather than in this schema for the reason
 * every rule in `poem-access.ts` lives where it does — it is a comparison
 * between the caller and the row, and a schema sees only one of them.
 *
 * The reviewer is described by {@link poemAuthorSchema} rather than a shape of
 * its own, and deliberately so: an editor is a poet with a role, the fields a
 * client needs to render one are exactly the fields it needs to render the
 * other, and two structurally identical components would become two identical
 * types in the generated client for no gain. Nothing about the *permission*
 * appears here — `roleTitle` is the decorative "Хранитель слова" and `role` is
 * absent, which is the same boundary the schema draws for an author.
 */
export const poemReviewSchema = z
  .object({
    action: reviewActionSchema,
    note: z
      .string()
      .nullable()
      .meta({
        description:
          "What the editor wrote to the author. Always present on a rejection — " +
          "the API refuses one without a reason — and often null on an approval.",
        example: "Гарний початок, але друга строфа обривається раніше за думку.",
      }),
    decidedAt: z.iso.datetime().meta({ description: "When the decision was taken." }),
    reviewer: poemAuthorSchema.nullable().meta({
      description:
        "Who decided, for editors and above. Null for anyone else — including " +
        "the poem's own author, who is shown the verdict and the reason but not " +
        "the name behind them.",
    }),
  })
  .meta({ description: "The last moderation decision taken on a poem." });

export type PoemReview = z.infer<typeof poemReviewSchema>;

/**
 * Everything the private half of the site says about a poem, and the base its
 * two shapes are built from — the same factoring {@link poemCoreSchema} does
 * for the public half, and for the same reason: the full poem and the row in a
 * list must differ in exactly one field, and writing them separately is how
 * they stop doing so.
 *
 * Five differences from {@link poemSchema}, and each of them is why these exist
 * rather than being the same schemas:
 *
 * - **`status` is present.** On the read path it is absent because the answer
 *   is always PUBLISHED and a constant field is noise. Here it is the single
 *   most important thing on the row — where the poem is between a draft and a
 *   page — and the studio's dashboard is mostly a rendering of it.
 * - **`publishedAt` is nullable, and honestly so.** A draft has never been
 *   published. The read path's non-nullable version is true only because every
 *   query behind it pins the status; nothing pins it here.
 * - **`submittedAt` is present, and nullable for the same reason.** It is what
 *   the queue is ordered by and what "waiting since Tuesday" is rendered from.
 * - **`updatedAt` is present.** "Saved just now" is what an editor needs to
 *   see and a reader does not.
 * - **`review` is present.** `status` says a poem was sent back; this says why,
 *   and — to an editor — by whom. A REJECTED poem with no reason attached is
 *   the state the `Review` table exists to prevent, and it stays prevented only
 *   if something actually reads the row back.
 *
 * `readCount` and `featured` come along unchanged and are both read-only in
 * practice: nothing an author sends sets them, and `featured` is writable only
 * through {@link updatePoemSchema} by an editor.
 */
const studioPoemCoreSchema = poemCoreSchema.omit({ publishedAt: true }).extend({
  status: poemStatusSchema,
  publishedAt: z.iso.datetime().nullable().meta({
    description: "When the poem became public, or null if it never has.",
  }),
  review: poemReviewSchema.nullable().meta({
    description:
      "The last decision an editor took on this poem, or null if nobody has " +
      "decided on one yet — which is every draft and everything still waiting " +
      "in the queue for the first time.",
  }),
  submittedAt: z.iso
    .datetime()
    .nullable()
    .meta({
      description:
        "When the poem last entered the moderation queue, or null if it never " +
        "has. Not cleared when it leaves — it says when the poem last asked to " +
        "be read, which stays true afterwards.",
    }),
  createdAt: z.iso.datetime().meta({ description: "When the poem was first written." }),
  updatedAt: z.iso.datetime().meta({ description: "When it was last saved." }),
});

export const studioPoemSchema = studioPoemCoreSchema
  .extend({
    body: z.string().meta({ description: "The poem, newline-separated." }),
  })
  .meta({ description: "A poem as its author sees it, drafts included." });

export type StudioPoem = z.infer<typeof studioPoemSchema>;

/**
 * A poem as a row in the studio's dashboard or the moderation queue — the
 * private half's answer to {@link poemSummarySchema}, and the same trade.
 *
 * The teaser is here instead of the body for the reason the public feed's is:
 * a page holds twenty of these, a row renders six lines, and sending twenty
 * whole poems to render a hundred and twenty lines is a cost paid on every
 * scroll. An editor who is about to decide on a poem asks for it by id and gets
 * the whole thing; a queue that lists twenty does not need any of them in full.
 */
export const studioPoemSummarySchema = studioPoemCoreSchema
  .extend({
    teaser: z.string().meta({
      description: `The first ${TEASER_LINES} lines, newline-separated.`,
    }),
    truncated: z.boolean().meta({
      description: "Whether the poem is longer than the teaser shows.",
      example: true,
    }),
  })
  .meta({ description: "A poem as a row in the studio or the queue." });

export type StudioPoemSummary = z.infer<typeof studioPoemSummarySchema>;

/**
 * What `GET /studio/poems` accepts — an author's own work, whatever state it is
 * in, and the third use of the list framework in ./list.
 *
 * The differences from {@link poemList} all follow from one thing: this list is
 * scoped to the caller by a base constraint on `authorId`, so what is safe to
 * offer is not the same set.
 *
 * - **filterable** — `status`, which the public feed must never offer and this
 *   one is mostly *about*: "show me my drafts" is the dashboard's main gesture.
 *   Safe here precisely because the base pins the author, so the widest thing
 *   the parameter can reach is the caller's own shelf.
 * - **sortable** — `updatedAt` first among them, and the default. A writer
 *   returning to the studio is looking for what they were last working on, not
 *   for what the site last published. `status` is sortable too and orders by
 *   the Postgres enum's declared order — draft, queued, published, rejected —
 *   which is the poem's own journey and reads better than alphabetically.
 * - **related** — nothing. `?author=` would be either redundant or a way to ask
 *   about somebody else, and `?tag=` is a reader's way of browsing rather than
 *   a writer's way of finding one of their own dozen poems.
 */
export const studioPoemList = defineList({
  item: studioPoemSummarySchema,
  searchable: ["title", "subtitle"],
  sortable: ["updatedAt", "createdAt", "publishedAt", "title", "status"],
  filterable: ["status"],
  defaultSort: "updatedAt",
  defaultOrder: "desc",
});

/** The query parameters `GET /studio/poems` accepts, parsed. */
export const listStudioPoemsQuerySchema = studioPoemList.query;

export type ListStudioPoemsQuery = z.infer<typeof listStudioPoemsQuerySchema>;

/**
 * What `GET /admin/queue` accepts — every poem waiting to be read.
 *
 * `status` is deliberately **not** filterable, which is the same statement
 * {@link poemList} makes and for the same reason: the endpoint pins it to
 * PENDING_REVIEW through a base constraint, and a filter of the same name would
 * be a parameter that looks like it could widen the set. The omission is the
 * boundary.
 *
 * Oldest first, and this is the one list on the site that ascends by default. A
 * queue read newest-first is a queue whose oldest submission is never reached,
 * and the poem that has waited longest is the one an editor owes an answer to.
 * `submittedAt` and not `updatedAt` orders it, so an editor fixing a line
 * before approving does not push the poem to the back of the queue they are
 * currently reading from.
 *
 * `author` and `tag` come from the same declarations the public feed uses, so
 * "everything Vasyl has waiting" is one parameter rather than a second endpoint.
 */
export const poemQueueList = defineList({
  item: studioPoemSummarySchema,
  searchable: ["title", "subtitle"],
  sortable: ["submittedAt", "createdAt", "title"],
  filterable: [],
  related: poemRelationFilters,
  defaultSort: "submittedAt",
  defaultOrder: "asc",
});

/** The query parameters `GET /admin/queue` accepts, parsed. */
export const poemQueueQuerySchema = poemQueueList.query;

export type PoemQueueQuery = z.infer<typeof poemQueueQuerySchema>;

/**
 * One page of poems as the studio and the queue answer with.
 *
 * Both endpoints share this envelope because they answer with the same rows —
 * what differs between them is which rows, and that is a `where` clause rather
 * than a shape. Two structurally identical components in the OpenAPI document
 * would become two identical types in the generated client, and a queue table
 * and a studio table that cannot be handed the same row renderer.
 */
export const studioPoemPageSchema = studioPoemList.page.meta({
  description: "A page of poems as their author or an editor sees them.",
});

export type StudioPoemPage = z.infer<typeof studioPoemPageSchema>;

/**
 * The three statuses a client may ask for, out of the four the column holds.
 *
 * REJECTED is deliberately not among them. A rejection is not a field — it is a
 * decision with a reason attached, and the reason lives on a `Review` row that
 * the author is owed and that nothing here writes. Accepting `status: REJECTED`
 * on a PATCH would let an editor bounce a poem back with no note and no record
 * of who did it, which is precisely the state the `Review` model exists to
 * prevent. That is what `POST /poems/:id/reject` is for, below: it writes two
 * rows in one transaction, and {@link rejectPoemSchema} is why it cannot write
 * the first without the second.
 *
 * Of the three that are here, only two are an author's to choose — see
 * `assertMaySetStatus` in the API, which is where the ladder is applied.
 *
 * PENDING_REVIEW is also how a rejected poem comes back: there is no separate
 * "resubmit", because sending it to the queue again is the same gesture as
 * sending it the first time, and the `Review` row stays behind it as history.
 */
export const writablePoemStatusSchema = z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED"]).meta({
  description:
    "DRAFT keeps the poem private, PENDING_REVIEW submits it to the queue, and " +
    "PUBLISHED makes it public — the last of which is an editor's to set. " +
    "Rejecting is not here: it carries a note, and that is the queue's own endpoint.",
  example: "PENDING_REVIEW",
});

export type WritablePoemStatus = z.infer<typeof writablePoemStatusSchema>;

/**
 * The longest body the API will accept.
 *
 * Not a limit the column has — `body` is `Text`, and Postgres would take a
 * megabyte without complaint. It is a limit on what one request may cost, the
 * same argument `passwordSchema`'s maximum makes: this row is written by a
 * function that bills by the millisecond and read by a feed that cuts it to six
 * lines. Twenty thousand characters is around three hundred lines of verse,
 * which is past any poem this site will hold and far short of an attack.
 *
 * Exported because the studio's editor shows the count, and a counter that
 * disagrees with the server is worse than none.
 */
export const POEM_BODY_MAX = 20_000;

/**
 * How many themes one poem may carry.
 *
 * Tags are how the archive is browsed, so a poem filed under everything is a
 * poem filed under nothing. Six is more than any of the seeded poems use.
 */
export const POEM_TAGS_MAX = 6;

/**
 * Everything a client may write to a poem, and the base both the create and the
 * update schema are built from.
 *
 * `title` and `subtitle` are picked from {@link poemCoreSchema} rather than
 * re-declared, so their limits are written once and a request is checked
 * against exactly what the response promises.
 *
 * What is *absent* is the more interesting half, and none of it is an
 * oversight:
 *
 * - **`slug`** — derived from the title by the server and then frozen for the
 *   life of the row. A published URL is a promise, so renaming a poem
 *   deliberately does not move its address; the same rule `User.slug` follows.
 * - **`author`** — a poem's author is whoever is holding the token. There is no
 *   field to carry somebody else's id, which is what makes posting under
 *   another name impossible rather than merely guarded against.
 * - **`readCount`** — a counter the site owns.
 * - **`publishedAt`** — a consequence of `status`, stamped by the server. Two
 *   writable fields that have to agree is one more thing that can disagree.
 */
const writablePoemFields = poemCoreSchema.pick({ title: true, subtitle: true }).extend({
  // Optional on top of nullable, and the two mean different things on a PATCH:
  // absent leaves the subtitle alone, `null` removes it.
  subtitle: poemCoreSchema.shape.subtitle.optional(),
  body: z
    .string()
    .min(1, "A poem needs some words.")
    .max(POEM_BODY_MAX)
    .meta({
      description:
        "The poem, newline-separated, as it should be read. Plain text — the line " +
        "breaks are content, not formatting.",
      example: "Тінь над полем лягла,\nі вітер затих.",
    }),
  // Slugs of tags that already exist, not names to create. Tags are curated
  // (see the note on the `Tag` model in packages/db): a free-form list typed by
  // five people is how browsing by theme stops working, so an unknown slug is a
  // 400 naming it rather than a seventh spelling of "Меланхолія".
  //
  // On a PATCH this replaces the whole set — `[]` files the poem under nothing,
  // absent leaves its themes as they are.
  tags: z
    .array(z.string().max(80))
    .max(POEM_TAGS_MAX)
    .optional()
    .meta({
      description: `Slugs of existing tags, at most ${POEM_TAGS_MAX}. Replaces the whole set.`,
      example: ["melankholiia", "nich"],
    }),
  status: writablePoemStatusSchema.optional(),
});

/**
 * What a client sends to `POST /poems`.
 *
 * `status` may be omitted, in which case the column's `@default(DRAFT)` in
 * packages/db decides — so the default is written in one place, the same
 * arrangement `role` has on `createUserSchema`.
 *
 * Strict rather than stripping: an unrecognised key is a 400. An author whose
 * editor sends `content` instead of `body` should hear about it on the request
 * that did nothing, rather than discover it when the poem comes back empty.
 */
export const createPoemSchema = writablePoemFields
  .strict()
  .meta({ description: "The fields needed to create a poem." });

export type CreatePoemInput = z.infer<typeof createPoemSchema>;

/**
 * What a client sends to `PATCH /poems/:id` — any subset of the writable
 * fields, and at least one of them.
 *
 * The at-least-one rule is not pedantry: Prisma stamps `updatedAt` on every
 * `update` regardless of whether the data changes anything, so accepting `{}`
 * would let a no-op request move a poem's "saved" time.
 */
export const updatePoemSchema = writablePoemFields
  .extend({
    // Patchable and deliberately not creatable, for the reason `active` is the
    // other way round on a user: a poem cannot be on the front page before it
    // is a poem. This is an editorial decision about the home page rather than
    // anything about the text, so the API accepts it only from an editor.
    featured: z.boolean().meta({
      description: "Whether the poem sits on the front page. Editors and above.",
      example: true,
    }),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to change.",
  })
  .meta({ description: "The fields to change on a poem. At least one is required." });

export type UpdatePoemInput = z.infer<typeof updatePoemSchema>;

/**
 * The longest note a moderation decision may carry, matching `Review.note`'s
 * `VarChar(2000)` in packages/db.
 *
 * The column is the limit here rather than a cost argument, which is the
 * opposite of {@link POEM_BODY_MAX}: a note longer than the column would be a
 * 500 from Postgres on a request the API had already accepted, so the schema
 * refusing it first is what turns that into a 400 naming the field.
 */
export const REVIEW_NOTE_MAX = 2_000;

/** The note itself, on the two schemas below — trimmed, and never merely spaces. */
const reviewNoteSchema = z
  .string()
  .trim()
  .min(1, "A note that is empty is not a note. Leave it out instead.")
  .max(REVIEW_NOTE_MAX);

/**
 * What a client sends to `POST /poems/:id/approve`.
 *
 * The note is optional, which is the whole difference between this schema and
 * {@link rejectPoemSchema} and the reason there are two of them rather than one
 * with an `action` field. An approval that says nothing is the ordinary case —
 * the poem is on the site, which is the message — while a rejection with no
 * reason is the thing the `Review` table exists to make impossible.
 *
 * An empty object is a valid body, so a client that has nothing to add may send
 * `{}` rather than having to omit the body entirely.
 */
export const approvePoemSchema = z
  .object({
    note: reviewNoteSchema.optional().meta({
      description: "A word to the author, kept on the record. Optional on an approval.",
      example: "Третя строфа тепер тримає весь вірш.",
    }),
  })
  .strict()
  .meta({ description: "An approval, and optionally why." });

export type ApprovePoemInput = z.infer<typeof approvePoemSchema>;

/**
 * What a client sends to `POST /poems/:id/reject`.
 *
 * The note is **required**, and that is the application half of a promise the
 * column cannot make: `Review.note` is nullable because an approval rarely
 * needs words, so "a rejection always carries its reason" has to be enforced
 * where the decision is made. An author whose poem comes back with no reason
 * has been told nothing they can act on, and the whole point of keeping the
 * decision as a row rather than as a status is that it has a reason attached.
 */
export const rejectPoemSchema = z
  .object({
    note: reviewNoteSchema.meta({
      description:
        "Why the poem is coming back, in the author's language. Required — a " +
        "rejection without a reason is not one.",
      example: "Гарний початок, але друга строфа обривається раніше за думку.",
    }),
  })
  .strict()
  .meta({ description: "A rejection, and why." });

export type RejectPoemInput = z.infer<typeof rejectPoemSchema>;
