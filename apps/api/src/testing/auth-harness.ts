import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { UserRole } from "@moodnight/shared";

import { JwtRefreshStrategy } from "../auth/jwt-refresh.strategy";
import { JwtStrategy } from "../auth/jwt.strategy";
import { RolesGuard } from "../auth/roles.guard";
import { TokensService } from "../auth/tokens.service";
import { USER_ID } from "./prisma-mock";

/**
 * The pieces a spec needs in order to send an authenticated request.
 *
 * Secrets are set on `process.env` rather than stubbed into a fake
 * `ConfigService`, so the real `ConfigModule` and the real `TokensService` run
 * exactly as they do in production — including the boot-time check that both
 * secrets exist. A test that mocked those away would be asserting against a
 * different application than the one that ships.
 *
 * The two values differ, which is the property under test in more than one
 * place: a refresh token must not verify as an access token.
 */
export const TEST_ACCESS_SECRET = "test-access-secret-not-used-anywhere-real";
export const TEST_REFRESH_SECRET = "test-refresh-secret-not-used-anywhere-real";

/**
 * Everything the auth layer needs, ready to spread into a testing module's
 * `imports` and `providers`.
 *
 * `ConfigModule.forRoot({ ignoreEnvFile: true })` matters: without it the module
 * reads apps/api/.env, and a developer's real secrets would leak into the test
 * run and make its results depend on a file that is not committed.
 */
export function authTestImports() {
  process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;

  return [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    PassportModule,
    JwtModule.register({}),
  ];
}

/** The providers behind `JwtAuthGuard`, `JwtRefreshGuard` and `RolesGuard`. */
export const authTestProviders = [TokensService, JwtStrategy, JwtRefreshStrategy, RolesGuard];

/**
 * Mints a real access token for a role — signed by the same `TokensService` the
 * application uses, so a spec exercises signature verification rather than a
 * mock that always says yes.
 */
export async function accessTokenFor(
  tokens: TokensService,
  role: UserRole,
  userId = USER_ID,
): Promise<string> {
  return tokens.signAccess(userId, role);
}

/** `.set(...bearer(token))` — supertest's header pair, spelled once. */
export function bearer(token: string): [string, string] {
  return ["authorization", `Bearer ${token}`];
}
