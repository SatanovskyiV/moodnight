/**
 * The access token the next request will carry, held where a plain function can
 * reach it.
 *
 * The session lives in the query cache under `sessionQueryKey`
 * (components/session), and `accessToken` has been on it since the auth routes
 * landed — but `request` in ./request is not a component and cannot call a hook,
 * so until now nothing ever put it on a request. Every call this app made was
 * either public (`login`, `register`) or authenticated by the refresh cookie
 * (`refresh`, `logout`); `GET /users` is the first that needs the header, and
 * the API reads it from nowhere else (`ExtractJwt.fromAuthHeaderAsBearerToken`
 * in apps/api/src/auth/jwt.strategy.ts, with no cookie fallback).
 *
 * A module variable rather than a parameter threaded through orval's generated
 * calls: the generated code takes a `request` option per call site, and using it
 * would mean every future hook remembering to pass the token — the one
 * arrangement guaranteed to be got wrong once. One holder, written in one place,
 * read in one place.
 *
 * **Never on the server.** A module-scope mutable in a Vercel function is shared
 * by every request that process handles, so a token written by one reader would
 * be read by the next — the one bug in this file that would matter. The guards
 * below make that impossible rather than merely unlikely; nothing server-side
 * has a token to hold anyway, since the refresh cookie is pathed `/api/auth` and
 * never reaches a Server Component.
 */
let held: string | null = null;

/** Called by `SessionProvider` whenever the session changes, `null` included. */
export function holdAccessToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  held = token;
}

/** What `request` should send, or `null` for an unauthenticated call. */
export function heldAccessToken(): string | null {
  return typeof window === "undefined" ? null : held;
}
