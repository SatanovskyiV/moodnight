"use client";

import type { InfiniteData } from "@tanstack/react-query";

import { payload, type ApiRequestError } from "@/lib/api/error";
import type { ListPoemsParams, PoemSummary } from "@/lib/api/generated/model";
import { useListPoemsInfinite, type listPoemsResponse } from "@/lib/api/generated/poems";

/**
 * How many poems arrive per scroll.
 *
 * Twelve rather than the list framework's own default of twenty, and the number
 * is not arbitrary: packages/shared/src/poem.ts describes the summary shape as
 * the one that "goes out twelve at a time to an infinite feed". A pager's page
 * is a unit the reader chose to turn to; a feed's page is a unit the reader
 * never sees, so it wants to be small enough that reaching the bottom is never
 * a wait and large enough that a scroll is not one request per card.
 */
export const FEED_PER_PAGE = 12;

/**
 * The accumulated pages, spelled once.
 *
 * The page-param type is taken from the generated parameters rather than written
 * as `number`, so it stays whatever the contract says `page` is — including its
 * optionality, which is how orval's `queryFn` falls back when no cursor has been
 * set yet.
 */
export type FeedData = InfiniteData<listPoemsResponse, ListPoemsParams["page"]>;

/**
 * The feed's one query — every published poem, newest first, a page at a time.
 *
 * The hook underneath is generated: `useInfinite` is switched on for `listPoems`
 * in orval.config.ts, so paging, the query key, the cancellation signal and the
 * merged cache entry all come out of apps/api/openapi.json. What orval cannot
 * generate is the two functions below, because they are the only part that
 * depends on how *this* API says "there is more" — `pageCount` on the envelope,
 * out of packages/shared/src/list.ts.
 *
 * `getNextPageParam` answering `undefined` is what sets `hasNextPage` false, and
 * that is the single source of "the feed has ended" — the end mark in ./index.tsx
 * reads it rather than counting anything of its own.
 *
 * **Deliberately not `useListQuery(poemList)`.** The list framework keeps a
 * list's controls in the address bar, which is right for a table with a search
 * box and filters and wrong for a feed that has neither: there is no state here
 * a reader could want to link to yet. What it takes instead is the same
 * `ListPoemsParams` the framework produces, minus the two the scroll owns — so
 * the day `/tag/[slug]` and `/author/[slug]` arrive they pass `{ tag: [slug] }`
 * through this hook unchanged, and pick up the URL state at that point, which is
 * when there is finally something in it.
 */
export function useFeed(params?: Omit<ListPoemsParams, "page" | "perPage">) {
  return useListPoemsInfinite<FeedData, ApiRequestError>(
    { ...params, perPage: FEED_PER_PAGE },
    {
      query: {
        initialPageParam: 1,
        getNextPageParam: (last) => {
          const page = payload(last);

          // `pageCount`, not `items.length < perPage`: a last page that happens
          // to be full would otherwise send the feed after a page past the end,
          // and it would take an empty answer to find out there wasn't one.
          return page.page < page.pageCount ? page.page + 1 : undefined;
        },
      },
    },
  );
}

/**
 * Every poem fetched so far, in one list.
 *
 * The cache holds pages, because pages are what was asked for; a feed renders a
 * column. Flattening here rather than in the component is what keeps ./index.tsx
 * from knowing the shape of the envelope at all.
 */
export function poemsOf(data: FeedData | undefined): PoemSummary[] {
  return data?.pages.flatMap((page) => payload(page).items) ?? [];
}

/**
 * How many poems match, across every page — which is not how many have been
 * fetched.
 *
 * Read off the envelope rather than from the length of the list above, for the
 * reason components/list/view.tsx gives about its own tables: a page past the
 * end answers with empty items and a true total, so a length is the wrong thing
 * to ask whether the archive is empty.
 */
export function totalOf(data: FeedData | undefined): number | undefined {
  const first = data?.pages[0];

  return first && payload(first).total;
}
