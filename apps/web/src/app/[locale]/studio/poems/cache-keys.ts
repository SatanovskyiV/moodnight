import { getListStudioPoemsQueryKey } from "@/lib/api/generated/poems";

/**
 * Every cached page of an author's own shelf, as one key.
 *
 * Derived from the generated helper rather than written as a literal, which is
 * the rule ../../admin/queue/cache-keys.ts sets out: the day orval changes how
 * it builds a key, this follows instead of silently matching nothing, and a key
 * that matches nothing fails as a row that will not appear — the kind of bug
 * nobody reports, because they reload and move on.
 *
 * `getListStudioPoemsQueryKey` builds `["/studio/poems", params]`, so a key for
 * one particular page, sort, search and status filter. Called with nothing it
 * returns just the prefix — and TanStack matches keys by prefix, so this one
 * value stands for every page of the shelf the author has looked at, whatever
 * controls were in the address bar at the time.
 *
 * **One key here, where the public feed needs two.** `invalidatePublicFeed` has
 * to name an infinite key and a paged one because `GET /poems` is read both ways
 * and orval prefixes an infinite query's key with the literal `"infinite"`,
 * making the two siblings rather than one a prefix of the other. `GET
 * /studio/poems` has no infinite hook — a shelf is a table with a pager, and
 * `orval.config.ts` turns `useInfinite` on per operation rather than globally,
 * precisely so a hook nobody calls is not generated. So this is genuinely one
 * key, and it is worth saying so beside a file that looks like it is missing a
 * line.
 *
 * **Why writing a poem has to reach this far.** `refetchOnWindowFocus` is off
 * and `staleTime` is a minute (components/query), which is right for a site
 * whose read path is meant to be cached. It also means a shelf already loaded in
 * this session has no reason of its own to notice that its author has just
 * written something — and "Back to my poems" from the compose form lands inside
 * that minute nearly every time. A poem that is missing from the author's own
 * list of poems is the one staleness on this site nobody would read as caching.
 */
export const STUDIO_POEMS_QUERY_KEY = getListStudioPoemsQueryKey();
