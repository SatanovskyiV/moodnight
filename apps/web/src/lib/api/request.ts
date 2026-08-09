import { heldAccessToken } from "./access-token";
import { ApiRequestError } from "./error";

/**
 * What every API path is prefixed with — which is deliberately not the same
 * thing on both sides of the render.
 *
 * **In the browser it is a path, not a URL.** Requests go to this app's own
 * origin and the rewrite in next.config.ts forwards them to the API. That is
 * not a convenience: it is the only reason the refresh cookie survives, because
 * a cookie from the api project's separate `vercel.app` subdomain is a
 * third-party cookie and Safari drops those on the floor. The whole argument is
 * written out at that rewrite.
 *
 * **On the server there is no proxy to go through** — a Server Component
 * rendering on Vercel is not a browser and has no origin to make a path
 * relative to, so it calls the API directly. Nothing does that yet; Phase 2's
 * ISR pages will, and a relative URL would fail there with a parse error rather
 * than anything that names its cause.
 *
 * No guard for a missing `API_ORIGIN` here, because next.config.ts already
 * refuses to build without it — the proxy needs the same value, and one place
 * that stops the build is better than two that disagree about whether to.
 */
const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_ORIGIN ?? "http://localhost:3001").replace(/\/+$/, "")
    : "/api";

/**
 * The one function every generated endpoint in `generated/` calls.
 *
 * orval writes the per-endpoint code — paths, methods, request and response
 * types, all read out of apps/api/openapi.json — and calls this for the part it
 * cannot know: how *this* app talks to *this* API. Everything below is a
 * decision about that, which is why it is hand-written and the endpoints are
 * not. Adding an endpoint to the API adds no code here.
 *
 * The `{ data, status, headers }` shape is orval's, not a choice: each generated
 * operation declares a union over the statuses it documents, and this builds the
 * member the response turned out to be. Since only 2xx gets this far, that is
 * always the successful member — `payload` in ./error is what says so in types.
 *
 * `credentials: "include"` is kept even though {@link API_BASE} now makes every
 * browser request same-origin, where `same-origin` — the default — would do.
 * `include` is what a server-side call would need if one ever went cross-origin,
 * and leaving it says the cookie is part of the contract rather than an accident
 * of where the API happens to be mounted this month.
 *
 * It is spread before `init` rather than after so a generated call could
 * override it. None do, and none should — but the ordering says which one is
 * the default and which is the instruction.
 *
 * **The access token rides here too**, out of ./access-token, because the API
 * reads it from the `Authorization` header and from nowhere else — the refresh
 * cookie is pathed `/api/auth` and never reaches `/api/users`. Attaching it in
 * this one place is what makes every generated endpoint authenticated without a
 * line of code per endpoint, in exactly the way the error handling below is.
 * An unauthenticated call is one made while nobody is signed in, not one that
 * opted out.
 *
 * **Anything that is not a 2xx throws an {@link ApiRequestError}**, which is
 * what makes the generated react-query hooks work as react-query hooks: a
 * rejected query function is the only thing that populates `error`, stops a
 * retry, or leaves `isSuccess` false. Doing it here rather than in each hook is
 * what keeps that true of every endpoint, including ones not written yet.
 */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const token = heldAccessToken();

  try {
    response = await fetch(`${API_BASE}${url}`, {
      credentials: "include",
      ...init,
      // Spread after `init` because `init` carries a `headers` of its own —
      // orval's generated writes set `Content-Type` there — and spreading the
      // whole object would drop the token along with it. Merged rather than
      // replaced, and `Authorization` written first so a caller could still
      // override it, which is the same ordering rule `credentials` follows above.
      //
      // Absent, not empty, when there is no session: `Authorization: Bearer null`
      // is a malformed credential, and the public routes would start being asked
      // to reject one instead of never being offered one.
      headers: token ? { Authorization: `Bearer ${token}`, ...init?.headers } : init?.headers,
    });
  } catch {
    // `fetch` rejects only for a request that never got an answer — the API is
    // down, DNS failed, the origin was refused by CORS. Every answer the server
    // did give, including a 500, arrives as a resolved response below.
    throw ApiRequestError.unreachable();
  }

  const data = await body(response);

  if (response.status < 200 || response.status >= 300) {
    // The generated types call the body `void` for every documented error
    // status, which is true of what a caller should read but not of what
    // arrives: Nest sends a `{ statusCode, message, error }` body with those,
    // and `ApiRequestError.http` is what reads it.
    throw ApiRequestError.http(response.status, data);
  }

  return { data, status: response.status, headers: response.headers } as T;
}

/**
 * The response body, parsed if there is one.
 *
 * Read as text first and parsed only if non-empty: `POST /auth/logout` answers
 * 204 with no body at all, and `response.json()` on an empty one throws. Bodies
 * that are not JSON — HTML from a proxy that never reached the API — come back
 * as the raw string rather than throwing, because this runs on the failure path
 * as often as the success one and must not fail a second time there. A stream
 * that dies mid-body is the same story: the status is what the caller above
 * acts on, and losing the body must not cost it that.
 */
async function body(response: Response): Promise<unknown> {
  let text: string;

  try {
    text = await response.text();
  } catch {
    return undefined;
  }

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
