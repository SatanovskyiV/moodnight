"use client";

import type { ListDefinition } from "@moodnight/shared";
import {
  useTable,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo } from "react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  columnClass,
  listFeatures,
  sortableColumns,
  type ListColumns,
  type ListRow,
} from "./columns";
import type { ListQuery } from "./query";
import type { ListPatch } from "./wire";

/**
 * A module-level empty array, so that a page still loading does not hand
 * `useTable` a fresh `[]` on every render and invalidate every data-dependent
 * model with it. TanStack's own getting-started guide names this as the mistake
 * to avoid; it is cheap to not make.
 */
const NO_ROWS: never[] = [];

/**
 * TanStack hands a change either as a value or as an updater over the previous
 * one, and treating the second as the first is the classic manual-mode bug: the
 * state quietly stops moving and it reads as a click that did not register.
 *
 * Module scope rather than inside the hook, so the handlers below close over
 * nothing they would then have to declare as a dependency.
 */
function resolve<Value>(next: Updater<Value>, current: Value): Value {
  return typeof next === "function" ? (next as (old: Value) => Value)(current) : next;
}

export type ListPage<Row> = {
  items: Row[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

/**
 * Builds the table instance from the URL's controls.
 *
 * Everything is manual, because Postgres has already sorted, filtered and cut
 * the page before these rows existed in the browser. What TanStack is doing here
 * is the part that is genuinely fiddly and genuinely generic: header groups,
 * the sort-direction cycle, `getCanNextPage` at the boundaries, and the
 * bookkeeping that turns a click on a header into a new state.
 *
 * The two representations are converted in exactly this file, so that ./query.ts
 * stays a contract layer with no idea TanStack exists and the pages stay unaware
 * of both. There are two conversions and both are off-by-one traps:
 *
 * - `SortingState` is a list of `{ id, desc }`; the wire is one `sort` and one
 *   `order`. Single-sort only, because `?sort=` takes one property.
 * - `PaginationState` counts pages from 0; the API counts from 1.
 */
export function useListTable<Row extends ListRow>({
  definition,
  columns,
  query,
  page,
}: {
  definition: ListDefinition;
  columns: ListColumns<Row>;
  query: ListQuery<ListDefinition>;
  page: ListPage<Row> | undefined;
}) {
  const { params, set, filter } = query;
  const values = params as Record<string, unknown>;

  const sorted = useMemo(() => sortableColumns(definition, columns), [definition, columns]);

  const sorting = useMemo<SortingState>(
    () => [{ id: String(values.sort), desc: values.order === "desc" }],
    [values.sort, values.order],
  );

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: Number(values.page) - 1, pageSize: Number(values.perPage) }),
    [values.page, values.perPage],
  );

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      definition.filterable
        .map((field) => ({ id: field, value: filter(field) }))
        .filter((one) => one.value.length > 0),
    [definition, filter],
  );

  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (next) => {
      const [first] = resolve(next, sorting);

      // `enableSortingRemoval: false` below means the cycle never empties, so
      // this is defensive rather than reachable — and the honest answer if it
      // ever is reached is to leave the order alone rather than send `?sort=`.
      if (!first) {
        return;
      }

      set({ sort: first.id, order: first.desc ? "desc" : "asc" });
    },
    [set, sorting],
  );

  const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
    (next) => {
      const { pageIndex, pageSize } = resolve(next, pagination);

      // Both in one write, because changing the page size while on page 4 is one
      // gesture with one answer — `set` sends it back to page 1 on its own,
      // since the patch touches something other than the page.
      if (pageSize !== pagination.pageSize) {
        set({ perPage: pageSize });
        return;
      }

      set({ page: pageIndex + 1 });
    },
    [set, pagination],
  );

  const onColumnFiltersChange = useCallback<OnChangeFn<ColumnFiltersState>>(
    (next) => {
      const resolved = resolve(next, columnFilters);

      // One `set` for every filter at once, and not `setFilter` per field in a
      // loop. Each write is built from the `params` this render closed over, so
      // a second one would be composed against the state before the first — and
      // the last filter to be written would be the only one that stuck. Users
      // has a single filter and would never have shown it; the list after it
      // would have.
      const patch: Record<string, unknown> = {};

      for (const field of definition.filterable) {
        const chosen = resolved.find((one) => one.id === field)?.value;
        const values = Array.isArray(chosen) ? chosen.map(String) : [];

        patch[field] = values.length > 0 ? values : undefined;
      }

      set(patch as ListPatch<ListDefinition>);
    },
    [definition, set, columnFilters],
  );

  return useTable({
    features: listFeatures,
    columns: sorted,
    data: page?.items ?? NO_ROWS,
    // Stable keys across a page turn. Without it a row is keyed by its index and
    // React reuses the second person's `<tr>` for the seventh.
    getRowId: (row) => row.id,
    // `pageCount` is the API's own, which is 0 when nothing matches rather than
    // 1 — so `getCanNextPage()` is right on an empty result without arithmetic
    // here. `rowCount` rides along for anything that asks.
    pageCount: page?.pageCount ?? 0,
    rowCount: page?.total ?? 0,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    // The wire takes one `sort`, so a shift-click must not be able to ask for
    // two — and it always takes one, so the cycle is asc ⇄ desc with no third
    // state that would have to mean "whatever the server likes".
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: { sorting, pagination, columnFilters },
    onSortingChange,
    onPaginationChange,
    onColumnFiltersChange,
  });
}

/**
 * The table itself: a scrollable region, one header row, and the rows.
 *
 * The scroll box is `role="region"` and focusable on purpose. A table wider than
 * the viewport is a scroll container, and a scroll container that cannot be
 * reached by keyboard is content a keyboard reader cannot get to at all — this
 * is the one a11y affordance that has to be added by hand rather than inherited
 * from the markup.
 */
export function ListTable<Row extends ListRow>({
  table,
  caption,
  dimmed,
}: {
  table: ReturnType<typeof useListTable<Row>>;
  caption: string;
  dimmed: boolean;
}) {
  const t = useTranslations("list");
  // `useId` rather than a constant: two lists on one page would otherwise both
  // claim `#list-caption`, and `aria-labelledby` would resolve to whichever came
  // first for both of them.
  const captionId = useId();

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="border-primary/15 focus-visible:outline-ring border focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Table className="min-w-[34rem]">
        {/* The accessible name of the region and of the table both. Not shown,
            because the page's own <h1> already says it in full and a visible
            repeat two lines below it would only be furniture. */}
        <TableCaption id={captionId} className="sr-only">
          {caption}
        </TableCaption>

        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent hover:bg-none">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();

                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    // Only the column actually ordering the table carries
                    // `aria-sort`. An explicit "none" on the other four is
                    // permitted and is four extra announcements per header row
                    // for one fact — which column, and it is this one.
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                    }
                    className={columnClass(header.column.columnDef.meta)}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="text-parchment-faint hover:text-primary focus-visible:text-primary focus-visible:outline-ring group/sort inline-flex cursor-pointer items-center gap-2 uppercase transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <table.FlexRender header={header} />

                        {/* Direction only, never "sortable or not" — that is
                            what the pointer and the focus ring already say. The
                            neutral glyph is dimmer than the active one so a
                            column that is ordering the table reads at a glance. */}
                        <span
                          aria-hidden="true"
                          className={
                            sorted
                              ? "text-primary"
                              : "text-primary-deep group-hover/sort:text-primary/70 opacity-0 transition-opacity group-hover/sort:opacity-100"
                          }
                        >
                          {sorted === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5" />
                          )}
                        </span>
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        {/* Dimmed rather than replaced while a new page is in flight. With
            `keepPreviousData` the rows on screen are the last real answer, and
            the honest thing to show is that they are being replaced — not to
            throw them away and collapse the table to its header. */}
        <TableBody
          className={dimmed ? "opacity-60 transition-opacity duration-200" : "transition-opacity"}
          aria-busy={dimmed || undefined}
        >
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={columnClass(cell.column.columnDef.meta)}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <span className="sr-only" role="status" aria-live="polite">
        {dimmed ? t("loading") : ""}
      </span>
    </div>
  );
}
