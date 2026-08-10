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
export const poemList = defineList({
  item: poemSummarySchema,
  searchable: ["title", "subtitle"],
  sortable: ["publishedAt", "readCount", "title"],
  filterable: ["featured"],
  related: {
    tag: z.string().max(80).meta({ description: "A tag's slug. Repeatable.", example: "sakralne" }),
    author: z
      .string()
      .max(120)
      .meta({ description: "An author's slug. Repeatable.", example: "orysia-vechirnia" }),
  },
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
 * A poem as the person who wrote it sees it — the shape `POST /poems` and
 * `PATCH /poems/:id` answer with.
 *
 * Three differences from {@link poemSchema}, and each of them is why this
 * exists rather than being the same schema:
 *
 * - **`status` is present.** On the read path it is absent because the answer
 *   is always PUBLISHED and a constant field is noise. Here it is the single
 *   most important thing on the row — where the poem is between a draft and a
 *   page — and the studio's dashboard is mostly a rendering of it.
 * - **`publishedAt` is nullable, and honestly so.** A draft has never been
 *   published. The read path's non-nullable version is true only because every
 *   query behind it pins the status; nothing pins it here.
 * - **`updatedAt` is present.** "Saved just now" is what an editor needs to
 *   see and a reader does not.
 *
 * `readCount` and `featured` come along unchanged and are both read-only in
 * practice: nothing an author sends sets them, and `featured` is writable only
 * through {@link updatePoemSchema} by an editor.
 */
export const studioPoemSchema = poemCoreSchema
  .omit({ publishedAt: true })
  .extend({
    body: z.string().meta({ description: "The poem, newline-separated." }),
    status: poemStatusSchema,
    publishedAt: z.iso.datetime().nullable().meta({
      description: "When the poem became public, or null if it never has.",
    }),
    createdAt: z.iso.datetime().meta({ description: "When the poem was first written." }),
    updatedAt: z.iso.datetime().meta({ description: "When it was last saved." }),
  })
  .meta({ description: "A poem as its author sees it, drafts included." });

export type StudioPoem = z.infer<typeof studioPoemSchema>;

/**
 * The three statuses a client may ask for, out of the four the column holds.
 *
 * REJECTED is deliberately not among them. A rejection is not a field — it is a
 * decision with a reason attached, and the reason lives on a `Review` row that
 * the author is owed and that nothing here writes. Accepting `status: REJECTED`
 * on a PATCH would let an editor bounce a poem back with no note and no record
 * of who did it, which is precisely the state the `Review` model exists to
 * prevent. Approving and rejecting from the queue is Phase 4's, and it goes
 * through its own endpoint because it writes two rows and not one.
 *
 * Of the three that are here, only two are an author's to choose — see
 * `assertMaySetStatus` in the API, which is where the ladder is applied.
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
