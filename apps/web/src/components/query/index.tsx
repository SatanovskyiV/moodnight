"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiRequestError } from "@/lib/api/error";

/**
 * The cache every generated hook reads and writes.
 *
 * The defaults below are the ones this site's shape argues for, and each is a
 * deviation from react-query's own worth stating:
 *
 * - **`retry` distinguishes "no answer" from "an answer you did not like".** Out
 *   of the box every failure is retried three times, which for a 401 means three
 *   requests to be told the same thing and for a 404 means three ways to be
 *   slow. Only a request that never arrived, or a server that broke on its way
 *   to answering, is worth asking again — and on a free-tier serverless API
 *   those are the failures a *cold start* produces, so retrying them is what
 *   makes the first call after an idle hour succeed rather than surface.
 * - **`refetchOnWindowFocus` is off.** It exists for dashboards where the data
 *   moves while you are looking elsewhere. Poems do not, and on a $0/month
 *   budget every avoided refetch is an avoided function invocation.
 * - **A minute of `staleTime`.** Long enough that moving between pages costs
 *   nothing, short enough that an author who has just published sees it.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiRequestError && !error.isUnreachable) {
            return error.status !== null && error.status >= 500 && failureCount < 2;
          }

          return failureCount < 2;
        },
      },
    },
  });
}

/**
 * Puts one client under the whole tree.
 *
 * Held in `useState` rather than a module constant, and that is not a style
 * preference: a module-level client in Next.js is created once per *server
 * process* and would be shared by every request it handles — one visitor's
 * session landing in another visitor's cache. `useState` with an initialiser
 * gives one client per browser tab and one per server render, which is the only
 * arrangement that is correct on both sides.
 *
 * There are no devtools here on purpose. They are the usual companion to this
 * provider and they are also ~50 kB of JavaScript that has to be kept out of the
 * production bundle by a conditional import; the app is small enough that the
 * network tab answers the same questions.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
