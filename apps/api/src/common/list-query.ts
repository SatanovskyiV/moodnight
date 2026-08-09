import type { ListDefinition, ListQueryValues } from "@moodnight/shared";

/**
 * Turns a parsed list query into the arguments a Prisma `findMany` and its
 * matching `count` take.
 *
 * This is the server half of the framework whose wire contract lives in
 * @moodnight/shared: the definition says which properties are searchable,
 * sortable and filterable, the schema there guarantees a request only names
 * those, and this turns what survived into SQL. Nothing here reads a field name
 * out of the request — every name comes from the definition — so no query
 * parameter can reach Postgres as a column it was not declared against.
 */

/**
 * The column every ordering falls back to.
 *
 * A sort that is not total is a paging bug, not an aesthetic one: rows with the
 * same `createdAt` — or the same name — have no fixed order between them, so
 * Postgres is free to return them differently for page 1 and page 2, and a row
 * can appear twice or not at all. Appending the primary key makes every
 * ordering total, and because ids here are UUIDv7 the tiebreak is itself
 * creation order rather than noise.
 *
 * Hard-coded rather than declared per list: every model in the roadmap's data
 * model has an `id`, and a list of something that does not would fail loudly on
 * an unknown column rather than quietly mis-paging. That is the day this
 * becomes an option on `defineList`.
 */
const TIEBREAK_FIELD = "id";

export interface PrismaListArgs<Where, OrderBy> {
  where: Where;
  orderBy: OrderBy[];
  skip: number;
  take: number;
}

/**
 * ```ts
 * const { where, orderBy, skip, take } = listArgs<
 *   Prisma.UserWhereInput,
 *   Prisma.UserOrderByWithRelationInput
 * >(userList, query);
 * ```
 *
 * The two type arguments are what tie a generic helper back to a specific
 * model: they are the types Prisma will check the call against, so a field that
 * cannot be ordered by — or a `where` shape Prisma does not accept — is a
 * compile error at the service, not a runtime rejection.
 *
 * `where` is returned even when it is empty, so the same object can be handed
 * to both the `findMany` and the `count` beside it and the two cannot drift.
 */
export function listArgs<Where, OrderBy>(
  definition: ListDefinition,
  query: ListQueryValues,
): PrismaListArgs<Where, OrderBy> {
  const where: Record<string, unknown> = {};

  // The filter values live under keys only the definition knows the names of,
  // which is precisely what `ListQueryValues` cannot describe. Reading them
  // through one widened view is the narrowest way to say that.
  const values = query as Record<string, unknown>;

  // Every term has to match something, and each may match a different column:
  // "леся укра" finds Леся Українка across `name` and `surname`, which a single
  // `contains` over the whole phrase never would. One term is the common case
  // and comes out as a plain OR over the searchable columns.
  //
  // `contains` is a leading-wildcard ILIKE, which no B-tree index can serve. It
  // is the right trade while these tables are small; a `pg_trgm` GIN index is
  // the answer when one of them is not.
  const terms = query.search?.split(/\s+/).filter(Boolean) ?? [];

  if (terms.length > 0) {
    where.AND = terms.map((term) => ({
      OR: definition.searchable.map((field) => ({
        [field]: { contains: term, mode: "insensitive" },
      })),
    }));
  }

  for (const field of definition.filterable) {
    const chosen = values[field];

    if (chosen !== undefined) {
      // Always `in`, even for a single value: Postgres plans `IN (x)` exactly
      // as it plans `= x`, and one shape means one thing to read and one thing
      // to assert against.
      where[field] = { in: chosen };
    }
  }

  const orderBy: Record<string, unknown>[] = [{ [query.sort]: query.order }];

  if (query.sort !== TIEBREAK_FIELD) {
    orderBy.push({ [TIEBREAK_FIELD]: query.order });
  }

  return {
    // The one cast in the framework, and it is here rather than at each call
    // site: these objects are built from names the definition supplies, so
    // their shape is known to be a valid filter for the model the caller names
    // in `Where` — but not to TypeScript, which watched them be assembled from
    // strings.
    where: where as Where,
    orderBy: orderBy as OrderBy[],
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  };
}

/**
 * Wraps the rows a page query returned in the envelope `pageSchema` describes.
 *
 * `total` is the count with the same `where` applied and no paging, which is
 * what makes it the number of matches rather than the number of rows returned.
 */
export function toPage<Row>(items: Row[], total: number, query: ListQueryValues) {
  return {
    items,
    total,
    page: query.page,
    perPage: query.perPage,
    // 0 for an empty result, not 1: a pager that renders "page 1 of 1" over
    // nothing is claiming there is a page to look at.
    pageCount: Math.ceil(total / query.perPage),
  };
}
