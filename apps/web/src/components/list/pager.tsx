"use client";

import { DEFAULT_PER_PAGE, MAX_PER_PAGE } from "@moodnight/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ListRow } from "./columns";
import type { useListTable } from "./table";

/**
 * The sizes a reader may ask for.
 *
 * The endpoint's own two constants at either end, and one step between them, so
 * the control cannot offer a number the API answers with a 400 — asking for more
 * than the cap is deliberately rejected rather than quietly clamped, which the
 * shared schema explains at length.
 */
const PER_PAGE = [DEFAULT_PER_PAGE, 50, MAX_PER_PAGE] as const;

/**
 * How many rows there are, where in them the reader is, and the way to move.
 *
 * Driven through the table's own pagination API rather than by arithmetic here:
 * `getCanPreviousPage` and `getCanNextPage` already know they are at a boundary,
 * and `pageCount` came from the API as 0 for an empty result, so the two ends
 * are right on a table with nothing in it without a special case.
 *
 * Prev/next and a position, rather than numbered pages. A numbered pager needs
 * ellipsis logic and a decision about how many neighbours to show; nothing here
 * has asked for one, and `?page=` in the address bar is the escape hatch for the
 * reader who wants page 40 exactly.
 */
export function ListPager<Row extends ListRow>({
  table,
  total,
}: {
  table: ReturnType<typeof useListTable<Row>>;
  /** Already worded by the page — "137 імен" is not something a framework can say. */
  total: string;
}) {
  const t = useTranslations("list");

  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="compact:flex-row compact:items-center compact:justify-between flex flex-col gap-4">
      {/* One live region for the whole footer: a search that narrows 137 names
          to 3 changes the table silently otherwise, and the count is the thing
          that says it happened. */}
      <p role="status" aria-live="polite" className="text-parchment-faint text-caption italic">
        {total}
        {pageCount > 0 && (
          <>
            {" · "}
            {t("page", { page: pageIndex + 1, pageCount })}
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="px-3">
              {t("perPage", { count: pageSize })}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="border-primary/25 from-secondary/95 to-background/95 shadow-deep min-w-[8rem] rounded-none bg-gradient-to-b p-1 backdrop-blur-[10px]"
          >
            <DropdownMenuRadioGroup
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              {PER_PAGE.map((size) => (
                <DropdownMenuRadioItem
                  key={size}
                  value={String(size)}
                  className="font-caps text-label tracking-label text-muted-foreground focus:text-primary-bright cursor-pointer rounded-none uppercase focus:bg-transparent"
                >
                  {size}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className="px-3"
          aria-label={t("previous")}
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="px-3"
          aria-label={t("next")}
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
