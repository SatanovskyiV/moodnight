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
 *    synchronously — before hydration, by `sessionHintScript`, and during it, by
 *    `readHint` — so the bar never offers "sign in" to somebody who is signed in.
 *
 * It is not a credential and forging it achieves nothing: the API still demands
 * the cookie, and a hint with no cookie behind it earns a 401 and is cleared.
 *
 * This module deliberately carries no "use client": the script below is emitted
 * by the root layout, which is a Server Component, and a client module's exports
 * reach one only as opaque references. That is also why the hook wrapping this
 * store lives in ./index.tsx rather than here — it needs React, and this file
 * has to stay importable from the server.
 */
const HINT_KEY = "moodnight.session";

/**
 * What the hint says, including its saying nothing yet.
 *
 * `unknown` is the server's answer and the answer during hydration — no storage
 * has been consulted, so neither control is the right one to commit to. It is a
 * third state rather than a pessimistic `absent` because those two want
 * different markup: `absent` is a sign-in button, `unknown` is a bar that has to
 * be right for both readers before any React has run.
 */
export type SessionHint = "present" | "absent" | "unknown";

/**
 * The attribute `sessionHintScript` writes on `<html>`, and the one the nav's
 * pre-hydration markup is styled by.
 *
 * A DOM attribute rather than anything React holds, because it is set in the
 * gap React does not cover: after the HTML that was built at deploy time is
 * parsed, and before the bundle that could read storage has arrived.
 *
 * Both are private, because exporting them would imply the other half of the
 * contract can be built from them and it cannot: the matching side is a pair of
 * literal Tailwind variants, and Tailwind finds classes by scanning source for
 * whole strings — one assembled from these names would compile to no CSS at all.
 * Renaming either value is therefore an edit here and one in each of the three
 * files that spell the pair out:
 *
 * - components/top-nav/auth-action.tsx — sign in, or the reader's own menu
 * - components/session/gate.tsx — the shut door, or the wait
 * - app/[locale]/welcome.tsx — the home page's anonymous block, or the wait
 */
const SESSION_HINT_ATTRIBUTE = "data-session";

/** The attribute's one value: a session is believed to exist. */
const SESSION_HINT_RESTORING = "restoring";

/**
 * Marks the document for a returning reader, before the first paint.
 *
 * Runs as a blocking inline script at the top of `<body>`, which is what makes
 * it worth its awkwardness: the prerendered bar is the same HTML for everybody —
 * it has to be, or the read path could not be static — so the only moment left
 * to tell the two readers apart is between the parser reaching this tag and the
 * browser painting the nav that follows it. That is the flash this removes. By
 * the time React hydrates, `readHint` has taken over and the attribute stops
 * mattering; nothing keeps it in sync afterwards, and nothing needs to.
 */
export const sessionHintScript =
  `try{if(localStorage.getItem(${JSON.stringify(HINT_KEY)})==="1")` +
  `document.documentElement.setAttribute(` +
  `${JSON.stringify(SESSION_HINT_ATTRIBUTE)},${JSON.stringify(SESSION_HINT_RESTORING)})}catch{}`;

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

export function subscribeToHint(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Storage throws in Safari's private mode rather than being absent. */
export function readHint(): SessionHint {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1" ? "present" : "absent";
  } catch {
    return "absent";
  }
}

/**
 * What the server must answer, having no storage to consult.
 *
 * Reading the hint through `useSyncExternalStore` rather than in a `useState`
 * initialiser is what keeps hydration honest: the server has no storage, so it
 * must render the undecided bar; an initialiser would read the real value on the
 * client and hydrate different markup than the server sent. This hook is built
 * for precisely that split — it renders this snapshot while hydrating and
 * reconciles to the client's value immediately after, in one extra render rather
 * than a mismatch.
 */
export const hintUnknownOnServer = (): SessionHint => "unknown";

export function writeHint(exists: boolean): void {
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
