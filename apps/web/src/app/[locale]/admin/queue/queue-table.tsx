"use client";

import { poemQueueList, type StudioPoemSummary } from "@moodnight/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import { listColumnHelper, type ListColumns } from "@/components/list/columns";
import { useListQuery } from "@/components/list/query";
import { ListView } from "@/components/list/view";
import { Link } from "@/i18n/navigation";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useListPoemQueue, type listPoemQueueResponse } from "@/lib/api/generated/poems";
import type { ListPoemQueueParams } from "@/lib/api/generated/model";

import { Decided } from "./decided";

/**
 * A date in a cell, or a dash where there is none.
 *
 * `submittedAt` is nullable on the shared type and cannot be null on *this*
 * endpoint: the queue is `status: PENDING_REVIEW`, and the API stamps
 * `submittedAt` on the way in (apps/api/src/poems/poem-writes.service.ts). The
 * type is honest about drafts rather than about the queue, so the branch is
 * unreachable here and is written anyway — the alternative is a `!` that would
 * become a lie the day this cell is reused for the studio's dashboard, where
 * drafts are most of the rows.
 *
 * At module scope and holding its own formatter, rather than nested in the table
 * and closing over one. A component declared inside another is a new component
 * type on every render, and these are rendered from inside a `useMemo` — the
 * columns would go on calling whichever copy the memo was built with.
 *
 * `useFormatter` and not an ICU message, as on the names: these cells have no
 * prose around their dates, so a catalogue entry would be a placeholder and
 * nothing else. `timeZone: "Europe/Kyiv"` from i18n/request.ts still applies, so
 * the server and the browser agree on which day this is.
 */
function Moment({ at }: { at: string | null }) {
  const format = useFormatter();

  if (!at) {
    return <span className="text-parchment-faint">—</span>;
  }

  return (
    <time dateTime={at} className="text-parchment-faint whitespace-nowrap tabular-nums">
      {format.dateTime(new Date(at), { day: "numeric", month: "short", year: "numeric" })}
    </time>
  );
}

/**
 * What is waiting to be read: every poem in `PENDING_REVIEW`, oldest submission
 * first.
 *
 * The second list on this site and the first one the framework was built *for* —
 * components/list is the same toolbar, table and pager the names use, and the
 * comment there saying so has been waiting for this file. What is left here is
 * what is genuinely about the queue: five columns, the words, and no filters.
 *
 * **The one list that ascends.** Nothing here says so — `poemQueueList` in
 * packages/shared carries `defaultOrder: "asc"` and `defaultSort: "submittedAt"`
 * baked into its query schema, `useListQuery` learns them by parsing an empty
 * object, and the header arrow follows. A queue read newest-first is a queue
 * whose oldest submission is never reached, and that decision is made once, on
 * the endpoint's own contract, rather than restated by every client of it.
 *
 * **No filters, and that is two separate reasons.** `filterable` is empty
 * because status *is* the endpoint — a `?status=` here would be a parameter that
 * looks like it could widen the set, and the omission is the boundary. The
 * endpoint does take `?tag=` and `?author=`, but those are *relation* filters
 * and neither half of the client reaches them yet: components/list/wire.ts reads
 * and writes `definition.filterable` only, so they do not survive a round trip
 * through the address bar, and `ListFilters` draws chips over a closed set,
 * which authors and tags are not. Both are worth having — "everything Марко has
 * waiting" is one parameter away — and both want a control this site does not
 * own yet, so the queue ships with search, sorting and paging and that is a gap
 * rather than a decision.
 *
 * A client component by necessity, for the reason the names are: docs/ROADMAP.md,
 * "a gated page is built at deploy time for everybody and its payload is
 * fetchable by anybody, so data must always arrive over an authenticated call
 * and never be baked into a page."
 */
export function QueueTable() {
  const t = useTranslations("admin.sections.queue");

  const query = useListQuery(poemQueueList);

  const { data, error, isPending, isFetching, refetch } = useListPoemQueue<
    listPoemQueueResponse,
    // orval types `TError` from the statuses the document lists, which is `void`
    // — it cannot know what the mutator throws. The same note users-table.tsx
    // makes, and `request` still throws exactly one thing.
    ApiRequestError
  >(
    // No cast, and that is the check: if `poemQueueList` gains a sortable
    // property in packages/shared and `pnpm api:generate` is not run, these two
    // types stop agreeing and `pnpm typecheck` says so.
    query.params satisfies ListPoemQueueParams,
    { query: { placeholderData: keepPreviousData } },
  );

  const columns = useMemo<ListColumns<StudioPoemSummary>>(() => {
    const column = listColumnHelper<StudioPoemSummary>();

    return column.columns([
      column.accessor("title", {
        header: t("columns.title"),
        cell: (cell) => (
          <span className="flex flex-col">
            {/* The way in, and the only interactive thing in a row. Its
                accessible name is the poem's title and nothing else — the
                subtitle and the author below stay outside it, so a reader
                tabbing through the table hears one poem per stop rather than a
                paragraph.

                The treatment is the sort header's, in components/list/table.tsx:
                gold on hover and on focus, with the ring the rest of the site
                uses. `Link` from i18n/navigation and never `next/link`, so the
                href resolves under whichever locale is being read. */}
            <Link
              href={`/admin/queue/${cell.row.original.id}`}
              className="hover:text-primary focus-visible:text-primary focus-visible:outline-ring w-fit transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {cell.getValue()}
            </Link>

            {/* The poem's own second line, where it has one. Italic and dim, the
                way the feed's card sets a subtitle — a title and a subtitle are
                the same pair of things here as they are there. */}
            {cell.row.original.subtitle && (
              <span className="text-parchment-faint text-micro italic">
                {cell.row.original.subtitle}
              </span>
            )}

            {/* The voice column is gone below `compact:`, so the cell that names
                the row carries it there instead — the trick the names play with
                the email, and the reason neither list needs a second renderer
                for a narrow screen. */}
            <span className="text-parchment-faint text-micro compact:hidden">
              {cell.row.original.author.penName}
            </span>
          </span>
        ),
      }),
      column.accessor((row) => row.author.penName, {
        // An accessor function has no key to be named after, and the id is not
        // cosmetic: `sortableColumns` looks each column up in the contract's
        // `sortable` by exactly this string. "author" is not among the three, so
        // this header stays text rather than becoming a button — which is right,
        // since ordering a queue by its poets would bury the oldest submission
        // behind the alphabet.
        id: "author",
        header: t("columns.author"),
        meta: { hideBelow: "compact" },
        cell: (cell) => <span className="text-parchment-faint">{cell.getValue()}</span>,
      }),
      column.accessor("review", {
        header: t("columns.returned"),
        meta: { hideBelow: "narrow" },
        cell: (cell) => {
          const review = cell.getValue();

          // Null is the common row and the good one: nobody has decided on this
          // poem, so it is here for the first time.
          if (!review) {
            return (
              <span className="text-parchment-faint">
                <span aria-hidden="true">—</span>
                <span className="sr-only">{t("returned.never")}</span>
              </span>
            );
          }

          // The closed union off the contract's own enum, looked up in the
          // catalogue at render — the shape components/list/view.tsx uses for
          // `error.${failure}`. A third action would fail typecheck here rather
          // than render a key.
          return <Decided action={review.action} label={t(`returned.${review.action}`)} />;
        },
      }),
      column.accessor("createdAt", {
        header: t("columns.createdAt"),
        // Newest first on the first click, as on the names. The queue's own
        // order is the other column's business.
        sortDescFirst: true,
        meta: { hideBelow: "compact", align: "end" },
        cell: (cell) => <Moment at={cell.getValue()} />,
      }),
      column.accessor("submittedAt", {
        header: t("columns.submittedAt"),
        // No `sortDescFirst`: this is the column the queue is already ordered
        // by, ascending, and oldest-first is the reading that means something.
        meta: { align: "end" },
        cell: (cell) => <Moment at={cell.getValue()} />,
      }),
    ]);
  }, [t]);

  return (
    <ListView
      definition={poemQueueList}
      query={query}
      columns={columns}
      page={data && payload(data)}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error ?? null}
      onRetry={refetch}
      labels={{
        caption: t("title"),
        searchPlaceholder: t("searchPlaceholder"),
        total: t("total", { count: data ? payload(data).total : 0 }),
        loading: t("loading"),
        empty: t("empty"),
        emptyLine: t("emptyLine"),
      }}
    />
  );
}
