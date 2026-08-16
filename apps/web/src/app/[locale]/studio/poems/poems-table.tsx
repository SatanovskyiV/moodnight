"use client";

import {
  poemStatusSchema,
  studioPoemList,
  type PoemStatus,
  type StudioPoemSummary,
} from "@moodnight/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { listColumnHelper, type ListColumns } from "@/components/list/columns";
import { Moment } from "@/components/list/moment";
import { useListQuery } from "@/components/list/query";
import { ListView } from "@/components/list/view";
import { payload, type ApiRequestError } from "@/lib/api/error";
import type { ListStudioPoemsParams } from "@/lib/api/generated/model";
import { useListStudioPoems, type listStudioPoemsResponse } from "@/lib/api/generated/poems";

import { PoemStatusChip } from "./status";

/**
 * An author's own shelf: everything they have written, in whatever state it is
 * in — drafts nobody else can see, what is waiting for an answer, what is on the
 * fires, and what came back.
 *
 * The third list on this site and the one components/list was always going to
 * end at. The queue next door renders the *same row type* — `StudioPoemSummary`
 * is deliberately one schema for both, because what differs between the studio
 * and the queue is which rows, and that is a `where` clause rather than a shape
 * (packages/shared/src/poem.ts). So what is left here is genuinely about an
 * author's own work: five columns, one filter, and the words.
 *
 * **The author is not a parameter and cannot be one.** `GET /studio/poems` pins
 * the list with `base: { authorId: actor.id }` from the token
 * (apps/api/src/poems/poem-studio.service.ts), so there is nothing on this page
 * that says whose poems these are, and no way to ask about somebody else's.
 * That is also what makes the status filter safe here when the public feed must
 * never offer one: the widest thing `?status=` can reach is the caller's own
 * shelf.
 *
 * **Newest-touched first, and that is the endpoint's decision rather than this
 * file's.** `studioPoemList` carries `defaultSort: "updatedAt"` and
 * `defaultOrder: "desc"` in its query schema, `useListQuery` learns both by
 * parsing an empty object, and the header arrow follows. A writer coming back to
 * the studio is looking for what they were last working on, not for what the
 * site last published.
 *
 * **No row links anywhere yet.** The title is text and not a `Link` because
 * `/studio/poems/[id]` does not exist — `GET /studio/poems/:id` is built and
 * waiting on the API, and until the page that reads it is too, a link here would
 * be a door onto nothing. The one thing an author cannot do from this table is
 * therefore read the note on a poem that was sent back; the SENT BACK chip says
 * a note exists and that page is where it will be read.
 *
 * A client component by necessity rather than preference, the same as the two
 * lists before it: docs/ROADMAP.md, "a gated page is built at deploy time for
 * everybody and its payload is fetchable by anybody, so data must always arrive
 * over an authenticated call and never be baked into a page."
 */
export function StudioPoemsTable() {
  const t = useTranslations("studio.sections.poems");

  const query = useListQuery(studioPoemList);

  const { data, error, isPending, isFetching, refetch } = useListStudioPoems<
    listStudioPoemsResponse,
    // orval types `TError` from the statuses the document lists, which is `void`
    // — it cannot know what the mutator throws. The same note the queue and the
    // names both make, and `request` still throws exactly one thing.
    ApiRequestError
  >(
    // No cast, and that is the check: if `studioPoemList` gains a sortable
    // property in packages/shared and `pnpm api:generate` is not run, these two
    // types stop agreeing and `pnpm typecheck` says so.
    query.params satisfies ListStudioPoemsParams,
    { query: { placeholderData: keepPreviousData } },
  );

  const columns = useMemo<ListColumns<StudioPoemSummary>>(() => {
    const column = listColumnHelper<StudioPoemSummary>();

    return column.columns([
      column.accessor("title", {
        header: t("columns.title"),
        cell: (cell) => (
          <span className="flex flex-col">
            {cell.getValue()}

            {/* The poem's own second line, where it has one. Italic and dim, the
                way the feed's card sets a subtitle and the way the queue's title
                cell does — a title and a subtitle are the same pair of things
                wherever this site writes them down. */}
            {cell.row.original.subtitle && (
              <span className="text-parchment-faint text-micro italic">
                {cell.row.original.subtitle}
              </span>
            )}
          </span>
        ),
      }),
      column.accessor("status", {
        header: t("columns.status"),
        // The only column that never hides. The queue's trick of folding a
        // hidden column's value in under the title is deliberately not played
        // here: status is what an author scans this page for, so it keeps its
        // own cell at every width and there is no second copy to disagree with.
        //
        // No `sortDescFirst`, unlike every date below. Ascending is the poem's
        // own journey — the endpoint orders by the Postgres enum's declared
        // order, draft, queued, published, sent back — and that reads better
        // than either alphabetically or backwards.
        cell: (cell) => {
          const status = cell.getValue();

          // The closed union off the contract's own enum, looked up in the
          // catalogue at render — the shape components/list/view.tsx uses for
          // `error.${failure}` and the queue for `returned.${action}`. A fifth
          // status would fail typecheck here rather than render a key.
          return <PoemStatusChip status={status} label={t(`status.${status}`)} />;
        },
      }),
      column.accessor("createdAt", {
        header: t("columns.createdAt"),
        // Newest first on the first click, as on the queue and the names.
        sortDescFirst: true,
        meta: { hideBelow: "compact", align: "end" },
        cell: (cell) => <Moment at={cell.getValue()} />,
      }),
      column.accessor("publishedAt", {
        header: t("columns.publishedAt"),
        sortDescFirst: true,
        meta: { hideBelow: "compact", align: "end" },
        // The column `Moment`'s dash was written for: null on every draft,
        // everything waiting, and everything sent back — most of most shelves.
        cell: (cell) => <Moment at={cell.getValue()} />,
      }),
      column.accessor("updatedAt", {
        header: t("columns.updatedAt"),
        sortDescFirst: true,
        // Stays at every width: it is the column the list is already ordered by,
        // so hiding it on a phone would leave the sort arrow nowhere to be.
        meta: { align: "end" },
        cell: (cell) => <Moment at={cell.getValue()} />,
      }),
    ]);
  }, [t]);

  return (
    <ListView
      definition={studioPoemList}
      query={query}
      columns={columns}
      page={data && payload(data)}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error ?? null}
      onRetry={refetch}
      filters={[
        {
          field: "status",
          label: t("filters.status"),
          // Straight off the zod enum the server validates against, so a state
          // added to `poemStatusSchema` is filterable here the same day — the
          // same arrangement the names make with `userRoleSchema.options`.
          options: poemStatusSchema.options,
          optionLabel: (value) => t(`status.${value as PoemStatus}`),
        },
      ]}
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
