import { z } from "zod";

import { defineList } from "./list";

/**
 * The public read path's contract — what a reader's browser receives from
 * `GET /poems` and `GET /poems/:slug`, and the shapes the ISR pages are built
 * from.
 *
 * Two schemas describe a poem here rather than one, and the split is the whole
 * design: a **summary** carries a teaser and goes out twelve at a time to an
 * infinite feed, while the **full** poem carries its body and goes out once,
 * to its own page. Sending whole bodies to the feed would multiply the one
 * payload the scroller downloads over and over by the length of the longest
 * poem on the page, for text no card renders.
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
