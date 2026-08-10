import { defineList, listUsersQuerySchema, MAX_PER_PAGE, userList } from "@moodnight/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { listArgs, toPage } from "./list-query";

/**
 * The list framework, from a query string to the arguments Prisma receives.
 *
 * This is the file that matters most in this directory, because everything it
 * covers is about to be inherited: the poems list, the moderation queue and
 * every list after them are the same two pieces — a definition in
 * @moodnight/shared and this translation — so a bug here is a bug in all of
 * them at once.
 *
 * Two things are deliberately checked as *absences*: a property that was not
 * declared sortable cannot be sorted by, and a property that was not declared
 * filterable cannot be filtered on. Those are the framework's security
 * boundary, and a test that only exercised the declared fields would pass just
 * as happily against a version that accepted everything.
 *
 * Queries here are built by parsing, not by hand. A hand-written object could
 * carry a `sort` the schema would have rejected, and then this file would be
 * asserting the behaviour of a request that can never arrive.
 */
describe("the list framework", () => {
  /**
   * The two shapes a service names Prisma's own types for. Written loosely
   * here on purpose: this file is checking what the helper *builds*, and
   * borrowing `Prisma.UserWhereInput` would let a wrong-but-well-typed clause
   * pass unread.
   */
  type Where = { AND?: unknown[]; role?: unknown };
  type OrderBy = Record<string, "asc" | "desc">;

  const parse = (query: Record<string, unknown>) => listUsersQuerySchema.parse(query);
  const argsFor = (query: Record<string, unknown>) =>
    listArgs<Where, OrderBy>(userList, parse(query));

  describe("what a definition refuses to be", () => {
    const item = z.object({ id: z.string(), name: z.string(), sort: z.string() });

    // Filters are named after their property — `?role=ADMIN` — which is what
    // makes the URL readable and costs one shared namespace. A property called
    // `sort` would take the ordering parameter's name and silently disable it.
    it("refuses a filter that would shadow one of its own parameters", () => {
      expect(() =>
        defineList({
          item,
          searchable: ["name"],
          sortable: ["name"],
          filterable: ["sort"],
          defaultSort: "name",
          defaultOrder: "asc",
        }),
      ).toThrow(/cannot filter on "sort"/);
    });

    // Every list accepts `search`, so one that searches nothing would take the
    // parameter and ignore it — a client would read a full table as "nothing
    // was filtered out".
    it("refuses a list with nothing to search", () => {
      expect(() =>
        defineList({
          item,
          searchable: [],
          sortable: ["name"],
          filterable: [],
          defaultSort: "name",
          defaultOrder: "asc",
        }),
      ).toThrow(/at least one searchable/);
    });

    it("refuses a list with nothing to sort by", () => {
      expect(() =>
        defineList({
          item,
          searchable: ["name"],
          sortable: [],
          filterable: [],
          // `defaultSort` has nothing legal to be, which is the type error this
          // case cannot express and the throw is the runtime half of.
          defaultSort: "name" as never,
          defaultOrder: "asc",
        }),
      ).toThrow(/at least one sortable/);
    });

    // A relation filter shares the flat namespace with everything else, so it
    // can shadow a paging control exactly as a property filter can.
    it("refuses a relation filter that would shadow one of its own parameters", () => {
      expect(() =>
        defineList({
          item,
          searchable: ["name"],
          sortable: ["name"],
          filterable: [],
          related: { order: z.string() },
          defaultSort: "name",
          defaultOrder: "asc",
        }),
      ).toThrow(/cannot filter on "order"/);
    });

    /**
     * The quieter collision: both kinds build a parameter of the same name, the
     * second wins in the object literal, and the list answers as though the
     * first had never been declared. Nothing throws and nothing looks wrong.
     */
    it("refuses a name declared as both a property and a relation filter", () => {
      expect(() =>
        defineList({
          item,
          searchable: ["name"],
          sortable: ["name"],
          filterable: ["name"],
          related: { name: z.string() },
          defaultSort: "name",
          defaultOrder: "asc",
        }),
      ).toThrow(/both a property filter and a relation filter/);
    });
  });

  describe("the query a client may send", () => {
    it("fills in a first page, newest first, when nothing is asked for", () => {
      expect(parse({})).toEqual({
        page: 1,
        perPage: 20,
        sort: "createdAt",
        order: "desc",
      });
    });

    // Query strings are strings; the schema is what makes `?page=2` a number
    // rather than something the arithmetic below silently concatenates.
    it("reads the numbers out of the strings a query string is made of", () => {
      expect(parse({ page: "3", perPage: "50" })).toMatchObject({ page: 3, perPage: 50 });
    });

    /**
     * A table keeps its controls in the URL, and clearing a control writes
     * `?search=` rather than dropping the key. Reading that as a 400 would make
     * every client prune its own query string before sending it.
     */
    it("reads an empty parameter as an absent one", () => {
      expect(parse({ search: "", role: "", page: "", sort: "" })).toEqual({
        page: 1,
        perPage: 20,
        sort: "createdAt",
        order: "desc",
      });
    });

    // The same gesture as clearing the box, and answering the two differently
    // would put the difference between a 400 and a full table on whether a
    // space was left behind.
    it("reads a parameter holding only whitespace the same way", () => {
      expect(parse({ search: "   ", role: " ", sort: " " })).toEqual({
        page: 1,
        perPage: 20,
        sort: "createdAt",
        order: "desc",
      });
    });

    // A set of checkboxes serialises as several keys, and one of them arriving
    // empty says about that box what an empty parameter says about the filter.
    it("drops the blanks out of a repeated filter rather than refusing it", () => {
      expect(parse({ role: ["", "ADMIN", " "] })).toMatchObject({ role: ["ADMIN"] });
      // Undefined rather than an empty list, which as a `where` would be a
      // filter matching no rows at all instead of no filter.
      expect(parse({ role: ["", " "] }).role).toBeUndefined();
      expect(argsFor({ role: ["", " "] }).where).toEqual({});
    });

    it("takes a filter once or several times over", () => {
      expect(parse({ role: "ADMIN" })).toMatchObject({ role: ["ADMIN"] });
      expect(parse({ role: ["ADMIN", "EDITOR"] })).toMatchObject({ role: ["ADMIN", "EDITOR"] });
    });

    it("refuses a sort on a property the definition did not offer", () => {
      expect(() => parse({ sort: "passwordHash" })).toThrow();
      expect(() => parse({ sort: "tokenVersion" })).toThrow();
    });

    it("refuses a filter value outside the property's own schema", () => {
      expect(() => parse({ role: "SUPERUSER" })).toThrow();
    });

    // `perPage` is the one parameter that decides what a request costs. Refused
    // rather than clamped: a client told it received 1000 rows when it received
    // 100 will page straight past the other 900.
    it("refuses a page larger than the cap rather than quietly shrinking it", () => {
      expect(() => parse({ perPage: String(MAX_PER_PAGE + 1) })).toThrow();
      expect(parse({ perPage: String(MAX_PER_PAGE) })).toMatchObject({ perPage: MAX_PER_PAGE });
    });

    it("refuses a page before the first", () => {
      expect(() => parse({ page: "0" })).toThrow();
      expect(() => parse({ page: "-1" })).toThrow();
    });

    // Strict, like the write schemas: `?nmae=Леся` would otherwise come back
    // looking like a successful search over every row.
    it("refuses a parameter it does not recognise, naming it", () => {
      expect(() => parse({ nmae: "Леся" })).toThrow(/nmae/);
    });

    // The filter is a closed set of values, so a client that sends the column
    // name it wants filtered is still sending an unknown parameter.
    it("refuses a filter on a property that was not declared filterable", () => {
      expect(() => parse({ email: "poet@moodnight.dev" })).toThrow(/email/);
      expect(() => parse({ createdAt: "2026-01-01" })).toThrow(/createdAt/);
    });
  });

  describe("the search it becomes", () => {
    it("matches one term against every searchable property, case-insensitively", () => {
      expect(argsFor({ search: "леся" }).where).toEqual({
        AND: [
          {
            OR: [
              { name: { contains: "леся", mode: "insensitive" } },
              { surname: { contains: "леся", mode: "insensitive" } },
              { email: { contains: "леся", mode: "insensitive" } },
            ],
          },
        ],
      });
    });

    /**
     * The reason a search is split at all: "леся укра" is a first name and the
     * start of a surname, and no single `contains` over the whole phrase
     * matches a row where they live in two columns. Each term has to match
     * something; which column it matches is up to the term.
     */
    it("requires every term to match something, but not the same something", () => {
      const { where } = argsFor({ search: "леся укра" });

      expect(where.AND).toHaveLength(2);
      expect(where.AND).toEqual([
        { OR: expect.arrayContaining([{ name: { contains: "леся", mode: "insensitive" } }]) },
        { OR: expect.arrayContaining([{ name: { contains: "укра", mode: "insensitive" } }]) },
      ]);
    });

    // The schema trims, and runs of whitespace between terms are separators
    // rather than an empty term that would match every row.
    it("ignores the whitespace around and between terms", () => {
      expect(argsFor({ search: "  леся   укра  " }).where).toEqual(
        argsFor({ search: "леся укра" }).where,
      );
    });

    it("searches nothing when no term was sent", () => {
      expect(argsFor({}).where).toEqual({});
    });
  });

  describe("the filters it becomes", () => {
    it("accepts any of the values a repeated filter named", () => {
      expect(argsFor({ role: ["ADMIN", "EDITOR"] }).where).toEqual({
        role: { in: ["ADMIN", "EDITOR"] },
      });
    });

    // One shape whether one value was sent or five: Postgres plans `IN (x)`
    // exactly as it plans `= x`, and one shape is one thing to read.
    it("uses the same shape for a single value", () => {
      expect(argsFor({ role: "ADMIN" }).where).toEqual({ role: { in: ["ADMIN"] } });
    });

    it("combines a search and a filter rather than choosing between them", () => {
      const { where } = argsFor({ search: "леся", role: "ADMIN" });

      expect(where.role).toEqual({ in: ["ADMIN"] });
      expect(where.AND).toHaveLength(1);
    });
  });

  /**
   * A boolean filter is the one kind whose value cannot survive a query string
   * untouched, because a query string has only strings in it.
   *
   * The trap being avoided is `z.coerce.boolean()`, under which the string
   * `"false"` is truthy and `?featured=false` silently means the opposite of
   * what it says. A filter that inverts itself is worse than one that does not
   * exist, so the two words are converted by name and anything else is refused.
   */
  describe("a boolean filter", () => {
    const flagged = defineList({
      item: z.object({ id: z.string(), name: z.string(), featured: z.boolean() }),
      searchable: ["name"],
      sortable: ["name"],
      filterable: ["featured"],
      defaultSort: "name",
      defaultOrder: "asc",
    });

    const flaggedArgs = (query: Record<string, unknown>) =>
      listArgs<{ featured?: Record<string, unknown> }, OrderBy>(
        flagged,
        flagged.query.parse(query),
      );

    it('reads "true" and "false" as the booleans they name', () => {
      expect(flaggedArgs({ featured: "true" }).where).toEqual({ featured: { equals: true } });
      expect(flaggedArgs({ featured: "false" }).where).toEqual({ featured: { equals: false } });
    });

    // The whole point. Truthiness would make this `true` and the filter a lie.
    it('does not read "false" as true', () => {
      expect(flaggedArgs({ featured: "false" }).where).not.toEqual({ featured: { equals: true } });
    });

    /**
     * `equals` and not `in`, which is not a stylistic choice: Prisma's
     * `BoolFilter` offers only `equals` and `not`, so an `in` is a
     * `PrismaClientValidationError` that reaches the client as a 500.
     *
     * This shipped once. The endpoint's own spec agreed with the wrong shape
     * because the database is mocked, and only a real query found it — which is
     * why the poems spec now routes its expectations through Prisma's own
     * `PoemWhereInput` type.
     */
    it("never builds an `in` for a boolean, which Prisma would refuse", () => {
      expect(flagged.booleanFilters).toEqual(["featured"]);
      expect(flaggedArgs({ featured: "true" }).where.featured).not.toHaveProperty("in");
    });

    /**
     * Both values of a NOT NULL boolean is every row, so it narrows nothing and
     * becomes no clause. The alternative reading — a set holding both — is
     * exactly the shape there is no operator for.
     */
    it("drops a boolean filter that names both values", () => {
      expect(flaggedArgs({ featured: ["true", "false"] }).where).toEqual({});
    });

    it("refuses a word that is neither", () => {
      expect(() => flagged.query.parse({ featured: "yes" })).toThrow();
      expect(() => flagged.query.parse({ featured: "1" })).toThrow();
    });

    it("still reads an empty parameter as an absent one", () => {
      expect(flaggedArgs({ featured: "" }).where).toEqual({});
    });
  });

  /**
   * The server's own constraint — what makes one list framework serve both an
   * authenticated administration table and an anonymous public feed.
   *
   * Everything here is about the same property: `base` can only ever narrow.
   * There is no parameter that lifts it and no ordering of filters that escapes
   * it, because it is conjoined rather than merged into a key a filter could
   * overwrite.
   */
  describe("the base constraint", () => {
    const baseFor = (query: Record<string, unknown>, base?: Where) =>
      listArgs<Where, OrderBy>(userList, parse(query), { base });

    it("applies even when the query asks for nothing", () => {
      expect(baseFor({}, { role: "AUTHOR" }).where).toEqual({ AND: [{ role: "AUTHOR" }] });
    });

    it("is conjoined with a search rather than replacing it", () => {
      const { where } = baseFor({ search: "леся" }, { role: "AUTHOR" });

      expect(where.AND).toHaveLength(2);
      expect(where.AND?.[0]).toEqual({ role: "AUTHOR" });
    });

    /**
     * The security case, stated as an assertion.
     *
     * A client filtering on the same property the base constrains must not be
     * able to widen it. Both clauses survive — the base in the conjunction, the
     * filter as its own key — and Postgres ANDs them, so the answer is the
     * intersection and never the client's alone.
     */
    it("cannot be widened by a filter naming the same property", () => {
      const { where } = baseFor({ role: "ROOT" }, { role: "AUTHOR" });

      expect(where.AND).toEqual([{ role: "AUTHOR" }]);
      expect(where.role).toEqual({ in: ["ROOT"] });
    });

    // Absent by default, so every list that does not ask for one keeps handing
    // Prisma exactly what it handed before any of this existed.
    it("leaves the where untouched when there is none", () => {
      expect(baseFor({}).where).toEqual({});
    });
  });

  /**
   * Filters that address a *related* row — `?tag=`, `?author=` — whose meaning
   * in SQL is the server's half and cannot live in @moodnight/shared.
   */
  describe("relation filters", () => {
    const withRelations = defineList({
      item: z.object({ id: z.string(), title: z.string() }),
      searchable: ["title"],
      sortable: ["title"],
      filterable: [],
      related: { tag: z.string(), author: z.string() },
      defaultSort: "title",
      defaultOrder: "asc",
    });

    /**
     * Wider than the `Where` the rest of this file uses, because a relation
     * fragment is a shape the model's own columns do not contain — which is the
     * whole reason relation filters exist. The index signature is what lets one
     * type hold both `AND` and an arbitrary nested clause.
     */
    type RelatedWhere = { AND?: unknown[]; [clause: string]: unknown };

    const relations = {
      tag: (slugs: readonly string[]) => ({ tags: { some: { slug: { in: [...slugs] } } } }),
      author: (slugs: readonly string[]) => ({ author: { slug: { in: [...slugs] } } }),
    };

    const relatedArgs = (query: Record<string, unknown>) =>
      listArgs<RelatedWhere, OrderBy>(withRelations, withRelations.query.parse(query), {
        relations,
      });

    it("names the declared relations as ordinary query parameters", () => {
      expect(withRelations.related).toEqual(["tag", "author"]);
      expect(withRelations.query.parse({ tag: "nich" })).toMatchObject({ tag: ["nich"] });
    });

    it("turns each into the fragment the server supplied", () => {
      expect(relatedArgs({ author: "lesia-ukrainka" }).where).toEqual({
        AND: [{ author: { slug: { in: ["lesia-ukrainka"] } } }],
      });
    });

    // Repeated keys read as "any of these" — the reading a reader browsing
    // themes expects, and the only one that returns anything on a small archive.
    it("accepts a relation filter several times over", () => {
      expect(relatedArgs({ tag: ["nich", "sakralne"] }).where).toEqual({
        AND: [{ tags: { some: { slug: { in: ["nich", "sakralne"] } } } }],
      });
    });

    it("conjoins several relations rather than choosing between them", () => {
      expect(relatedArgs({ tag: "nich", author: "vasyl-stus" }).where.AND).toHaveLength(2);
    });

    it("adds nothing when the parameter was not sent", () => {
      expect(relatedArgs({}).where).toEqual({});
    });

    it("refuses a relation parameter the definition did not declare", () => {
      expect(() => withRelations.query.parse({ collection: "spaleni-lysty" })).toThrow(
        /collection/,
      );
    });

    /**
     * A declared relation with no mapping would be a parameter the schema
     * advertises, accepts, and then ignores — so `?tag=anything` would answer
     * with the unfiltered table and look like a successful filter. That is the
     * same silent falsehood strict parsing exists to prevent, and it earns the
     * same refusal.
     *
     * Checked whether or not this request used the filter, because the mistake
     * is a miswiring rather than a bad request: it should surface on the first
     * call to the endpoint, not on the first call that happens to pass `?tag=`.
     */
    it("refuses to run at all when a declared relation was never mapped", () => {
      const query = withRelations.query.parse({});
      const half = { tag: relations.tag };

      expect(() =>
        listArgs<RelatedWhere, OrderBy>(withRelations, query, { relations: half }),
      ).toThrow(/author/);
      expect(() => listArgs<RelatedWhere, OrderBy>(withRelations, query)).toThrow(
        /relation filter/,
      );
    });
  });

  describe("the order it becomes", () => {
    it("orders by the chosen property", () => {
      expect(argsFor({ sort: "surname", order: "asc" }).orderBy[0]).toEqual({ surname: "asc" });
    });

    /**
     * The bug this prevents is invisible in any single request: rows that tie
     * on the sorted column have no order between them, so Postgres may put the
     * same row on page 1 and page 2, or on neither. The primary key breaks
     * every tie, and in the same direction, so the sequence is one continuous
     * ordering rather than two.
     */
    it("always breaks ties by id, in the same direction", () => {
      expect(argsFor({ sort: "name", order: "asc" }).orderBy).toEqual([
        { name: "asc" },
        { id: "asc" },
      ]);
      expect(argsFor({ sort: "name", order: "desc" }).orderBy).toEqual([
        { name: "desc" },
        { id: "desc" },
      ]);
    });

    // Sorting by the tiebreak itself is already total; naming it twice would be
    // a second sort key Postgres has to be told to ignore.
    it("does not name the tiebreak twice when it is the sort", () => {
      const definition = defineList({
        item: z.object({ id: z.string(), name: z.string() }),
        searchable: ["name"],
        sortable: ["id", "name"],
        filterable: [],
        defaultSort: "id",
        defaultOrder: "asc",
      });

      const query = definition.query.parse({ sort: "id" });

      expect(listArgs(definition, query).orderBy).toEqual([{ id: "asc" }]);
    });
  });

  describe("the window it becomes", () => {
    it("skips the pages before the one asked for", () => {
      expect(argsFor({ page: "1", perPage: "20" })).toMatchObject({ skip: 0, take: 20 });
      expect(argsFor({ page: "2", perPage: "20" })).toMatchObject({ skip: 20, take: 20 });
      expect(argsFor({ page: "4", perPage: "25" })).toMatchObject({ skip: 75, take: 25 });
    });
  });

  describe("the envelope", () => {
    it("carries the paging back alongside the rows", () => {
      expect(toPage(["a", "b"], 42, parse({ page: "2", perPage: "20" }))).toEqual({
        items: ["a", "b"],
        total: 42,
        page: 2,
        perPage: 20,
        pageCount: 3,
      });
    });

    it("counts a partial last page as a page", () => {
      expect(toPage([], 21, parse({ perPage: "20" })).pageCount).toBe(2);
      expect(toPage([], 40, parse({ perPage: "20" })).pageCount).toBe(2);
      expect(toPage([], 0, parse({ perPage: "20" })).pageCount).toBe(0);
    });
  });
});
