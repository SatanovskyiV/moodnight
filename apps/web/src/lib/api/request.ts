import { ApiRequestError } from "./error";

/**
 * Where the NestJS API lives, decided once at build time.
 *
 * The fallback is scoped to development on purpose. `NEXT_PUBLIC_*` values are
 * inlined into the bundle by `next build`, so a production build with this unset
 * would ship a browser bundle asking every visitor's own machine for the API —
 * a deploy that looks green and is entirely broken. Throwing here fails the
 * build instead, the same trade apps/api makes with its JWT secrets. Locally the
 * default matches the port `pnpm dev` uses, so no `.env.local` is needed to run
 * the site (see apps/web/.env.example).
 */
export const API_URL = (() => {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_API_URL is not set — the browser has no API to call.");
    }

    return "http://localhost:3001";
  }

  // A configured value ending in `/` would otherwise produce `//auth/login`,
  // which some hosts answer and some 404.
  return configured.replace(/\/+$/, "");
})();

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
 * `credentials: "include"` is the load-bearing option: register, login and
 * refresh all answer with a `Set-Cookie` carrying the refresh token, and without
 * this the browser drops it — sign-in appears to work and the session evaporates
 * on the next reload. It is also why apps/api enables CORS against an explicit
 * origin list with `credentials: true`; neither half works alone.
 *
 * It is spread before `init` rather than after so a generated call could
 * override it. None do, and none should — but the ordering says which one is
 * the default and which is the instruction.
 *
 * **Anything that is not a 2xx throws an {@link ApiRequestError}**, which is
 * what makes the generated react-query hooks work as react-query hooks: a
 * rejected query function is the only thing that populates `error`, stops a
 * retry, or leaves `isSuccess` false. Doing it here rather than in each hook is
 * what keeps that true of every endpoint, including ones not written yet.
 */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${url}`, { credentials: "include", ...init });
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
