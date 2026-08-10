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
 * What a relation filter means in SQL — the server half of a `related` entry on
 * a list definition.
 *
 * `?tag=melankholiia&tag=sakralne` arrives here as the two slugs, and this
 * returns the fragment that narrows to poems carrying one of them. The values
 * are strings because @moodnight/shared only accepts string-valued relation
 * filters; the note on `defineList`'s `related` says why.
 */
export type RelationFilter<Where> = (chosen: readonly string[]) => Where;

export interface ListArgsOptions<Where> {
  /**
   * A constraint the *server* imposes, which no query parameter can lift.
   *
   * This is what makes a public list safe to expose over the same machinery an
   * administrative one uses: `GET /poems` passes `{ status: "PUBLISHED" }`, and
   * because it is AND-ed with whatever the client asked for, a request can only
   * ever narrow the set further. There is no parameter that widens it, and no
   * ordering of filters that escapes it — the alternative, remembering to merge
   * a status check into each service method, is the kind of thing that holds
   * until the day somebody adds a sixth endpoint.
   */
  base?: Where;
  /**
   * One entry per name in the definition's `related`, keyed the same way.
   *
   * Every declared relation must appear: {@link listArgs} throws otherwise,
   * because a filter the schema advertises and the query ignores would answer
   * `?tag=anything` with the unfiltered table. That is the same silent
   * falsehood strict parsing exists to prevent, and it deserves the same
   * refusal rather than a page of wrong rows.
   */
  relations?: Record<string, RelationFilter<Where>>;
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
  options: ListArgsOptions<Where> = {},
): PrismaListArgs<Where, OrderBy> {
  const where: Record<string, unknown> = {};

  // Everything that cannot be a plain top-level key, in one conjunction: the
  // server's base constraint, the search terms, and the relation filters. They
  // share this array rather than each claiming a property because two of them
  // can name the same relation — `?tag=` and a base clause about tags would
  // collide on one `tags` key and the second would silently replace the first.
  const and: unknown[] = [];

  if (options.base !== undefined) {
    and.push(options.base);
  }

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

  for (const term of terms) {
    and.push({
      OR: definition.searchable.map((field) => ({
        [field]: { contains: term, mode: "insensitive" },
      })),
    });
  }

  for (const field of definition.filterable) {
    const chosen = values[field];

    if (chosen === undefined) {
      continue;
    }

    if (definition.booleanFilters.includes(field)) {
      /**
       * Booleans are the one type that cannot be filtered with a set. Prisma's
       * `BoolFilter` has no `in` — only `equals` and `not` — and sending one
       * anyway is a `PrismaClientValidationError`, which reaches the client as
       * a 500 rather than as anything it could act on.
       *
       * A repeated boolean parameter is not an error, though: `?featured=true&
       * featured=false` names both values a NOT NULL column can hold, so it
       * constrains nothing and the right translation is no clause at all. Only
       * a filter that actually narrows becomes SQL.
       */
      const distinct = [...new Set(chosen as unknown[])];

      if (distinct.length === 1) {
        where[field] = { equals: distinct[0] };
      }

      continue;
    }

    // `in` for everything else, even a single value: Postgres plans `IN (x)`
    // exactly as it plans `= x`, and one shape means one thing to read and one
    // thing to assert against.
    where[field] = { in: chosen };
  }

  for (const name of definition.related) {
    const toFragment = options.relations?.[name];

    // Checked whether or not this request used the filter. The mistake being
    // caught is a miswiring, not a bad request, so it should surface on the
    // first call to the endpoint rather than on the first call that happens to
    // pass `?tag=`.
    if (!toFragment) {
      throw new Error(
        `The list declares a relation filter "${name}" but no mapping for it was supplied. ` +
          "Add one to the `relations` option, or the parameter would be accepted and ignored.",
      );
    }

    const chosen = values[name];

    if (chosen !== undefined) {
      and.push(toFragment(chosen as readonly string[]));
    }
  }

  // Left off entirely when there is nothing to conjoin, so an unfiltered list
  // still hands Prisma the `{}` it handed before any of this existed.
  if (and.length > 0) {
    where.AND = and;
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
