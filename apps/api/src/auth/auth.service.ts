import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Actor, LoginInput, RegisterInput, Session, User } from "@moodnight/shared";

import { UsersService } from "../users/users.service";
import type { RefreshActor } from "./jwt-refresh.strategy";
import { dummyVerify, verifyPassword } from "./password";
import { TokensService } from "./tokens.service";

/** A signed session, plus the refresh token the controller turns into a cookie. */
export interface IssuedSession {
  session: Session;
  refreshToken: string;
  refreshMaxAge: number;
}

/**
 * Registering, signing in, refreshing and signing out.
 *
 * Deliberately thin: every read and write of the users table goes through
 * `UsersService`, which users.module.ts has exported since before this file
 * existed for exactly this reason — "so the Phase 3 auth module can look users
 * up through this service rather than opening its own path to the table". The
 * result is that email normalisation, password hashing and the duplicate-email
 * 409 are written once and registration inherits all three.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  /**
   * Public sign-up.
   *
   * `RegisterInput` carries no `role`, so the account created here can only
   * ever be an AUTHOR — not because this method forces one, but because there
   * is no value to pass and the column's default decides. Handing an
   * unauthenticated caller a schema that cannot express a role is a stronger
   * guarantee than checking one they were allowed to send.
   */
  async register(input: RegisterInput): Promise<IssuedSession> {
    const user = await this.users.create(input);

    // A fresh row's `tokenVersion` is the column's default, and this reads it
    // rather than assuming it is zero — the default is written in packages/db
    // and this file does not get a second opinion about it.
    return this.issue(user, await this.tokenVersionOf(user.id));
  }

  /**
   * Signing in, which answers 401 to everything that is not exactly right and
   * says no more than that.
   *
   * The four failures — no such address, an account with no password set, a
   * password that does not match, and a deactivated account — are one answer
   * and one duration. Anything finer grained would let someone with a list of
   * email addresses find out which of them are members here.
   */
  async login({ email, password }: LoginInput): Promise<IssuedSession> {
    const account = await this.users.findForAuth(email);

    // `dummyVerify` always resolves false; it is called for the time it spends,
    // so that a stranger's request costs what a member's does.
    const matches = account?.passwordHash
      ? await verifyPassword(account.passwordHash, password)
      : await dummyVerify(password);

    // `active` is checked here rather than before the verify, and the ordering
    // is the point: returning early on a deactivated account would skip the
    // argon2 work every other rejection pays for, and the response would come
    // back fast enough to tell an attacker that the address is real and the
    // account is merely switched off. It costs one comparison to fail at the
    // same speed as everything else.
    //
    // Someone whose account has been retired therefore reads "invalid email or
    // password", which is not the most helpful thing that could be said to
    // them. It is the same trade this method already makes for an account with
    // no password set: whatever explaining is owed, it is owed by a person,
    // through a channel that knows who they are.
    if (!account || !matches || !account.active) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    return this.issue(await this.users.findOne(account.id), account.tokenVersion);
  }

  /**
   * Exchanges a valid refresh cookie for a new access token, and re-issues the
   * cookie with a fresh lifetime — a sliding window, so someone who keeps
   * reading never gets logged out mid-sentence.
   *
   * The actor arrives from `JwtRefreshStrategy`, which has already checked the
   * signature, the expiry and the account's `tokenVersion`, and has read the
   * current role from the row rather than from the token — so the version it
   * verified is carried through here rather than read a second time.
   */
  async refresh(actor: RefreshActor): Promise<IssuedSession> {
    return this.issue(await this.users.findOne(actor.id), actor.tokenVersion);
  }

  /**
   * Signs out — by moving the account's `tokenVersion`, which stops every
   * refresh token ever issued for it from verifying.
   *
   * That is every device, not just this one, and it is the deliberate shape of
   * a design with no sessions table: the alternative, clearing the cookie
   * alone, would leave a stolen refresh token working for another thirty days
   * and call it a sign-out. Access tokens already issued still work until they
   * expire, which is minutes.
   */
  async logout(actor: Actor): Promise<void> {
    await this.users.revokeSessions(actor.id);
  }

  /** The signed-in account, re-read so `GET /auth/me` is never stale. */
  me(actor: Actor): Promise<User> {
    return this.users.findOne(actor.id);
  }

  /**
   * The one place a session is minted, so register, login and refresh cannot
   * drift into handing out subtly different ones.
   *
   * `tokenVersion` is a parameter rather than something read here: all three
   * callers have just read the row for their own reasons, and passing the
   * number they already hold keeps a sign-in to two queries instead of three.
   */
  private async issue(user: User, tokenVersion: number): Promise<IssuedSession> {
    // The two tokens carry different things and are signed with different
    // secrets — see TokensService. Only the access token reaches the response
    // body; the refresh token becomes an httpOnly cookie the page cannot read.
    const [accessToken, refreshToken, expiresIn, refreshMaxAge] = await Promise.all([
      this.tokens.signAccess(user.id, user.role),
      this.tokens.signRefresh(user.id, tokenVersion),
      this.tokens.accessLifetimeSeconds(),
      this.tokens.refreshLifetimeSeconds(),
    ]);

    return { session: { accessToken, expiresIn, user }, refreshToken, refreshMaxAge };
  }

  /** The account's current `tokenVersion`; used where the caller has not read one. */
  private async tokenVersionOf(id: string): Promise<number> {
    const account = await this.users.findForRefresh(id);

    // The row was created moments ago; a null here means it was deleted in
    // between, which is not a session to issue.
    if (!account) {
      throw new UnauthorizedException("That account no longer exists.");
    }

    return account.tokenVersion;
  }
}
