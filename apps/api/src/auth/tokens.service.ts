import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import type { UserRole } from "@moodnight/shared";

/**
 * A lifetime as jsonwebtoken accepts one — seconds, or one of the duration
 * strings the `ms` package parses ("15m", "1h", "30d").
 *
 * Taken from the library's own option type rather than declared as `string`,
 * because it is not one: `ms` narrows its argument to a template-literal union,
 * and a plain `string` does not satisfy it.
 */
type Ttl = NonNullable<JwtSignOptions["expiresIn"]>;

/**
 * How long each kind of token lives, when the environment does not say.
 *
 * The access token is short because nothing checks it against the database:
 * verifying one is pure signature arithmetic, which is what keeps a guarded
 * route as cheap as an open one, and the price of that is a window in which a
 * demoted or deleted account still passes. Fifteen minutes is that window.
 */
const DEFAULT_ACCESS_TTL: Ttl = "15m";
const DEFAULT_REFRESH_TTL: Ttl = "30d";

/** Distinguishes the two payloads beyond the fact that they are signed differently. */
type TokenType = "access" | "refresh";

/** What an access token carries — everything a guard needs, and nothing else. */
export interface AccessPayload {
  sub: string;
  role: UserRole;
  type: "access";
}

/**
 * What a refresh token carries. `ver` is the account's `tokenVersion` at the
 * moment of issue; the refresh strategy compares it against the column and
 * refuses the token if they have diverged, which is how signing out revokes.
 */
export interface RefreshPayload {
  sub: string;
  ver: number;
  type: "refresh";
}

/**
 * Signs and verifies the two token kinds.
 *
 * They use **separate secrets**, which is what stops a refresh token — long
 * lived, and sitting in a cookie sent to this API on every auth request — from
 * being presented as an access token. The `type` claim says the same thing a
 * second way: if the two secrets are ever misconfigured to the same value, the
 * claim is still there to catch it.
 *
 * `JwtService` is used with explicit per-call options rather than a configured
 * default, so neither kind can inherit the other's secret by omission.
 */
@Injectable()
export class TokensService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: Ttl;
  private readonly refreshTtl: Ttl;
  private accessLifetime?: Promise<number>;
  private refreshLifetime?: Promise<number>;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    // Read and checked in the constructor, so a deployment missing a secret
    // fails at boot with a message naming the variable — rather than starting
    // happily and signing every token with `undefined`. Same argument, and the
    // same shape, as the DATABASE_URL check in packages/db's client.ts.
    this.accessSecret = requireSecret(config, "JWT_ACCESS_SECRET");
    this.refreshSecret = requireSecret(config, "JWT_REFRESH_SECRET");
    this.accessTtl = readTtl(config, "JWT_ACCESS_TTL", DEFAULT_ACCESS_TTL);
    this.refreshTtl = readTtl(config, "JWT_REFRESH_TTL", DEFAULT_REFRESH_TTL);
  }

  signAccess(userId: string, role: UserRole): Promise<string> {
    return this.sign<AccessPayload>(
      { sub: userId, role, type: "access" },
      this.accessSecret,
      this.accessTtl,
    );
  }

  signRefresh(userId: string, tokenVersion: number): Promise<string> {
    return this.sign<RefreshPayload>(
      { sub: userId, ver: tokenVersion, type: "refresh" },
      this.refreshSecret,
      this.refreshTtl,
    );
  }

  /**
   * Seconds until a freshly signed access token expires — the `expiresIn` a
   * client is handed so it can refresh before being turned away rather than
   * after.
   *
   * Derived by signing an empty payload and reading the claims back, so it
   * cannot drift from the TTL actually applied above however the environment
   * spells it ("15m", "900", "1h"). Computed once: the TTL cannot change while
   * the process runs.
   */
  async accessLifetimeSeconds(): Promise<number> {
    this.accessLifetime ??= this.measure(this.accessSecret, this.accessTtl);

    return this.accessLifetime;
  }

  /**
   * The same, for the refresh token — which is what the cookie's `Max-Age` is
   * set from, so the browser discards it at the moment the signature stops
   * verifying instead of holding a cookie that can only ever produce a 401.
   */
  async refreshLifetimeSeconds(): Promise<number> {
    this.refreshLifetime ??= this.measure(this.refreshSecret, this.refreshTtl);

    return this.refreshLifetime;
  }

  /** Throws `JsonWebTokenError`/`TokenExpiredError` on anything invalid. */
  async verifyAccess(token: string): Promise<AccessPayload> {
    return this.expectType(
      await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.accessSecret }),
      "access",
    );
  }

  /** Throws `JsonWebTokenError`/`TokenExpiredError` on anything invalid. */
  async verifyRefresh(token: string): Promise<RefreshPayload> {
    return this.expectType(
      await this.jwt.verifyAsync<RefreshPayload>(token, { secret: this.refreshSecret }),
      "refresh",
    );
  }

  private sign<Payload extends object>(
    payload: Payload,
    secret: string,
    expiresIn: Ttl,
  ): Promise<string> {
    return this.jwt.signAsync(payload, { secret, expiresIn });
  }

  private async measure(secret: string, expiresIn: Ttl): Promise<number> {
    const token = await this.sign({}, secret, expiresIn);
    const { exp, iat } = this.jwt.decode<{ exp: number; iat: number }>(token);

    return exp - iat;
  }

  private expectType<Payload extends { type: TokenType }>(
    payload: Payload,
    expected: TokenType,
  ): Payload {
    if (payload.type !== expected) {
      throw new Error(`Expected ${expected} token, got ${payload.type}.`);
    }

    return payload;
  }
}

/**
 * A TTL from the environment, or the default when it is unset.
 *
 * The cast is unavoidable and narrow. `Ttl` is a template-literal union — `ms`
 * enumerates every spelling of a duration it accepts — and a value read from
 * the environment is an arbitrary string that TypeScript cannot check against
 * it. What does check it is jsonwebtoken, at the first `sign`: a TTL that `ms`
 * cannot parse throws there, at boot rather than mid-request, because
 * `TokensService` measures both lifetimes on the first session it issues.
 */
function readTtl(config: ConfigService, name: string, fallback: Ttl): Ttl {
  return (config.get<string>(name) as Ttl | undefined) ?? fallback;
}

function requireSecret(config: ConfigService, name: string): string {
  const secret = config.get<string>(name);

  if (!secret) {
    throw new Error(
      `${name} is not set. Generate one with \`openssl rand -base64 48\` and put ` +
        `it in apps/api/.env (or in the deployment's environment). The access and ` +
        `refresh secrets must differ — see apps/api/.env.example.`,
    );
  }

  return secret;
}
