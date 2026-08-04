import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type Actor,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
  type Session,
  type User,
} from "@moodnight/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { zodRef } from "../swagger/openapi-schemas";
import { AuthService, type IssuedSession } from "./auth.service";
import { CurrentUser } from "./decorators";
import { JwtAuthGuard, JwtRefreshGuard } from "./guards";
import type { RefreshActor } from "./jwt-refresh.strategy";
import { REFRESH_COOKIE, refreshCookieOptions } from "./refresh-cookie";

/**
 * Registering, signing in, refreshing and signing out.
 *
 * `GET /auth/me` lives here rather than at `/users/me`, and not only for
 * tidiness: a literal segment declared after `/users/:id` would be swallowed by
 * the parameter route, which is the trap the comment in users.controller.ts has
 * been warning about since Phase 2. Keeping the current account under `/auth`
 * means the users controller stays a plain admin resource with no special case
 * in it.
 *
 * Every route that hands out a session sets the refresh cookie through
 * {@link sendSession}, so the cookie's flags are decided in exactly one place —
 * see refresh-cookie.ts, where getting them wrong only shows up in production.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({
    summary: "Register an account",
    description:
      "Creates an account and signs it in. New accounts are always AUTHOR — " +
      "this endpoint has no way to ask for anything else. The response carries " +
      "a short-lived access token; the refresh token is set as an httpOnly cookie.",
  })
  @ApiBody({ schema: zodRef("Register") })
  @ApiCreatedResponse({ description: "The new session.", schema: zodRef("Session") })
  @ApiBadRequestResponse({ description: "The body does not match the schema." })
  @ApiConflictResponse({ description: "That email is already registered." })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session> {
    return sendSession(response, await this.auth.register(input));
  }

  @Post("login")
  // 200 rather than Nest's 201 default for a POST: this creates no resource,
  // it exchanges credentials for a token.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in",
    description:
      "Exchanges an email and password for a session. Every failure — unknown " +
      "address, no password set, wrong password — is the same 401 taking the " +
      "same time, so this endpoint cannot be used to discover who has an account.",
  })
  @ApiBody({ schema: zodRef("Login") })
  @ApiOkResponse({ description: "The new session.", schema: zodRef("Session") })
  @ApiBadRequestResponse({ description: "The body does not match the schema." })
  @ApiUnauthorizedResponse({ description: "The credentials are not valid." })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session> {
    return sendSession(response, await this.auth.login(input));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: "Renew the access token",
    description:
      "Reads the refresh cookie and issues a new access token, re-setting the " +
      "cookie with a fresh lifetime. The role comes from the account as it is " +
      "now, so a change of role takes effect on the next renewal rather than " +
      "when the cookie eventually expires.",
  })
  @ApiOkResponse({ description: "The renewed session.", schema: zodRef("Session") })
  @ApiUnauthorizedResponse({ description: "The cookie is missing, expired, or revoked." })
  async refresh(
    @CurrentUser() actor: RefreshActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session> {
    return sendSession(response, await this.auth.refresh(actor));
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: "Sign out",
    description:
      "Revokes every refresh token for the account — on every device, which is " +
      "the deliberate trade for storing no sessions — and clears the cookie. " +
      "Access tokens already issued keep working until they expire, which is minutes.",
  })
  @ApiNoContentResponse({ description: "The session is over." })
  @ApiUnauthorizedResponse({ description: "The cookie is missing, expired, or already revoked." })
  async logout(
    @CurrentUser() actor: Actor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(actor);

    // Cleared with the same flags it was set with. A `Set-Cookie` whose path or
    // SameSite differs from the original does not replace it — the browser
    // keeps the old one and the sign-out appears to do nothing.
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({
    summary: "The signed-in account",
    description: "Read from the database on every call, so it is never a stale copy of the token.",
  })
  @ApiOkResponse({ description: "The current user.", schema: zodRef("User") })
  @ApiUnauthorizedResponse({ description: "No valid access token." })
  me(@CurrentUser() actor: Actor): Promise<User> {
    return this.auth.me(actor);
  }
}

/**
 * Puts the refresh token in its cookie and returns the part of the session that
 * belongs in the body.
 *
 * The split is the point: `refreshToken` never appears in a response body, so
 * it never passes through JavaScript on the page and cannot be read out of
 * storage by a script that gets injected into it.
 */
function sendSession(
  response: Response,
  { session, refreshToken, refreshMaxAge }: IssuedSession,
): Session {
  response.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshMaxAge));

  return session;
}
