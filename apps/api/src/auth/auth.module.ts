import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtRefreshStrategy } from "./jwt-refresh.strategy";
import { JwtStrategy } from "./jwt.strategy";
import { RolesGuard } from "./roles.guard";
import { TokensService } from "./tokens.service";

/**
 * `JwtModule.register({})` with no secret and no options is deliberate. Every
 * secret and every TTL is passed per call in `TokensService`, because there are
 * two of each and a module-level default would be the wrong one half the time —
 * silently, since a token signed with the access secret and called a refresh
 * token still verifies against the access secret.
 *
 * The guards are exported rather than registered globally: a controller states
 * what it requires with `@UseGuards`, which keeps main.ts free of global
 * registrations and lets a spec assemble a bare module that still behaves the
 * way production does.
 */
@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy, JwtRefreshStrategy, RolesGuard],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
