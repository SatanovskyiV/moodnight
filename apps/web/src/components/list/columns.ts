"use client";

import type { ListDefinition } from "@moodnight/shared";
import {
  columnFilteringFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type ColumnDefResolved,
} from "@tanstack/react-table";

/**
 * The three TanStack features every list on this site uses, and deliberately no
 * others.
 *
 * v9 makes feature registration explicit, and that is worth using rather than
 * working around: sorting state and its APIs simply do not exist until
 * `rowSortingFeature` is registered, so the bundle carries the parts of the
 * library this table actually has controls for and nothing else.
 *
 * **No row models.** `createSortedRowModel`, `createFilteredRowModel` and
 * `createPaginatedRowModel` are the client-side *processing*, and every one of
 * those jobs is done by Postgres before the rows arrive — see `listArgs` in
 * apps/api/src/common/list-query.ts. Registering the features without their
 * model slots is exactly what `manualSorting` / `manualFiltering` /
 * `manualPagination` mean, and it is the whole reason those options exist.
 *
 * `globalFilteringFeature` is absent although the search box looks like its job.
 * With `manualFiltering` it would do nothing but hold a string, and a string is
 * already held — in the URL, by ./query.ts, which is the only place a control on
 * this site lives. A feature registered to store what something else stores is a
 * second copy waiting to disagree with the first.
 */
export const listFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
});

export type ListFeatures = typeof listFeatures;

/**
 * Every row this framework handles has a string `id`, which is what
 * `getRowId` needs to keep React keys stable as pages turn. Every resource on
 * this API has one — `userSchema.id` is a UUIDv7 — so the constraint costs
 * nothing and buys the guarantee that page 2 never reuses page 1's DOM for a
 * different person.
 */
export type ListRow = { id: string };

export type ListColumns<Row extends ListRow> = ReadonlyArray<ColumnDef<ListFeatures, Row>>;

/**
 * A page's column helper, so each list gets `helper.accessor("name", …)` typed
 * against its own row.
 *
 * A thin wrapper over TanStack's, and it exists only so that no page has to name
 * {@link listFeatures} — which is the sort of import that gets copied wrong once
 * and then produces a table missing a feature for reasons nobody can see.
 */
export function listColumnHelper<Row extends ListRow>() {
  return createColumnHelper<ListFeatures, Row>();
}

/**
 * The class that hides a column below its breakpoint.
 *
 * A literal lookup and never a template, because Tailwind finds classes by
 * scanning source for whole strings — the trap components/session/hint.ts and
 * app/[locale]/welcome.tsx both already carry a note about. `table-cell` rather
 * than `block`, so a revealed cell goes back to being a cell.
 */
const REVEAL = {
  narrow: "hidden narrow:table-cell",
  compact: "hidden compact:table-cell",
} as const;

/** What a `<th>`/`<td>` pair wears, given the column's own `meta`. */
export function columnClass(
  meta: { hideBelow?: "narrow" | "compact"; align?: "end" } | undefined,
): string {
  const reveal = meta?.hideBelow ? REVEAL[meta.hideBelow] : "";
  const align = meta?.align === "end" ? "text-right" : "";

  return `${reveal} ${align}`.trim();
}

/**
 * A column's identity, the same way TanStack resolves it: an explicit `id`, or
 * the accessor key it was declared with.
 *
 * Needed because sortability is read off the *contract* rather than declared per
 * column, and the contract names properties. `ColumnDefResolved` is table-core's
 * own type for "a column def whose variant we do not care about", which is what
 * makes this a read rather than a cast.
 */
export function columnId<Row extends ListRow>(column: ColumnDef<ListFeatures, Row>): string {
  const resolved = column as ColumnDefResolved<ListFeatures, Row>;

  return resolved.id ?? String(resolved.accessorKey ?? "");
}

/**
 * Stamps `enableSorting` onto each column from the list's own declaration.
 *
 * **This is the client half of the one-declaration promise.** `userList.sortable`
 * decides what `GET /users` will order by; the same tuple decides which headers
 * are buttons. A page cannot offer a sort the endpoint would refuse, and cannot
 * forget to offer one it accepts, because neither is written down twice.
 *
 * Applied here rather than asked of each page for the same reason the page reset
 * lives inside `set` in ./query.ts: a rule that every caller must remember is a
 * rule that is eventually not remembered.
 */
export function sortableColumns<Row extends ListRow>(
  definition: ListDefinition,
  columns: ListColumns<Row>,
): ListColumns<Row> {
  const sortable = new Set<string>(definition.sortable);

  return columns.map((column) => ({ ...column, enableSorting: sortable.has(columnId(column)) }));
}
