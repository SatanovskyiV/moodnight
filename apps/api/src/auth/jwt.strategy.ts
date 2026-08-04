import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { actorSchema, type Actor } from "@moodnight/shared";
import { ExtractJwt, Strategy } from "passport-jwt";

import type { AccessPayload } from "./tokens.service";

export const ACCESS_STRATEGY = "jwt";

/**
 * Reads the access token out of `Authorization: Bearer …` and turns it into the
 * {@link Actor} every guarded route sees on `request.user`.
 *
 * Passport rather than a hand-rolled guard because docs/ROADMAP.md plans Google
 * sign-in "as a later Passport strategy" — this is the structure that gives
 * that one somewhere to go.
 *
 * **No database round trip.** Everything a guard needs is in the payload, so a
 * guarded route costs a signature check and nothing else — which is what makes
 * putting guards on everything affordable on a scale-to-zero database. The
 * price is stated plainly in `TokensService`: a role change or a deletion is
 * invisible here until the token expires, which is why the access TTL is
 * minutes rather than days.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, ACCESS_STRATEGY) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Non-null asserted rather than checked: `TokensService` is constructed
      // by the same module and throws a message naming the variable if it is
      // missing, so this can never be the thing that reports it.
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  /**
   * Passport has already verified the signature and the expiry; what is left is
   * whether the payload is the shape this API signs.
   *
   * The `type` check is what stops a refresh token being presented as an access
   * token. The secrets differ, so a refresh token cannot verify here anyway —
   * this is the second lock, and it is the one that still holds if the two
   * secrets are ever misconfigured to the same value.
   */
  validate(payload: AccessPayload): Actor {
    if (payload.type !== "access") {
      throw new UnauthorizedException("That is not an access token.");
    }

    const actor = actorSchema.safeParse({ id: payload.sub, role: payload.role });

    if (!actor.success) {
      throw new UnauthorizedException("That token is malformed.");
    }

    return actor.data;
  }
}
