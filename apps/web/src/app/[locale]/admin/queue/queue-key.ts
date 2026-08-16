import { getListPoemQueueQueryKey } from "@/lib/api/generated/poems";

/**
 * Every cached page of the queue, as one key to invalidate.
 *
 * `getListPoemQueueQueryKey` builds `["/admin/queue", params]`, so a key for one
 * particular page, sort and search. Called with nothing it returns just the
 * prefix — and TanStack matches keys by prefix, so this one value stands for
 * every page of the queue anybody has looked at, whatever controls were in the
 * address bar at the time.
 *
 * Derived from the generated helper rather than written as a literal, so the day
 * orval changes how it builds a key this follows rather than silently matching
 * nothing. A key that matches nothing fails as a stale row that will not go
 * away, which is the kind of bug nobody reports.
 */
export const QUEUE_QUERY_KEY = getListPoemQueueQueryKey();
