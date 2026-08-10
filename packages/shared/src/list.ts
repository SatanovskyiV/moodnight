import { z } from "zod";

/**
 * The shape every list endpoint on this API takes: a page of rows, narrowed by
 * a search term and a set of filters, in a chosen order.
 *
 * One definition per resource declares *which of its properties* participate —
 * `defineList` below — and everything else follows from that declaration: the
 * query parameters the route accepts, what Swagger documents, what the
 * generated client offers, and (through `listArgs` in apps/api) the Prisma
 * `where` and `orderBy` the query becomes. A resource adds a list by naming
 * three field lists, and cannot accidentally expose a column to sorting or
 * filtering that it did not name.
 *
 * The field names are checked against the resource's own schema, so a renamed
 * column fails `tsc` here rather than becoming a query parameter that silently
 * matches nothing.
 *
 * Deliberately *not* a generic query language. There is no `?filter[name][gte]`,
 * no boolean expression tree, no `select`. Each of those is a way for a client
 * to write its own SQL through the URL, and the cost is paid by whoever has to
 * make it safe and indexable later. What is here covers the lists this site has
 * and the ones the roadmap names; the extension points are new *kinds* of
 * filter (a range, a relation), added here once and inherited by every list.
 */

/**
 * How many rows a list answers with when the client does not say, and the most
 * it will hand over at once.
 *
 * The cap is not politeness. `perPage` is the single parameter that decides
 * what a request costs, and an uncapped one lets any caller ask for the whole
 * table from a function that bills by the millisecond. Asking for more than the
 * cap is a 400 rather than something quietly clamped — a client that believes
 * it received 1000 rows and received 100 will page straight past the rest.
 */
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

/**
 * Long enough for a full name and an email address, short enough to bound the
 * query it turns into: a search is split on whitespace and each term costs one
 * `ILIKE` per searchable column.
 *
 * Exported because a search box has to enforce it too. Without a `maxLength` on
 * the input the 101st character is dropped by this schema on the way past, and
 * what the reader sees is a search that silently stops responding to typing.
 */
export const MAX_SEARCH_LENGTH = 100;

/**
 * The parameter names the framework itself owns.
 *
 * Filters are named after the property they filter — `?role=ADMIN`, not
 * `?filter[role]=ADMIN` — which is what makes a URL readable and a client
 * simple. The price is one namespace shared between filters and the paging
 * controls, so a resource with a property called `sort` or `page` would
 * silently shadow one of them. {@link defineList} refuses such a definition at
 * import time, which is before any test runs and long before a request arrives.
 */
const RESERVED_PARAMS: readonly string[] = ["page", "perPage", "search", "sort", "order"];

export const sortOrderSchema = z.enum(["asc", "desc"]).meta({
  description: "Which direction to sort in.",
  example: "asc",
});

export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * Whether a parameter carries nothing: missing, empty, or only whitespace.
 *
 * Whitespace counts because `?search=` and `?search=%20` are the same gesture —
 * a control that has been cleared — and answering them differently would put
 * the difference between a 400 and a full table on whether an input happened to
 * hold a space.
 */
function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/**
 * Reads a blank parameter as an absent one.
 *
 * A table's controls belong in the URL, and a UI that binds a control to a
 * query parameter writes `?search=&role=` the moment the user clears them
 * rather than dropping the keys. Without this, clearing a filter is a 400 — the
 * schema is asked to read `""` as an enum member or a number — and every client
 * has to remember to prune its own query string.
 *
 * `z.preprocess` and not `.transform()`: a transform cannot be represented in
 * JSON Schema and would take the whole OpenAPI document down with it, while a
 * preprocess documents as the schema it wraps.
 */
function emptyAsAbsent<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (isBlank(value) ? undefined : value), schema);
}

/**
 * A filter that accepts one value or several: `?role=ADMIN` and
 * `?role=ADMIN&role=EDITOR` both arrive as a list, so the code reading them
 * never has to ask which form was sent.
 *
 * Repeated keys rather than `?role=ADMIN,EDITOR`, because that is what OpenAPI
 * means by a `form`-style query parameter and therefore what the generated
 * client emits with no configuration — and what Express's query parser already
 * hands over as an array.
 *
 * Blank values are dropped one by one rather than only when the whole parameter
 * is blank: a set of checkboxes serialises as several keys, and one of them
 * being empty says the same thing about that box as an empty parameter says
 * about the filter. Dropping them all leaves nothing to filter on, which is the
 * absent filter rather than an empty list that would match no rows at all.
 */
function filterParam<Value extends z.ZodType>(value: Value) {
  const booleans = value instanceof z.ZodBoolean;

  return z.preprocess((raw) => {
    const chosen = (Array.isArray(raw) ? raw : [raw]).filter((one) => !isBlank(one));

    return chosen.length > 0 ? (booleans ? chosen.map(asBoolean) : chosen) : undefined;
  }, z.array(value).min(1).optional());
}

/**
 * `"true"` and `"false"` as the booleans they name.
 *
 * A query string has only strings in it, so a boolean filter needs converting
 * before its schema sees it — and `z.coerce.boolean()` is precisely the wrong
 * tool: it applies JavaScript truthiness, under which the string `"false"` is
 * `true`. A filter that quietly inverts itself is worse than one that does not
 * exist, so anything other than the two words is passed through untouched for
 * `z.boolean()` to reject with a 400 naming the parameter.
 */
function asBoolean(raw: unknown): unknown {
  if (raw === "true") {
    return true;
  }

  return raw === "false" ? false : raw;
}

/**
 * One page of rows, and enough about the whole result to build a pager from.
 *
 * `total` is the count *after* the search and filters are applied, which is the
 * number a client needs to render "137 users" or decide there is a next page.
 * `pageCount` is derivable from it, and is here so that every consumer does not
 * redo the same ceiling division — and get it wrong for an empty table, where
 * the answer is 0 pages rather than 1.
 *
 * A `page` past the end is not an error: it answers with an empty `items` and
 * the true `total`, which is what a client that deletes the last row of the
 * last page should see rather than a 404.
 */
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item).meta({ description: "The rows on this page." }),
    total: z.number().int().nonnegative().meta({
      description: "How many rows match the search and filters, across all pages.",
      example: 137,
    }),
    page: z.number().int().positive().meta({
      description: "Which page this is, counting from 1.",
      example: 1,
    }),
    perPage: z.number().int().positive().meta({
      description: "How many rows a full page holds.",
      example: DEFAULT_PER_PAGE,
    }),
    pageCount: z.number().int().nonnegative().meta({
      description: "How many pages `total` divides into. 0 when nothing matches.",
      example: 7,
    }),
  });
}

/**
 * The paging and ordering parameters every list query carries, whatever the
 * resource. Filters are the part that differs, so they are not named here —
 * whoever needs them (`listArgs` in apps/api) takes the definition alongside
 * and reads the filter fields out of it by name.
 *
 * A `type` and deliberately not an `interface`: TypeScript gives an object type
 * alias an implicit index signature and an interface none, and that is what
 * lets a reader widen a parsed query to `Record<string, unknown>` to reach
 * those filter fields. Tidying this into an interface breaks that call site.
 */
export type ListQueryValues = {
  page: number;
  perPage: number;
  search?: string;
  sort: string;
  order: SortOrder;
};

/**
 * A list definition as its consumers see it, with the field names widened to
 * strings. `defineList` returns something more precise; this is what a helper
 * that works for *any* list accepts.
 */
export interface ListDefinition {
  readonly searchable: readonly string[];
  readonly sortable: readonly string[];
  readonly filterable: readonly string[];
  /**
   * Which of `filterable` hold booleans.
   *
   * Named separately because booleans are the one type that cannot be filtered
   * with a set. Every other column takes `IN (…)`, and a boolean does not —
   * Prisma's `BoolFilter` offers only `equals` and `not`, since "true or false"
   * over a NOT NULL column is a tautology rather than a filter. `listArgs` reads
   * this to pick the operator instead of inspecting the runtime type of a value.
   */
  readonly booleanFilters: readonly string[];
  /**
   * Filters that address a *related* row rather than a column of this one —
   * `?tag=melankholiia`. Named here only; what each one means in SQL is the
   * server's half, supplied to `listArgs` in apps/api, because a Prisma `where`
   * fragment is not something this package is allowed to know about.
   */
  readonly related: readonly string[];
  readonly query: z.ZodType;
  readonly page: z.ZodType;
}

/**
 * Every filter, as a parameter accepting one or more of that property's values.
 *
 * Declared as a `ZodOptional` because that is what the schema *behaves* as —
 * the key may be absent, and zod reads optionality out of this type when it
 * infers the parsed query. The runtime value is the `ZodPipe` that
 * {@link filterParam} builds around one, which is why assigning the two needs
 * the cast in `defineList` rather than being checked structurally.
 */
type FilterFields<
  Item extends z.ZodObject,
  Filterable extends readonly (keyof Item["shape"] & string)[],
> = {
  [Field in Filterable[number]]: z.ZodOptional<
    z.ZodType<z.output<Item["shape"][Field]>[], unknown>
  >;
};

/**
 * Declares which of a resource's properties a client may search, sort and
 * filter by, and builds the query schema and the page schema from that.
 *
 * ```ts
 * export const userList = defineList({
 *   item: userSchema,
 *   searchable: ["name", "surname", "email"],
 *   sortable: ["name", "surname", "email", "role", "createdAt"],
 *   filterable: ["role"],
 *   defaultSort: "createdAt",
 *   defaultOrder: "desc",
 * });
 * ```
 *
 * All three lists are required and none of them has a default. A property that
 * is not named is not sortable, not filterable and not searched — the omission
 * is the security boundary, and a default would put it somewhere other than at
 * the definition where it can be read.
 *
 * A filter's accepted values come from the property's own schema on `item`, so
 * `?role=` is checked against exactly the roles a user may hold. There is no
 * second list of valid values to fall out of step with the first, and a new
 * role is filterable the day it is added to the enum.
 */
export function defineList<
  Item extends z.ZodObject,
  const Searchable extends readonly (keyof Item["shape"] & string)[],
  const Sortable extends readonly (keyof Item["shape"] & string)[],
  const Filterable extends readonly (keyof Item["shape"] & string)[],
  const Related extends Record<string, z.ZodType<string>> = Record<never, never>,
>(config: {
  /** The schema of one row. Field names below are checked against it. */
  item: Item;
  /** Matched against, case-insensitively, by the single `search` parameter. */
  searchable: Searchable;
  /** Offered as `?sort=`. Must name at least one property. */
  sortable: Sortable;
  /** Each becomes a query parameter of its own name, taking its own values. */
  filterable: Filterable;
  /**
   * Filters that narrow by a *related* row: `?tag=` and `?author=` on the poem
   * list, neither of which is a column on a poem.
   *
   * Unlike `filterable`, these are not checked against `item` — the whole point
   * is that they address something the row only points at — so each names its
   * own value schema. That schema must produce a **string**, because a relation
   * filter identifies rows by a natural key and on this site those are slugs.
   * The day one needs to take a number is the day this constraint is widened,
   * deliberately, rather than by an accident of inference.
   *
   * A relation filter is only half a definition: the other half is the Prisma
   * fragment it becomes, which lives beside `listArgs` in apps/api because
   * nothing in this package may import Prisma. `listArgs` refuses at runtime to
   * run a query whose definition declares a relation the caller did not map —
   * an unapplied filter would answer `?tag=whatever` with every row, which is
   * the same silent falsehood strict parsing exists to prevent.
   */
  related?: Related;
  /** Applied when the client does not choose. Must be one of `sortable`. */
  defaultSort: Sortable[number];
  defaultOrder: SortOrder;
}) {
  const { item, searchable, sortable, filterable, related, defaultSort, defaultOrder } = config;

  if (sortable.length === 0) {
    throw new Error("A list needs at least one sortable property to order its pages by.");
  }

  // Every list accepts `search`, so a list that searches nothing would accept
  // the parameter and quietly ignore it — a client would see a full table and
  // read it as "no filtering happened to apply". Refusing the definition is how
  // that stays impossible. A list that genuinely should not be searchable is a
  // reason to make the parameter conditional here, and this is where that need
  // announces itself rather than reaching a caller as a silent no-op.
  if (searchable.length === 0) {
    throw new Error("A list needs at least one searchable property, or `search` would do nothing.");
  }

  const relations: Record<string, z.ZodType<string>> = related ?? {};
  const relatedNames = Object.keys(relations);

  for (const field of [...filterable, ...relatedNames]) {
    if (RESERVED_PARAMS.includes(field)) {
      throw new Error(
        `A list cannot filter on "${field}": that is one of the framework's own query ` +
          `parameters (${RESERVED_PARAMS.join(", ")}), and the filter would shadow it.`,
      );
    }
  }

  // The two kinds of filter share one namespace with each other as well as with
  // the paging controls, and a collision here is quieter than a reserved-word
  // one: both would build a parameter of the same name, the second would win in
  // the object literal, and the list would answer as though the first had never
  // been declared.
  for (const name of relatedNames) {
    if (filterable.includes(name)) {
      throw new Error(
        `A list cannot declare "${name}" as both a property filter and a relation filter: ` +
          "they would be the same query parameter.",
      );
    }
  }

  // Same cast, and the same reason, as `filterFields` below: the keys are built
  // from data, and only a human can say the pipe `filterParam` returns behaves
  // as the optional this claims.
  const relatedFields = Object.fromEntries(
    Object.entries(relations).map(([name, value]) => [name, filterParam(value)]),
  ) as unknown as { [Name in keyof Related & string]: z.ZodOptional<z.ZodType<string[], unknown>> };

  const filterFields = Object.fromEntries(
    filterable.map((field) => [field, filterParam(item.shape[field])]),
    // `Object.fromEntries` erases the keys it was handed, and this is the one
    // place the framework's shape is built from data rather than written out.
    // Everything downstream — the parsed query's type, the documented
    // parameters, what a caller reads off a filter — flows from this
    // annotation, so it is worth the two steps: zod's pipe internals do not
    // overlap structurally with the optional it wraps, and TypeScript is right
    // that only a human can say the two describe the same behaviour.
  ) as unknown as FilterFields<Item, Filterable>;

  const query = z
    .object({
      page: emptyAsAbsent(
        z.coerce
          .number()
          .int()
          .min(1)
          .default(1)
          .meta({ description: "Which page to return, counting from 1." }),
      ),
      perPage: emptyAsAbsent(
        z.coerce
          .number()
          .int()
          .min(1)
          .max(MAX_PER_PAGE)
          .default(DEFAULT_PER_PAGE)
          .meta({ description: `How many rows to return. At most ${MAX_PER_PAGE}.` }),
      ),
      search: emptyAsAbsent(
        z
          .string()
          .trim()
          .min(1)
          .max(MAX_SEARCH_LENGTH)
          .meta({
            description:
              `Matched against ${searchable.join(", ")}, case-insensitively. ` +
              "Whitespace separates terms and every term has to match one of them.",
          })
          .optional(),
      ),
      sort: emptyAsAbsent(
        z.enum(sortable).default(defaultSort).meta({ description: "Which property to order by." }),
      ),
      order: emptyAsAbsent(sortOrderSchema.default(defaultOrder)),
      ...filterFields,
      ...relatedFields,
    })
    // Strict, for the same reason the write schemas are: `?nmae=Леся` is a
    // request that would otherwise come back looking like a successful search
    // over every row, and the client would have no way to tell. An unknown
    // parameter is a 400 naming the key.
    .strict();

  return {
    searchable,
    sortable,
    filterable,
    booleanFilters: filterable.filter((field) => item.shape[field] instanceof z.ZodBoolean),
    // Widened to `string[]` by `Object.keys`, which is all any consumer needs:
    // `listArgs` looks each name up in the map the server supplies, and the
    // OpenAPI document reads the parameters off `query` rather than from here.
    related: relatedNames,
    query,
    page: pageSchema(item),
  } as const;
}
