import type { CookieOptions } from "express";

/**
 * The cookie carrying the refresh token.
 *
 * Named without a `__Host-` or `__Secure-` prefix on purpose: those prefixes
 * forbid a `Path` other than `/`, and scoping this cookie to the auth routes is
 * worth more here than the prefix's guarantees, which `Secure` + `SameSite`
 * below already provide in production.
 */
export const REFRESH_COOKIE = "moodnight_refresh";

/**
 * Where the cookie is sent — expressed as the browser sees it, which is not
 * where this app mounts the routes.
 *
 * The three routes that redeem or clear the cookie are `/auth/refresh`,
 * `/auth/logout` and the two that issue it, so scoping it keeps it off every
 * other request to this API: every read of `/users`, every poem fetched once
 * Phase 2 lands. But `Path` is matched against the URL in the address bar, and
 * apps/web reaches this API through a same-origin `/api` proxy — so the browser
 * knows those routes as `/api/auth/...` and a cookie pathed `/auth` would never
 * come back. The prefix belongs to the rewrite in apps/web/next.config.ts;
 * change it there and this must move with it.
 *
 * The cost is paid by anything that calls this API directly and therefore sees
 * `/auth/...`: Swagger UI cannot exercise `refresh` or `logout` from the
 * browser, though `login` still works and still shows the session. curl matches
 * cookie paths too, which is why the README's walkthrough goes through the
 * proxy rather than at `:3001`.
 */
const REFRESH_COOKIE_PATH = "/api/auth";

/**
 * Options for the refresh cookie.
 *
 * `SameSite=Lax` everywhere, because after the `/api` proxy the browser only
 * ever sends this cookie to the origin it is already on. It used to be
 * `SameSite=None; Secure` in production — the two Vercel projects are different
 * subdomains of `vercel.app`, which the Public Suffix List makes *cross-site*,
 * so `Lax` genuinely would not have been sent. What that missed is that
 * `SameSite=None` only asks permission; the browser still has to grant it, and
 * Safari has refused all third-party cookies since 13.1, as do Chrome's
 * incognito windows and Brave. Sign-in worked, the cookie was dropped, and the
 * next reload showed "sign in" — but only for some people, on some browsers,
 * after deployment.
 *
 * Proxying was the fix, and it makes this simple again: same-site in
 * development and production alike, with `Secure` the only thing that varies,
 * because dev runs over plain http and a `Secure` cookie there is not stored at
 * all.
 */
export function refreshCookieOptions(maxAgeSeconds?: number): CookieOptions {
  return {
    // No script on any page can read this, which is the whole reason the
    // refresh token lives in a cookie rather than in the response body.
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
  };
}
