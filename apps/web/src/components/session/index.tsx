"use client";

import type { Session } from "@moodnight/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

import { logout, refresh } from "@/lib/api/generated/auth";
import { isStatus, payload } from "@/lib/api/error";

/**
 * Whether anybody is signed in, as the browser understands it.
 *
 * `restoring` is a believed-but-unconfirmed session: a hint in this origin's
 * storage says one existed, and `POST /auth/refresh` has not answered yet. It is
 * a state of its own rather than a boolean beside `signedIn` because the user
 * object genuinely is not available during it, and a type that admits that is
 * one a consumer cannot accidentally read through.
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
 * A flag saying a session may exist — deliberately not the session itself.
 *
 * Two things fall out of having it, and neither is possible without something
 * readable on *this* origin. The refresh token is httpOnly and scoped to the
 * API's `/auth` path, and in production the API is a different domain
 * altogether (see refreshCookieOptions in apps/api), so nothing here — least of
 * all a Server Component — can look at it and tell.
 *
 * 1. **Anonymous readers cost nothing.** Without a hint, every page view by
 *    every visitor who has never signed in would spend an API call to be told
 *    401. That is a serverless invocation per page view on a site whose entire
 *    cost model is static delivery. It is the query's `enabled`, so react-query
 *    does not so much as construct the request.
 * 2. **A returning reader's nav is right immediately.** The hint is readable
 *    synchronously, so the first render after hydration already knows to offer
 *    "sign out", instead of showing the wrong control until the network answers.
 *
 * It is not a credential and forging it achieves nothing: the API still demands
 * the cookie, and a hint with no cookie behind it earns a 401 and is cleared.
 */
const HINT_KEY = "moodnight.session";

/**
 * Everything currently rendering the hint.
 *
 * `useSyncExternalStore` wants a way to be told the store changed, and unlike a
 * `storage` event — which fires only in *other* tabs — this fires in the one
 * that made the change. It has to: the hint is what enables the refresh query,
 * so clearing it on sign-out is what stops the cache from immediately trying to
 * restore the session that was just ended.
 */
const listeners = new Set<() => void>();

function subscribeToHint(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Storage throws in Safari's private mode rather than being absent. */
function readHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * What the server must assume, having no storage to consult.
 *
 * Reading the hint through `useSyncExternalStore` rather than in a `useState`
 * initialiser is what keeps hydration honest: the server has no storage, so it
 * must render the signed-out bar; an initialiser would read the real value on
 * the client and hydrate different markup than the server sent. This hook is
 * built for precisely that split — it renders this snapshot while hydrating and
 * reconciles to the client's value immediately after, in one extra render rather
 * than a mismatch.
 */
const noHintOnServer = () => false;

function writeHint(exists: boolean): void {
  try {
    if (exists) {
      window.localStorage.setItem(HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(HINT_KEY);
    }
  } catch {
    // Storage denied. The session still works for this page; it just will not be
    // recognised after a reload, which is the correct degradation.
  }

  for (const listener of listeners) {
    listener();
  }
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
 * That starting value is also why the prerendered HTML offers "sign in": it is
 * the only control that still works with JavaScript disabled, and being briefly
 * wrong for a signed-in reader is a better failure than a nav that can never be
 * anything.
 *
 * What this no longer does is keep a state machine of its own. The session is a
 * cache entry, `restoring` is that entry being fetched, and signing in is a
 * write to it — so the three states below are read off react-query rather than
 * tracked in parallel with it, and there is no way for the two to disagree.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const hintExists = useSyncExternalStore(subscribeToHint, readHint, noHintOnServer);
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
    enabled: hintExists,
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

  // A session in the cache always wins: it is either what the network just
  // confirmed or what sign-in just established. Only in its absence does the
  // hint get to speak, and only for as long as the query it enabled is still
  // in flight — once that has settled without a session, the reader is signed
  // out, whatever storage believes.
  const state: SessionState = session
    ? { status: "signedIn", session }
    : hintExists && isPending
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
