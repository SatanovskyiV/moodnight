import {
  type PoemEdit,
  type PoemReview,
  type PoemRevision,
  type StudioPoem,
  type StudioPoemSummary,
  TEASER_LINES,
  type PoemTag,
  type UserRole,
} from "@moodnight/shared";

import { maySeeEdits, maySeeReviewer } from "./poem-access";
import type { RevisionRow, StudioPoemRow } from "./poem-fields";

/**
 * Rows out of Prisma, as the wire describes them — the shared half of what four
 * services would otherwise each write.
 *
 * Four conversions happen here and nowhere else. Prisma's `Date`s become the
 * ISO strings the schemas in @moodnight/shared promise, because JSON has no date
 * type; the join rows on `tags` are flattened to the tags themselves, because
 * `{ tag: { name, slug } }` is a fact about how the many-to-many is stored and
 * not something a client should have to know; the at-most-one row of `reviews`
 * becomes the poem's last decision, with the reviewer's name on it or without,
 * according to who is asking; and the at-most-one row of `revisions` becomes
 * `lastEdit`, together with the count beside it, or becomes nothing at all for
 * a caller who may not be told.
 *
 * Those last two are the only places on the site where the *contents* of a
 * response depend on the caller rather than only which rows they get, which is
 * why every function below takes a role and why {@link toReview} and
 * {@link toLastEdit} are the two that read it. They draw the line differently —
 * one hides a name inside a field, the other hides the field — and each says why
 * on its own doc comment.
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

/**
 * The last decision as the caller is allowed to see it, or null if nobody has
 * decided on this poem yet — which is every draft, and everything waiting in the
 * queue for the first time.
 *
 * `reviews` arrives with at most one row (`LATEST_REVIEW` in ./poem-fields), so
 * the array is a consequence of how a to-many relation is selected and not
 * something a client should have to unwrap.
 *
 * **The one line that matters is the last.** `reviewer` is the row's own column
 * for a moderator and null for everybody else, which is rule 5 in ./poem-access
 * — and it is applied here, at the boundary where the row becomes the wire,
 * rather than by narrowing the query. Selecting the reviewer conditionally would
 * put the rule in three services instead of one function, and the day a fourth
 * caller forgot it the failure would be silent and in the wrong direction.
 */
function toReview(rows: StudioPoemRow["reviews"], role: UserRole): PoemReview | null {
  const [latest] = rows;

  if (!latest) {
    return null;
  }

  return {
    action: latest.action,
    note: latest.note,
    decidedAt: latest.createdAt.toISOString(),
    reviewer: maySeeReviewer(role) ? latest.reviewer : null,
  };
}

/**
 * Which version the poem's text is on and whose hand it was, or null for a
 * caller who may not be told.
 *
 * **The whole field goes, not a name inside it**, which is the difference from
 * {@link toReview} and the reason this is a separate function rather than one
 * more line in that one. A review is built for everybody because the author is
 * owed the verdict whatever else they may not see, so only `reviewer` is
 * withheld. Here there is no owed half: that a poem is on its third version is
 * itself the editorial fact, and rule 6 in ./poem-access withholds all of it.
 *
 * The null is therefore two answers at once — "you may not be told" and "there
 * are no versions on record" — and nothing downstream needs to tell them apart:
 * both mean the same thing to a client, which is that there is nothing to show.
 * The second should not arise at all, since a poem's first version is written in
 * the same statement as the poem and the backfill in 20260816120000 gave one to
 * every poem that predates the table. It is handled rather than asserted because
 * a mapper is the wrong place to discover it.
 */
function toLastEdit(rows: StudioPoemRow["revisions"], role: UserRole): PoemEdit | null {
  const [latest] = rows;

  if (!latest || !maySeeEdits(role)) {
    return null;
  }

  return {
    version: latest.version,
    editor: latest.editor,
    editedAt: latest.createdAt.toISOString(),
  };
}

/**
 * The full trail, each row carrying the number it was given when it was written.
 *
 * The number is a column rather than the row's position, which is what lets a
 * pruned trail stay honest: a poem past `POEM_REVISIONS_MAX` has lost the middle
 * of its history, so the versions arrive as 1, 52, 53 … and the jump is where
 * those versions were. Numbering by position would quietly renumber the
 * survivors and present a hundred-row trail as though it were the whole story.
 *
 * No role parameter, unlike everything else in this file. Who may see a version
 * at all is the `@Roles("EDITOR")` floor on the controller, so by the time rows
 * reach this function the question has been answered — and answered by a refusal
 * rather than by an emptier response, which is the right shape for an endpoint
 * that exists only to serve them.
 */
export function toRevisions(rows: RevisionRow[]): PoemRevision[] {
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    editor: row.editor,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    editedAt: row.createdAt.toISOString(),
  }));
}

/**
 * Everything the studio's two shapes share, which is everything but the text.
 *
 * Takes the caller's role, which none of the public path's mappers do: this is
 * the only shape on the site whose *contents* depend on who asked, rather than
 * only which rows are returned.
 */
function toStudioCore(row: StudioPoemRow, role: UserRole) {
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
    review: toReview(row.reviews, role),
    lastEdit: toLastEdit(row.revisions, role),
  };
}

/** A poem as the person who wrote it — or the editor about to decide on it — sees it. */
export function toStudioPoem(row: StudioPoemRow, role: UserRole): StudioPoem {
  return { ...toStudioCore(row, role), body: row.body };
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
export function toStudioSummary(row: StudioPoemRow, role: UserRole): StudioPoemSummary {
  return { ...toStudioCore(row, role), ...toTeaser(row.body) };
}
