import type { Prisma } from "@moodnight/db";

/**
 * The columns a poem is read out of the database with, shared by the read path
 * and the write one.
 *
 * They live in their own file because both services select them and only one of
 * them is public. Duplicating the lists would mean the studio's copy could
 * quietly grow a column the feed's has not — and since the difference between
 * the two is a `where` clause and not a `select`, the day that happened would be
 * the day a private field reached a cached page.
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
 * What the write path selects: the same columns, plus the three a reader has no
 * use for and an author cannot work without — the text itself, where it is on
 * its way to being public, and when it was last saved.
 */
export const STUDIO_FIELDS = {
  ...POEM_FIELDS,
  body: true,
  status: true,
  updatedAt: true,
} as const;

export type PoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS }>;
export type FullPoemRow = Prisma.PoemGetPayload<{ select: typeof POEM_FIELDS & { body: true } }>;
export type StudioPoemRow = Prisma.PoemGetPayload<{ select: typeof STUDIO_FIELDS }>;
