import type { ListDefinition, ListQueryValues } from "@moodnight/shared";
import type { z } from "zod";

/**
 * A list's controls as they cross the address bar, and the two pure functions
 * that read and write them.
 *
 * The whole of the client half of the framework in packages/shared/src/list.ts
 * is one observation: `definition.query` is **a zod schema that also runs in a
 * browser**. Handing it the query string gives us, provably identically to the
 * server, the coercion, the `min`/`max` bounds, the blank-is-absent rule, the
 * enum check on `sort`, `order` and every filter — and the one thing nothing
 * else can supply, the defaults. `defineList` does not return `defaultSort` or
 * `defaultOrder`; they exist only baked into `query`, so `query.parse({})` is
 * the only way a client can learn that users are listed newest-first.
 *
 * Two properties fall out of that, and they are the reason for the arrangement
 * rather than pleasant surprises:
 *
 * - **A hand-edited URL cannot produce a 400.** `?perPage=500` fails `max(100)`,
 *   `?sort=passwordHash` fails the enum, and an unrecognised key is never
 *   forwarded because the reader only picks up keys the definition names. The
 *   `.strict()` rejection is unreachable from this UI.
 * - **The query key is canonical.** What comes out is always fully defaulted, so
 *   `/admin/users` and `/admin/users?page=1&order=desc` are one cache entry
 *   rather than two requests for the same rows.
 *
 * No React and no router in this file, deliberately — it imports nothing at
 * runtime at all. The hook that drives it is ./query.ts; keeping the part that
 * is only a function separate from the part that is only plumbing is what lets
 * this be reasoned about, and run, on its own.
 */

/**
 * The five parameter names the framework owns.
 *
 * `satisfies` against `ListQueryValues` is what makes the list honest: it
 * requires a key for every parameter the shared type declares and rejects one it
 * does not, so renaming `perPage` over there fails typecheck here instead of
 * leaving a control this reader silently stops carrying.
 */
const RESERVED = {
  page: true,
  perPage: true,
  search: true,
  sort: true,
  order: true,
} as const satisfies Record<keyof ListQueryValues, true>;

export const RESERVED_NAMES = Object.keys(RESERVED) as (keyof ListQueryValues)[];

/** What one list's parsed query looks like — its five controls plus its filters. */
export type ListValues<Definition extends ListDefinition> = z.output<Definition["query"]>;

export type ListPatch<Definition extends ListDefinition> = Partial<ListValues<Definition>>;

/**
 * Reads a query string into one list's values.
 *
 * Nothing is pruned before parsing: `URLSearchParams.get` answers `null` for a
 * key that is not there, and `emptyAsAbsent` in the shared schema already reads
 * `null`, `""` and `"   "` as absent. The two halves were written to meet here.
 */
export function readList<Definition extends ListDefinition>(
  definition: Definition,
  params: URLSearchParams,
): ListValues<Definition> {
  const candidate: Record<string, unknown> = {};

  for (const name of RESERVED_NAMES) {
    candidate[name] = params.get(name);
  }

  // `getAll`, because a filter is repeated rather than comma-joined —
  // `?role=ADMIN&role=EDITOR` is what OpenAPI's `form` style means and what the
  // generated client emits.
  for (const field of definition.filterable) {
    candidate[field] = params.getAll(field);
  }

  const parsed = definition.query.safeParse(candidate);

  if (parsed.success) {
    return parsed.data as ListValues<Definition>;
  }

  // A URL that is wrong in one place loses that place and not the rest: drop
  // exactly the keys zod complained about and read again, so
  // `?sort=nonsense&search=леся` still searches. Only if that fails too does
  // everything go.
  for (const issue of parsed.error.issues) {
    const [key] = issue.path;

    if (typeof key === "string") {
      delete candidate[key];
    }
  }

  const retried = definition.query.safeParse(candidate);

  return (retried.success ? retried.data : definition.query.parse({})) as ListValues<Definition>;
}

/**
 * Writes one list's values back out, omitting everything that equals its default.
 *
 * That is what keeps `/uk/admin/users` bare on arrival and growing only what the
 * reader actually chose. The endpoint's tolerance of empty parameters is the
 * safety net under a hand-edited URL, not the thing this leans on.
 *
 * Written by hand rather than through next-intl's `{ pathname, query }` object
 * form, because a filter is a repeated key and that is the one serialisation an
 * object cannot express. Reserved names go first and in their declared order, so
 * the same state always produces the same link — which matters as soon as anyone
 * compares two of them.
 */
export function writeList<Definition extends ListDefinition>(
  definition: Definition,
  values: ListValues<Definition>,
  defaults: ListValues<Definition>,
): string {
  const search = new URLSearchParams();
  const chosen = values as Record<string, unknown>;
  const fallback = defaults as Record<string, unknown>;

  for (const name of RESERVED_NAMES) {
    const value = chosen[name];

    if (value !== undefined && value !== fallback[name]) {
      search.set(name, String(value));
    }
  }

  for (const field of definition.filterable) {
    const value = chosen[field];

    // A filter's default is absence, so anything non-empty is worth writing.
    if (Array.isArray(value)) {
      for (const one of value) {
        search.append(field, String(one));
      }
    }
  }

  return search.toString();
}
