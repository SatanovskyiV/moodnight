import type { Prisma } from "@moodnight/db";

import type { RelationFilter } from "../common/list-query";

/**
 * The columns a poem is read out of the database with, and what its two relation
 * filters mean in SQL — the query pieces every service on `/poems` shares.
 *
 * They live in their own file because four services select them and only one of
 * those is public. Duplicating the lists would mean the studio's copy could
 * quietly grow a column the feed's has not — and since the difference between
 * the paths is a `where` clause and not a `select`, the day that happened would
 * be the day a private field reached a cached page.
 */

/**
 * The author columns a reader is shown, and the boundary that keeps the rest
 * off the wire.
 *
 * `email`, `role`, `passwordHash` and `tokenVersion` all live on the same row
 * as `penName`, and a nested `author: true` would hand every one of them to
 * anonymous readers on every card in the feed. Naming the five wanted columns
 * is what makes that impossible rather than merely unintended — the same
 * argument as `PUBLIC_FIELDS` in the users service, and it matters more here
 * because this response is public.
 */
export const AUTHOR_FIELDS = {
  slug: true,
  penName: true,
  initials: true,
  roleTitle: true,
  avatarUrl: true,
} as const;

/** The columns every poem shape shares. `body` is added by the ones that need it. */
export const POEM_FIELDS = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  publishedAt: true,
  createdAt: true,
  readCount: true,
  featured: true,
  author: { select: AUTHOR_FIELDS },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
} as const;

/**
 * The columns of one moderation decision.
 *
 * The reviewer is selected by the same five columns an author is — an editor is
 * a poet with a role, and `AUTHOR_FIELDS` is already the list of what is safe to
 * say about an account. Which is worth stating plainly: `role` is not among
 * them, so the wire never carries the reviewer's *permission*, only the
 * decorative `roleTitle`. Whether the reviewer is sent at all is a separate
 * question and a per-caller one — see `reviewerFor` in ./poem-mappers.
 */
export const REVIEW_FIELDS = {
  action: true,
  note: true,
  createdAt: true,
  reviewer: { select: AUTHOR_FIELDS },
} as const;

/**
 * The last decision on a poem, and only the last.
 *
 * `take: 1` over the newest is what makes this affordable on a list: the queue
 * and the studio dashboard both fetch twenty poems at a time, and this rides
 * along on the index `Review` already has for exactly this ordering
 * (`@@index([poemId, createdAt(sort: Desc)])` in schema.prisma) rather than
 * loading every decision a poem has ever collected.
 *
 * A single-object `orderBy` rather than a tie-broken list, which is safe here
 * for a reason the queue guarantees: a decision can only be taken on a
 * PENDING_REVIEW poem, and the `where` on that transition means two of them
 * cannot land at once. There is no tie to break.
 */
export const LATEST_REVIEW = {
  select: REVIEW_FIELDS,
  orderBy: { createdAt: "desc" },
  take: 1,
} as const;

/**
 * What the write path selects: the same columns, plus the three a reader has no
 * use for and an author cannot work without — the text itself, where it is on
 * its way to being public, and when it was last saved — and the decision that
 * last moved it.
 *
 * The review is spread in **here and not into `POEM_FIELDS`**, which is the
 * whole reason these two constants are separate. A published poem's moderation
 * history is not part of the poem: the public feed is cached at the edge and
 * served to anonymous readers, and an editor's note about a second stanza is
 * the last thing that belongs in it.
 */
export const STUDIO_FIELDS = {
  ...POEM_FIELDS,
  body: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
  reviews: LATEST_REVIEW,
} as const;

export type PoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS }>;
export type FullPoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS & { body: true } }>;
export type StudioPoemRow = Prisma.PoemGetPayload<{ select: typeof STUDIO_FIELDS }>;

/**
 * What `?tag=` and `?author=` mean in SQL — the half of a relation filter that
 * @moodnight/shared is not allowed to hold, because a Prisma `where` fragment
 * cannot be imported by the browser bundle.
 *
 * Both take slugs and both accept several, which is what makes `?tag=a&tag=b`
 * "either theme" rather than "both". Either is a plausible reading; OR is the
 * one a reader browsing themes expects, and AND over a small archive mostly
 * returns nothing.
 *
 * Shared by the public feed and the moderation queue, which declare the same two
 * filters in @moodnight/shared. One mapping means `?author=vasyl-stus` narrows
 * by the same column in both, rather than by two fragments that agree until one
 * of them is changed.
 */
export const POEM_RELATIONS: Record<string, RelationFilter<Prisma.PoemWhereInput>> = {
  tag: (slugs) => ({ tags: { some: { tag: { slug: { in: [...slugs] } } } } }),
  author: (slugs) => ({ author: { slug: { in: [...slugs] } } }),
};
