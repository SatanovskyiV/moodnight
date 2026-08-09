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
