"use client";

import { hasRole } from "@moodnight/shared";

import { ADMIN_LINKS, minimumRole } from "@/components/area/links";
import { useSession } from "@/components/session";
import { payload, type ApiRequestError } from "@/lib/api/error";
import type { ListPoemQueueParams } from "@/lib/api/generated/model";
import { useListPoemQueue, type listPoemQueueResponse } from "@/lib/api/generated/poems";

/**
 * The queue's own count, bought as the cheapest page the endpoint will sell: one
 * row, read for its `total` and nothing else.
 *
 * `perPage: 1` rather than the list's defaults on purpose. The table asks for
 * whatever the address bar says — a page, a sort, maybe a search — so sharing a
 * cache entry with it would mean either a count that changes with the reader's
 * controls or a second request the moment they touch one. A key of its own costs
 * one row and answers the one question the marks are asking.
 */
const WAITING: ListPoemQueueParams = { perPage: 1 };

/**
 * The queue's own floor, asked rather than restated: whichever role the row in
 * `ADMIN_LINKS` keeps for `/admin/queue`. The same value the rail filters that
 * row against and the same one `@Roles("EDITOR")` enforces on the endpoint, so
 * this cannot start asking on behalf of somebody the API would refuse.
 */
const MAY_READ_QUEUE = minimumRole(ADMIN_LINKS, "/admin/queue");

/**
 * How many poems are waiting to be read — or `null`, meaning *draw nothing*.
 *
 * One hook behind both marks that show the number: the badge beside the queue's
 * row in the admin rail, and the bead on the reader's seal in the top bar. They
 * are two drawings of one fact, and a fact fetched twice is a fact that can be
 * shown as two different numbers on the same screen. Sharing the query key is
 * what makes them agree — and it is why this is a hook in components/ rather
 * than something the admin area owns, since the top bar rides along on every
 * route, including the ones that have no administration around them.
 *
 * **Everything that is not a count collapses to `null`.** Not an editor, not
 * signed in, not arrived yet, the request failed, or the queue is empty — the
 * caller draws nothing in every one of those cases, so it makes no decisions of
 * its own and cannot get one of them wrong. Two are worth naming:
 *
 * - *The failure.* A count is a courtesy, and neither place that wears it can
 *   report a failure without becoming something else — chrome that apologises.
 *   The queue's own page has a proper error state and a retry, one click away.
 * - *The nought.* An empty queue wears no mark at all. The absence is the good
 *   news, and the page says so in words ("Тиша тут — добра новина"); a nought in
 *   a frame would be that same fact drawn as an alert.
 *
 * **`enabled` and not an early return**, because hooks cannot be called
 * conditionally — and it is what keeps an author from ever issuing this request
 * or collecting a 403 for it. Nobody below the queue's floor makes the call.
 *
 * **It stays fresh without anybody telling it to.** The key orval builds here is
 * `["/admin/queue", { perPage: 1 }]`, and `QUEUE_QUERY_KEY` in the queue's
 * cache-keys.ts is the bare `["/admin/queue"]` prefix every decision already
 * invalidates — so approving or returning a poem updates both marks for free,
 * from code written before either existed. That is the whole reason those files
 * derive their keys from the generated helpers instead of writing literals.
 *
 * What it will *not* notice is somebody else's submission arriving while an
 * editor sits on one page: `refetchOnWindowFocus` is off and `staleTime` is a
 * minute (components/query), which is the trade this site makes everywhere for a
 * $0/month API. It re-reads on navigation, which is when the number is looked at.
 */
export function useWaiting(): number | null {
  const { state } = useSession();

  const mayRead = state.status === "signedIn" && hasRole(state.session.user.role, MAY_READ_QUEUE);

  const { data, isSuccess } = useListPoemQueue<
    listPoemQueueResponse,
    // The same note the queue's table makes: orval types `TError` from the
    // statuses the document lists, which is `void`, and `request` still throws
    // exactly one thing.
    ApiRequestError
  >(WAITING, { query: { enabled: mayRead } });

  // `mayRead` again, and it is not the same statement `enabled` made. Signing
  // out removes the session query and nothing else (components/session), so an
  // editor's count outlives their session in this tab's cache — and a disabled
  // query keeps whatever it last succeeded with. Without this line, signing out
  // and back in as an author on the same page would hand that author a bead.
  // Disabling stops the request; this stops the answer.
  if (!mayRead || !isSuccess) {
    return null;
  }

  const { total } = payload(data);

  return total > 0 ? total : null;
}
