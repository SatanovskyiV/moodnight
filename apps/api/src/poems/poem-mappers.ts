import {
  type StudioPoem,
  type StudioPoemSummary,
  TEASER_LINES,
  type PoemTag,
} from "@moodnight/shared";

import type { StudioPoemRow } from "./poem-fields";

/**
 * Rows out of Prisma, as the wire describes them — the shared half of what four
 * services would otherwise each write.
 *
 * Two conversions happen here and nowhere else. Prisma's `Date`s become the ISO
 * strings the schemas in @moodnight/shared promise, because JSON has no date
 * type; and the join rows on `tags` are flattened to the tags themselves,
 * because `{ tag: { name, slug } }` is a fact about how the many-to-many is
 * stored and not something a client should have to know.
 *
 * The public path's own mappers stay in ./poems.service.ts: they answer a
 * different shape (no `status`, non-nullable `publishedAt`) to a different
 * audience, and the one piece both halves genuinely share — {@link toTeaser} —
 * is here.
 */

/** Flattens the join rows on `tags` to the tags themselves. */
function toTags(rows: { tag: PoemTag }[]): PoemTag[] {
  return rows.map(({ tag }) => tag);
}

/**
 * The first {@link TEASER_LINES} lines, and whether that was all of them.
 *
 * Cut on lines rather than characters because the unit of a poem is the line:
 * a character cut would end a stanza mid-word and the card would render half a
 * thought. `truncated` is computed here and sent because a client counting the
 * lines it received cannot tell a six-line poem from the first six lines of a
 * long one.
 */
export function toTeaser(body: string): { teaser: string; truncated: boolean } {
  const lines = body.split("\n");

  return {
    teaser: lines.slice(0, TEASER_LINES).join("\n"),
    truncated: lines.length > TEASER_LINES,
  };
}

/** Everything the studio's two shapes share, which is everything but the text. */
function toStudioCore(row: StudioPoemRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    author: row.author,
    tags: toTags(row.tags),
    // Passed through as `null` rather than coalesced to `createdAt` the way the
    // public path's mapper does. There the fallback covers a case that cannot
    // arrive; here the null is the ordinary state of every draft, and inventing
    // a date for it would be a lie the studio then renders.
    publishedAt: row.publishedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readCount: row.readCount,
    featured: row.featured,
  };
}

/** A poem as the person who wrote it — or the editor about to decide on it — sees it. */
export function toStudioPoem(row: StudioPoemRow): StudioPoem {
  return { ...toStudioCore(row), body: row.body };
}

/**
 * The same poem as a row in a dashboard or a queue: the teaser in place of the
 * body, which is the one difference between the two shapes.
 *
 * The body is still read out of the database and thrown away after the cut, and
 * that is the same trade the public feed makes: fetching it costs far less than
 * a second round trip would, while *sending* twenty whole poems to a table that
 * renders six lines of each is a cost paid on every page.
 */
export function toStudioSummary(row: StudioPoemRow): StudioPoemSummary {
  return { ...toStudioCore(row), ...toTeaser(row.body) };
}
