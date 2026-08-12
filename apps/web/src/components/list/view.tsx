"use client";

import type { ListDefinition } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { Panel } from "@/components/editorial/panel";
import { Restoring } from "@/components/session/gate";
import { Button } from "@/components/ui/button";
import type { ApiRequestError } from "@/lib/api/error";

import type { ListColumns, ListRow } from "./columns";
import { ListPager } from "./pager";
import type { ListQuery } from "./query";
import { ListTable, useListTable, type ListPage } from "./table";
import { ListFilters, ListSearch, type ListFilterSpec } from "./toolbar";

/**
 * Why a page of rows did not arrive.
 *
 * A closed union rather than a rendered string, so the set of things that can go
 * wrong is something `tsc` checks the catalogue mapping against — the same shape
 * `Failure` takes in app/[locale]/sign-in/sign-in-form.tsx, extended by the two
 * statuses a *read* can fail with that a sign-in cannot.
 */
type Failure = "network" | "expired" | "forbidden" | "rejected" | "unexpected";

function failureOf(error: ApiRequestError | null): Failure | null {
  if (!error) {
    return null;
  }

  return error.isUnreachable
    ? "network"
    : error.status === 401
      ? "expired"
      : error.status === 403
        ? "forbidden"
        : // Should be unreachable: the URL was parsed by the same schema the
          // server validates with, so a request this component agreed to send is
          // one the endpoint has already agreed to parse. The same promise
          // sign-in-form.tsx makes about its own 400 branch, and it is worth a
          // message rather than a blank because "should be" is not "is".
          error.status === 400
          ? "rejected"
          : "unexpected";
}

export type ListLabels = {
  /** The table's accessible name. The page's own heading, usually. */
  caption: string;
  searchPlaceholder: string;
  /** The row count, worded by the page — a framework cannot pluralise "ім'я". */
  total: string;
  /** Shown while the first page is in flight. */
  loading: string;
  /** Shown when the resource is genuinely empty, filters or no filters. */
  empty: string;
  emptyLine: string;
};

/**
 * A list, whole: its controls, its table, its pager, and the four states none of
 * those should have to know about.
 *
 * Everything generic is here; everything that had to be said in this site's own
 * words arrives as a already-translated string, because a framework component
 * cannot know whether its rows are names or poems and `t("list.total")` would
 * have to say "records" to both.
 */
export function ListView<Row extends ListRow, Definition extends ListDefinition>({
  definition,
  query,
  columns,
  page,
  isPending,
  isRefreshing,
  error,
  onRetry,
  filters = [],
  labels,
}: {
  definition: Definition;
  query: ListQuery<Definition>;
  columns: ListColumns<Row>;
  page: ListPage<Row> | undefined;
  isPending: boolean;
  isRefreshing: boolean;
  error: ApiRequestError | null;
  onRetry: () => void;
  filters?: readonly ListFilterSpec<Definition>[];
  labels: ListLabels;
}) {
  const t = useTranslations("list");

  const table = useListTable<Row>({
    definition,
    columns,
    // The controls are the framework's five plus this list's filters; the
    // generic parameter is what a page needs and what the table does not.
    query: query as unknown as ListQuery<ListDefinition>,
    page,
  });

  const failure = failureOf(error);

  // `total`, never `items.length`. A page past the end answers with empty items
  // and a true total on purpose — the shared schema says so — so a reader who
  // deletes the last row of the last page sees an empty page rather than a
  // "nothing matches" panel that would be a lie.
  const nothing = page !== undefined && page.total === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="compact:flex-row compact:items-end flex flex-col gap-4">
        <ListSearch
          query={query as unknown as ListQuery<ListDefinition>}
          placeholder={labels.searchPlaceholder}
        />

        {query.narrowed && (
          <Button variant="ghost" size="sm" className="px-4" onClick={query.clear}>
            {t("clear")}
          </Button>
        )}
      </div>

      <ListFilters query={query} filters={filters} />

      {failure ? (
        <div className="flex flex-col items-start gap-4">
          {/* `--destructive` is `--blood`, which works as a border and a wash
              and fails contrast outright as text — the note in sign-in-form.tsx,
              and the reason the copy here is `text-foreground`. */}
          <p
            role="alert"
            className="border-destructive/60 bg-destructive/10 text-foreground w-full border-l-2 px-4 py-3 text-[0.95rem] italic"
          >
            {t(`error.${failure}`)}
          </p>

          <Button variant="ghost" size="sm" className="px-4" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : isPending ? (
        // Only the genuine first load. With `keepPreviousData` every later fetch
        // has rows to show, and shows them dimmed instead — see `ListTable`.
        <Restoring className="flex" label={labels.loading} />
      ) : nothing ? (
        <Panel
          title={query.narrowed ? t("noMatches") : labels.empty}
          line={query.narrowed ? t("noMatchesLine") : labels.emptyLine}
          action={
            query.narrowed ? (
              <Button variant="ghost" className="compact:px-8 px-5" onClick={query.clear}>
                {t("clear")}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ListTable table={table} caption={labels.caption} dimmed={isRefreshing} />
          <ListPager table={table} total={labels.total} />
        </>
      )}
    </div>
  );
}
