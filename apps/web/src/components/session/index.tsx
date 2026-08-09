"use client";

import type { Session } from "@moodnight/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import { holdAccessToken } from "@/lib/api/access-token";
import { logout, refresh } from "@/lib/api/generated/auth";
import { isStatus, payload } from "@/lib/api/error";

import {
  hintUnknownOnServer,
  readHint,
  type SessionHint,
  subscribeToHint,
  writeHint,
} from "./hint";

/**
 * Whether anybody is signed in, as the browser understands it.
 *
 * `restoring` is a believed-but-unconfirmed session: a hint in this origin's
 * storage says one existed, and `POST /auth/refresh` has not answered yet. It is
 * a state of its own rather than a boolean beside `signedIn` because the user
 * object genuinely is not available during it, and a type that admits that is
 * one a consumer cannot accidentally read through.
 *
 * Three states and not four. "Storage has not been read yet" is a fact about
 * this render, not about who is reading, and only a component that must emit
 * markup before either question can be answered has any use for it — which is
 * the bar's auth control and nothing else. It asks {@link useSessionHint}
 * instead, and every page added later is spared a case whose answer would always
 * have been "treat it like restoring" or "do not care".
 */
export type SessionState =
  { status: "signedOut" } | { status: "restoring" } | { status: "signedIn"; session: Session };

type SessionContextValue = {
  state: SessionState;
  /** Adopts a session the sign-in form has just been handed. */
  signIn: (session: Session) => void;
  signOut: () => void;
  isSigningOut: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Where the session lives in the query cache.
 *
 * Exported because it is an address, not an implementation detail: anything that
 * comes to hold a fresh session — the sign-in form via this provider today, a
 * registration form later — writes it here, and this provider is subscribed to
 * that key rather than to the component that did the writing.
 */
export const sessionQueryKey = ["session"] as const;

/**
 * What this origin's storage says, including its not having been read yet.
 *
 * A second way in, for the one component that needs the answer *before* there
 * can be a session to ask about. The nav's auth control is emitted into HTML
 * built at deploy time for every reader, so on that first pass it is not
 * deciding anything — it renders both controls and lets the pre-paint script's
 * attribute choose. That is a question about hydration, so it is put to the
 * store rather than to {@link useSession}, which answers a different one.
 *
 * The cost of keeping the two apart is one extra entry in a module-level `Set`,
 * since this subscribes alongside {@link SessionProvider}. The cost of merging
 * them would be a fourth case in {@link SessionState}, carried by every page
 * that ever reads it.
 */
export function useSessionHint(): SessionHint {
  return useSyncExternalStore(subscribeToHint, readHint, hintUnknownOnServer);
}

/**
 * Holds the session for the whole client tree.
 *
 * Client-side by necessity rather than by preference: the refresh cookie belongs
 * to the API's origin, so no amount of server rendering here can see it. That
 * one fact decides the shape of everything else — the nav's auth control is a
 * client island, the pages stay static, and the query starts disabled on both
 * sides of hydration so the two agree before any storage is read.
 *
 * The prerendered HTML cannot name a reader, and this provider does not pretend
 * to: until storage has been read it reports `signedOut`, which is the only
 * honest answer available to a tree with nothing to go on. Sparing a returning
 * member the sight of the wrong control in the meantime is a rendering problem
 * rather than a session one, and it is solved where it shows up — see
 * `useSessionHint` above, and the bar's auth control.
 *
 * What this no longer does is keep a state machine of its own. The session is a
 * cache entry, `restoring` is that entry being fetched, and signing in is a
 * write to it — so the states below are read off react-query rather than
 * tracked in parallel with it, and there is no way for the two to disagree.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const hint = useSessionHint();
  const queryClient = useQueryClient();

  const { data: session, isPending } = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async () => {
      try {
        return payload(await refresh());
      } catch (error) {
        // Only a 401 disproves the session, and only a 401 clears the hint. A
        // network failure or a 500 means we could not find out — the reader is
        // shown as signed out because nothing here can claim otherwise, but the
        // hint survives so the next load asks again instead of quietly demoting
        // somebody because the API restarted.
        if (isStatus(error, 401)) {
          writeHint(false);
        }

        throw error;
      }
    },
    enabled: hint === "present",
    // `/auth/refresh` is a POST because it rotates the cookie, but it is a read
    // as far as this app is concerned — "who is this?" — so it is a query, and
    // the generated `useRefresh` mutation is deliberately not what is used. Only
    // a query can be enabled by a condition, cached under a key the sign-in form
    // can write to, and shared by every component that asks for the session.
    //
    // Never stale: the answer changes when this app changes it, and it does that
    // by writing the cache directly. Refetching would cost a request to be told
    // what we just wrote.
    staleTime: Infinity,
    // The global retry rule would try a 500 twice more. Restoring a session is
    // the first thing that happens on a page load and it is entirely optional —
    // if it does not work the first time, the reader signs in again.
    retry: false,
  });

  const { mutate: signOut, isPending: isSigningOut } = useMutation({
    mutationFn: () => logout(),
    // The outcome is deliberately not branched on. A 401 means the session was
    // already over, and the end state asked for is the one that already holds. A
    // network failure means the server may not have revoked anything — but
    // clearing the hint still ends the session *on this device*, because nothing
    // will offer the lingering cookie to `/auth/refresh` again. Leaving the
    // reader signed in because a request failed would be the worse answer, so
    // `onSettled` runs it for both.
    onSettled: () => {
      writeHint(false);
      queryClient.removeQueries({ queryKey: sessionQueryKey });
    },
  });

  const signIn = useCallback(
    (session: Session) => {
      writeHint(true);
      queryClient.setQueryData(sessionQueryKey, session);
    },
    [queryClient],
  );

  // Handed to the transport so that `request` can put it on the `Authorization`
  // header — see lib/api/access-token.ts for why it is a module variable and
  // not a parameter.
  //
  // **During render, deliberately, and not in an effect.** React runs a child's
  // effects before its parent's, so a table mounting on the same render the
  // session lands would fire its first request from its own effect while this
  // provider's had not run yet — one unauthenticated call per page load, arriving
  // as a 401 that nothing did wrong. Assigning here happens before any child of
  // this provider renders at all. It is a write to a module during render, which
  // is ordinarily the thing not to do; it is safe because it is idempotent —
  // StrictMode's double render assigns the same token twice — and because
  // nothing reads it during rendering, only later, from a fetch.
  holdAccessToken(session?.accessToken ?? null);

  // A session in the cache always wins: it is either what the network just
  // confirmed or what sign-in just established. Only in its absence does the
  // hint get to speak, and only for as long as the query it enabled is still
  // in flight — once that has settled without a session, the reader is signed
  // out, whatever storage believes. `unknown` falls through to signed out for
  // the same reason: nothing has been read, so nothing can be claimed here.
  const state: SessionState = session
    ? { status: "signedIn", session }
    : hint === "present" && isPending
      ? { status: "restoring" }
      : { status: "signedOut" };

  return (
    <SessionContext.Provider value={{ state, signIn, signOut, isSigningOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("useSession must be used inside a <SessionProvider>.");
  }

  return value;
}
