import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasRole, type Actor, type UserRole } from "@moodnight/shared";
import type { Request } from "express";

import { ROLES_KEY } from "./decorators";

/**
 * Enforces the `@Roles()` minimum, comparing against the shared `ROLE_RANK`
 * ladder so a route names the lowest role it will accept instead of listing
 * every role above it.
 *
 * Runs after `JwtAuthGuard` — the order in `@UseGuards(JwtAuthGuard, RolesGuard)`
 * is the order Nest executes them, and it matters: this guard needs the actor
 * that one puts on the request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Handler first, then class — so a controller can set a floor and a single
    // route can raise it.
    const required = this.reflector.getAllAndOverride<UserRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<Request & { user?: Actor }>();

    // No actor with a role requirement in force means the route was decorated
    // with `@Roles` but not with an authentication guard. Refusing is the only
    // safe reading: treating a missing actor as "nobody objected" would turn a
    // wiring mistake into an open endpoint.
    if (!user) {
      throw new UnauthorizedException("Sign in to use this.");
    }

    if (!hasRole(user.role, required)) {
      // Deliberately 403 and not 404. Hiding the route's existence would buy
      // nothing here — these paths are in the OpenAPI document at /docs — and
      // it would leave a legitimate editor unable to tell "you may not" from
      // "you typed it wrong".
      throw new ForbiddenException(`This is for ${required} accounts and above.`);
    }

    return true;
  }
}
