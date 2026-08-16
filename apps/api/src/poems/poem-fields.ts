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
 * What one version of a poem says about who wrote it, and nothing about what it
 * said.
 *
 * The narrow half of {@link REVISION_FIELDS}, and the split is the whole reason
 * there are two constants. `lastEdit` rides along on every studio and queue row,
 * and the newest revision's text is by construction identical to the poem's
 * current `body` — so selecting it there would send every poem on the page
 * twice.
 *
 * The editor is selected by the same five columns an author and a reviewer are,
 * for the reason given on {@link REVIEW_FIELDS}: `role` is not among them, so
 * the wire never carries an editor's permission.
 */
export const EDIT_FIELDS = {
  version: true,
  createdAt: true,
  editor: { select: AUTHOR_FIELDS },
} as const;

/**
 * The version a poem's text is currently on, and only that one.
 *
 * `take: 1` over the newest, riding the unique index `PoemRevision` has for
 * exactly this ordering (`@@unique([poemId, version])` in schema.prisma) — the
 * same arrangement, and the same cost argument, as {@link LATEST_REVIEW} above:
 * one batched relation load per page rather than every version every poem has
 * ever had.
 *
 * Ordered by `version` and not by `createdAt`, which is the difference from
 * `LATEST_REVIEW` and removes a problem rather than solving one. Two decisions
 * cannot land on a poem at once, so a review's timestamp needs no tie-break; two
 * editors saving the same poem in the same millisecond *can*, and a timestamp
 * with millisecond precision would need one. `version` is unique per poem, so
 * there is no tie to break and the answer is the same row every time.
 */
export const LATEST_REVISION = {
  select: EDIT_FIELDS,
  orderBy: { version: "desc" },
  take: 1,
} as const;

/**
 * One whole version, as `GET /poems/{id}/revisions` lists them: everything
 * {@link EDIT_FIELDS} says about who saved it, plus the text they saved.
 *
 * The text is here and not in `LATEST_REVISION` because this is the one endpoint
 * that is *about* the text — a client comparing two versions needs both in full,
 * and there is no cheaper shape that answers the question the trail is asked.
 */
export const REVISION_FIELDS = {
  ...EDIT_FIELDS,
  id: true,
  title: true,
  subtitle: true,
  body: true,
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
 *
 * The same boundary, and the same sentence, covers `revisions`. Who rewrote a
 * stanza before it was approved is editorial working material — it belongs to
 * the private half of the site and is narrowed again per caller by `toLastEdit`
 * in ./poem-mappers, which is what keeps it from an author who is allowed to
 * select these columns but not to read them.
 *
 * The version number rides in on that one row rather than being counted: it is a
 * column on the newest revision, so nothing here aggregates. Which is also the
 * truthful answer once a trail has been pruned — a poem written a hundred and
 * thirty-seven times says 137, where counting the rows still on record would say
 * a hundred.
 */
export const STUDIO_FIELDS = {
  ...POEM_FIELDS,
  body: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
  reviews: LATEST_REVIEW,
  revisions: LATEST_REVISION,
} as const;

export type PoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS }>;
export type FullPoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS & { body: true } }>;
export type StudioPoemRow = Prisma.PoemGetPayload<{ select: typeof STUDIO_FIELDS }>;
export type RevisionRow = Prisma.PoemRevisionGetPayload<{ select: typeof REVISION_FIELDS }>;

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
