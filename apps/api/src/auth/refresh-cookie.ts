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
 * Where the cookie is sent. Only the three routes that redeem or clear it live
 * under `/auth`, so every other request to this API — every read of `/users`,
 * every poem fetched once Phase 2 lands — travels without it.
 */
const REFRESH_COOKIE_PATH = "/auth";

/**
 * Options for the refresh cookie, which differ between local development and
 * production for a reason worth spelling out, because getting it wrong fails
 * only after deployment.
 *
 * **Locally**, the web app on `localhost:3000` and this API on `localhost:3001`
 * are *same-site*: ports do not enter into the same-site comparison, only the
 * registrable domain does. `SameSite=Lax` therefore works, and `Secure` must
 * stay off because dev runs over plain http.
 *
 * **In production**, the two Vercel projects are different subdomains of
 * `vercel.app` — and `vercel.app` is on the Public Suffix List, so those
 * subdomains are *cross-site* to each other exactly as `example.com` and
 * `example.org` would be. A `SameSite=Lax` cookie is simply not sent on those
 * requests and sign-in silently stops working. `SameSite=None` is what allows
 * it, and browsers only accept `SameSite=None` together with `Secure`.
 *
 * The pair moves together, which is why this is one function and not two
 * settings someone can set inconsistently.
 */
export function refreshCookieOptions(maxAgeSeconds?: number): CookieOptions {
  const crossSite = process.env.NODE_ENV === "production";

  return {
    // No script on any page can read this, which is the whole reason the
    // refresh token lives in a cookie rather than in the response body.
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite,
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
  };
}
