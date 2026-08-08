/**
 * Why a request did not return what was asked for.
 *
 * An exception rather than a value, and that is a decision made *for* react-query
 * rather than despite it: every piece of machinery in it — `isError`, `error`,
 * `retry`, `onError`, suspense boundaries — is driven by the query function
 * rejecting. A fetcher that resolved with `{ ok: false }` would look successful
 * to the cache, retry nothing, and leave every caller to re-derive failure by
 * hand, which is the arrangement this replaced.
 *
 * The HTTP status is kept rather than translated into named cases here, because
 * which statuses are *expected* is a fact about the endpoint, not about the
 * transport: a 401 is the ordinary answer to a wrong password and a bug
 * anywhere else. Each caller maps the statuses it documents and lets the rest
 * fall through to one unexpected-error path.
 */
export class ApiRequestError extends Error {
  /**
   * The status the API answered with, or `null` when there was no answer to
   * read — the API is down, DNS failed, the origin was refused by CORS. The
   * distinction matters to more than the message: a request that never arrived
   * is worth retrying and a 401 never is.
   */
  readonly status: number | null;

  /**
   * The strings a `ZodValidationPipe` 400 responds with. In practice a form
   * resolving the same schema should never see one, which is why it is
   * diagnostic detail rather than something to show a reader.
   */
  readonly issues: string[];

  private constructor(status: number | null, issues: string[]) {
    super(status === null ? "The API could not be reached." : `The API answered ${status}.`);
    this.name = "ApiRequestError";
    this.status = status;
    this.issues = issues;
  }

  /** An answer arrived and it was not a success. */
  static http(status: number, body: unknown): ApiRequestError {
    return new ApiRequestError(status, issues(body));
  }

  /** No answer arrived at all. */
  static unreachable(): ApiRequestError {
    return new ApiRequestError(null, []);
  }

  /** Whether the request never got an answer, which is the retryable failure. */
  get isUnreachable(): boolean {
    return this.status === null;
  }
}

/**
 * Whether a caught value is this API answering with a particular status.
 *
 * `catch` and react-query's `error` are both `unknown`-shaped in practice — a
 * query function can throw anything — so the instance check belongs here rather
 * than at each of the call sites that only want to ask "was that the 401?".
 */
export function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiRequestError && error.status === status;
}

/** What `request` resolves to, which is what every generated endpoint returns. */
type Envelope = { status: number; data: unknown; headers: Headers };

/**
 * The member of a generated response union that carries the answer, picked out
 * by status. 200, 201 and 204 are the three this API succeeds with — see the
 * `@HttpCode` on each route in apps/api — and the rest of the union is the
 * documented failures.
 */
type Succeeded<R> = Extract<R, { status: 200 | 201 | 204 }>;

/**
 * The body out of a generated response.
 *
 * Every generated operation is typed as a union over the statuses it documents,
 * including the failures, so `response.data` on one of them is `Session | void`
 * and unusable. Since `request` now throws for everything outside 2xx, the
 * member that actually resolved is always the successful one — this states that
 * in the type system, in one place, instead of at every call site.
 *
 *     const { data } = useLogin({ mutation: { onSuccess: (r) => signIn(payload(r)) } });
 *
 * The type flows from the generated response: `payload` of a `loginResponse` is
 * a `Session` and of a `logoutResponse` is `void`, without either being written
 * down anywhere.
 */
export function payload<R extends Envelope>(response: R): Succeeded<R>["data"] {
  return response.data as Succeeded<R>["data"];
}

/**
 * Pulls the `message` array off a Nest error body, tolerating anything that is
 * not one. An error path must not throw on its way to reporting an error, so
 * every unexpected shape — HTML from a proxy, an empty body, a plain string
 * message — becomes an empty list rather than a second failure.
 */
function issues(body: unknown): string[] {
  if (body && typeof body === "object" && "message" in body) {
    const { message } = body as { message: unknown };

    if (Array.isArray(message)) {
      return message.filter((entry): entry is string => typeof entry === "string");
    }

    if (typeof message === "string") {
      return [message];
    }
  }

  return [];
}
