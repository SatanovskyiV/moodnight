import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { ACCESS_STRATEGY } from "./jwt.strategy";
import { REFRESH_STRATEGY } from "./jwt-refresh.strategy";

/**
 * The two Passport guards, named so a controller reads as what it requires
 * rather than as a string.
 *
 * They are applied per controller with `@UseGuards(...)` and never registered
 * globally. That is the same argument main.ts makes for the zod pipes: a global
 * registration is invisible from the route it protects, and it would mean a
 * spec assembling a bare testing module no longer matches production. The cost
 * is worth naming — a new controller that forgets the decorator is open, so
 * adding one is a moment to check.
 */

/** Requires a valid `Authorization: Bearer` access token. 401 otherwise. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(ACCESS_STRATEGY) {}

/**
 * Requires a valid refresh cookie, and that the account's `tokenVersion` still
 * matches the one inside it. 401 otherwise.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard(REFRESH_STRATEGY) {}
