import { slugify } from "@moodnight/shared";

/**
 * Finding a slug nobody is using yet.
 *
 * Two people may honestly share a pen name and two poems a title, so a slug
 * derived from either is not unique on its own. This adds the smallest numeric
 * suffix that frees it — `ivan-franko`, then `ivan-franko-2` — which is the
 * convention every publishing tool uses and the one a reader will not notice.
 *
 * It does **not** make the insert safe on its own, and is not meant to: two
 * requests can both read the same set of taken slugs and both decide on
 * `ivan-franko-2`. The unique index is what settles that, and the caller
 * catches the violation. What this buys is that the common case — no collision
 * at all, or one against a row that already exists — never reaches the index,
 * so a 409 means something genuinely simultaneous happened rather than "two
 * people share a surname".
 */

/**
 * What a slug falls back to when the source transliterates to nothing at all —
 * a pen name of only punctuation, or of a script the table does not cover.
 *
 * A row still needs an address, and an empty one would collapse every such row
 * onto the same unique key. The suffixing below turns the second into
 * `author-2`, which is ugly and honest and reachable.
 *
 * It is the default rather than the only value because the word appears in the
 * URL: `/author/author` is the honest answer for a nameless account and
 * `/poem/author` is simply wrong, so the poems path passes `"poem"`. Both
 * functions take it, and a caller that overrides one must override the other —
 * see {@link slugPrefix}.
 */
const FALLBACK = "author";

/**
 * @param source the human string to derive from — a pen name, a poem's title
 * @param taken every existing slug that begins with the derived base, which the
 *   caller fetches with one indexed `startsWith` query
 * @param fallback the base to use when `source` transliterates to nothing
 */
export function uniqueSlug(
  source: string,
  taken: readonly string[],
  fallback: string = FALLBACK,
): string {
  const base = slugify(source) || fallback;
  const used = new Set(taken);

  if (!used.has(base)) {
    return base;
  }

  // Starts at 2, because the unsuffixed slug is conceptually the first. There
  // is no bound on the loop and it does not need one: it terminates as soon as
  // it passes the size of a finite set.
  let suffix = 2;

  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

/**
 * The base a caller queries `startsWith` against.
 *
 * Exported so the two steps cannot disagree: fetching the rows that begin with
 * one string and then suffixing a different one would look right and quietly
 * hand back a slug that is already taken. Which is also why `fallback` is on
 * both — passing it to one and not the other reintroduces exactly that bug, for
 * the one input where it bites.
 */
export function slugPrefix(source: string, fallback: string = FALLBACK): string {
  return slugify(source) || fallback;
}
