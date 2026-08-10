import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Actor } from "@moodnight/shared";
import type { Request } from "express";
import { Strategy } from "passport-jwt";

import { UsersService } from "../users/users.service";
import { REFRESH_COOKIE } from "./refresh-cookie";
import type { RefreshPayload } from "./tokens.service";

export const REFRESH_STRATEGY = "jwt-refresh";

/**
 * An actor, plus the token version this strategy has just verified against the
 * row — carried through so `AuthService.refresh` can sign the next token
 * without reading the same column again.
 */
export type RefreshActor = Actor & { tokenVersion: number };

/**
 * Reads the refresh token out of its httpOnly cookie, which is the only place
 * it is ever kept — it is never in a response body, so it never passes through
 * JavaScript on the page.
 */
function fromRefreshCookie(request: Request): string | null {
  // `cookies` is populated by `cookie-parser`, registered in main.ts. Typed as
  // possibly absent because a request that never went through that middleware
  // — anything constructed in a test, say — must read as "no token" rather
  // than throw.
  const cookies = request.cookies as Record<string, string | undefined> | undefined;

  return cookies?.[REFRESH_COOKIE] ?? null;
}

/**
 * Verifies a refresh token, and unlike the access strategy it **does** read the
 * database.
 *
 * That read is the whole revocation mechanism. A refresh token carries the
 * account's `tokenVersion` from the moment it was issued; signing out
 * increments the column, and every token issued before then stops matching. No
 * sessions table, no write on the refresh path itself — one indexed lookup by
 * primary key, on a route that runs once every access-token lifetime rather
 * than on every request.
 *
 * The same read is what makes a demotion or a deletion take effect: the role
 * that goes into the next access token comes from the row, not from the token
 * being redeemed.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, REFRESH_STRATEGY) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: fromRefreshCookie,
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_REFRESH_SECRET")!,
    });
  }

  async validate(payload: RefreshPayload): Promise<RefreshActor> {
    if (payload.type !== "refresh") {
      throw new UnauthorizedException("That is not a refresh token.");
    }

    const account = await this.users.findForRefresh(payload.sub);

    // One message for "the account is gone", "the account was deactivated" and
    // "the token was revoked" — the holder of a rejected token is owed the fact
    // that it no longer works, not a way to probe which accounts still exist.
    //
    // The `active` check is not made redundant by the version check beside it.
    // Deactivating an account increments `tokenVersion` in the same write, so
    // every token issued before it stops matching — but a token minted in the
    // moment between that write and this read would carry the new version and
    // pass. Reading the column is what makes deactivation immediate rather than
    // almost immediate.
    if (!account || !account.active || account.tokenVersion !== payload.ver) {
      throw new UnauthorizedException("That session has ended. Sign in again.");
    }

    return { id: account.id, role: account.role, tokenVersion: account.tokenVersion };
  }
}
