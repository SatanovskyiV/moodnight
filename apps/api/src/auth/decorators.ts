import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Actor, UserRole } from "@moodnight/shared";
import type { Request } from "express";

export const ROLES_KEY = "roles";

/**
 * The minimum role a route requires — `@Roles("ADMIN")` means "ADMIN or above",
 * so ROOT passes without being listed.
 *
 * Only meaningful next to a `JwtAuthGuard`, which is what puts an actor on the
 * request in the first place; `RolesGuard` refuses outright if there is none,
 * rather than reading a missing actor as an anonymous pass.
 */
export const Roles = (role: UserRole) => SetMetadata(ROLES_KEY, role);

/**
 * The authenticated caller, as the guard left it on the request.
 *
 * `@CurrentUser() actor: Actor` in a handler that sits behind `JwtAuthGuard` or
 * `JwtRefreshGuard`. Behind neither, it is `undefined` — which is why the
 * parameter's type says `Actor` only where a guard guarantees one.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<Request & { user: Actor }>().user,
);
