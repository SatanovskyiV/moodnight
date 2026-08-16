import type { QueryClient } from "@tanstack/react-query";

import {
  getListPoemQueueQueryKey,
  getListPoemsInfiniteQueryKey,
  getListPoemsQueryKey,
} from "@/lib/api/generated/poems";

/**
 * What an editorial decision makes stale, gathered here because the two files
 * that take those decisions would otherwise each have to remember the same list.
 *
 * Every key below is *derived* from a generated helper rather than written as a
 * literal, so the day orval changes how it builds one this follows instead of
 * silently matching nothing. A key that matches nothing fails as a row that will
 * not go away, which is the kind of bug nobody reports — they reload and move
 * on.
 */

/**
 * Every cached page of the queue, as one key.
 *
 * `getListPoemQueueQueryKey` builds `["/admin/queue", params]`, so a key for one
 * particular page, sort and search. Called with nothing it returns just the
 * prefix — and TanStack matches keys by prefix, so this one value stands for
 * every page of the queue anybody has looked at, whatever controls were in the
 * address bar at the time.
 */
export const QUEUE_QUERY_KEY = getListPoemQueueQueryKey();

/**
 * Every cached view of the public feed.
 *
 * **Two keys and not one, and the second is easy to miss.** orval prefixes an
 * infinite query's key with the literal `"infinite"`, so `["infinite", "/poems"]`
 * and `["/poems"]` are siblings rather than one being a prefix of the other —
 * invalidating the plain one leaves the feed the front page actually reads
 * untouched. The feed is the infinite one (components/feed/use-feed.ts); the
 * paged one is here so that a future reader of the same endpoint is not a third
 * thing to remember.
 *
 * **Why a decision has to reach this far at all.** `refetchOnWindowFocus` is off
 * and `staleTime` is a minute (components/query), which is right for a site
 * whose read path is meant to be cached — and it means a front page already open
 * in the same session has no reason of its own to notice that a poem was just
 * put on the fires. Approving is precisely the moment the public list stopped
 * being true, so it is the moment that has to say so.
 *
 * This is the browser's cache and only this browser's: it is what makes the
 * editor's own tabs agree, not what publishes the poem. The poem is public the
 * moment the transaction commits; a reader who loads the page afterwards gets it
 * from the API either way.
 */
export function invalidatePublicFeed(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: getListPoemsInfiniteQueryKey() }),
    client.invalidateQueries({ queryKey: getListPoemsQueryKey() }),
  ]);
}
