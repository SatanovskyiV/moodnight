import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { authTestImports, authTestProviders } from "../testing/auth-harness";
import {
  createPrismaMock,
  credentialRow,
  FIXTURE_PASSWORD,
  FIXTURE_PASSWORD_HASH,
  type PrismaMock,
  sessionRow,
  USER_ID,
  userRow,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import type * as PasswordModule from "./password";
import { dummyVerify, hashPassword, verifyPassword } from "./password";
import { TokensService } from "./tokens.service";

/**
 * The real password functions, wrapped in spies.
 *
 * Not stubs — every implementation below is the genuine one, so the hashing
 * block still exercises argon2 rather than a fake of it. The wrapper exists so
 * one test can ask *whether* the verification ran, which is the only way to
 * assert that a rejection paid the same cost as a successful sign-in. Timing it
 * would be the direct measurement and a flaky one.
 */
vi.mock("./password", async (importOriginal) => {
  const actual = await importOriginal<typeof PasswordModule>();

  return {
    ...actual,
    verifyPassword: vi.fn(actual.verifyPassword),
    dummyVerify: vi.fn(actual.dummyVerify),
  };
});

/**
 * The parts of signing in that are not visible over HTTP: what the tokens
 * actually contain, and what hashing promises.
 *
 * The status codes and the cookie headers are covered in auth.controller.spec.ts;
 * the two files divide on that line, the same way the users pair does.
 */
describe("AuthService", () => {
  let auth: AuthService;
  let tokens: TokensService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    // The module mock above outlives each test, unlike `prisma`, which is built
    // fresh. Clearing the call history — not the implementations — is what
    // keeps "was the password verified" a question about this test alone.
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      providers: [
        AuthService,
        UsersService,
        ...authTestProviders,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    auth = moduleRef.get(AuthService);
    tokens = moduleRef.get(TokensService);
  });

  describe("hashing", () => {
    it("round-trips a password and rejects a wrong one", async () => {
      const hash = await hashPassword(FIXTURE_PASSWORD);

      await expect(verifyPassword(hash, FIXTURE_PASSWORD)).resolves.toBe(true);
      await expect(verifyPassword(hash, "not-the-password")).resolves.toBe(false);
    });

    // The parameters live inside the PHC string, which is what lets the cost be
    // raised later without invalidating a single stored hash.
    it("produces an argon2id hash that carries its own parameters", async () => {
      const hash = await hashPassword(FIXTURE_PASSWORD);

      expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(hash).not.toContain(FIXTURE_PASSWORD);
    });

    // A row whose hash is not something argon2 can parse is a failed sign-in,
    // not a 500 — the caller typed a password, and the answer they are owed is
    // "no", not "the server is broken".
    it("answers false rather than throwing on a malformed stored hash", async () => {
      await expect(verifyPassword("not-a-hash", FIXTURE_PASSWORD)).resolves.toBe(false);
    });

    it("never verifies anything against the dummy hash", async () => {
      await expect(dummyVerify(FIXTURE_PASSWORD)).resolves.toBe(false);
      await expect(dummyVerify("")).resolves.toBe(false);
    });
  });

  describe("login", () => {
    const credentials = { email: "poet@moodnight.dev", password: FIXTURE_PASSWORD };

    it("issues an access token naming the account and its role", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow({ role: "EDITOR" }))
        .mockResolvedValueOnce(userRow({ role: "EDITOR" }));

      const { session } = await auth.login(credentials);
      const payload = await tokens.verifyAccess(session.accessToken);

      expect(payload).toMatchObject({ sub: USER_ID, role: "EDITOR", type: "access" });
    });

    it("reports the access token's real lifetime, not a hardcoded number", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow())
        .mockResolvedValueOnce(userRow());

      const { session } = await auth.login(credentials);

      // The default TTL is 15m and nothing in the test environment overrides it.
      expect(session.expiresIn).toBe(900);
    });

    it("stamps the account's current token version into the refresh token", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow({ tokenVersion: 7 }))
        .mockResolvedValueOnce(userRow());

      const { refreshToken } = await auth.login(credentials);

      expect(await tokens.verifyRefresh(refreshToken)).toMatchObject({ ver: 7, type: "refresh" });
    });

    // Four failures, one answer. The account that has never set a password is
    // the case worth naming: a null hash must read as "cannot sign in", never
    // as "no password required".
    it("refuses an account whose password hash is null", async () => {
      prisma.user.findUnique.mockResolvedValue(credentialRow({ passwordHash: null }));

      await expect(auth.login(credentials)).rejects.toMatchObject({ status: 401 });
    });

    /**
     * A retired account, holding the correct password. This is the whole point
     * of the column: the credential is still valid and still refused.
     */
    it("refuses a deactivated account even with the right password", async () => {
      prisma.user.findUnique.mockResolvedValue(credentialRow({ active: false }));

      await expect(auth.login(credentials)).rejects.toMatchObject({ status: 401 });
    });

    /**
     * The check has to sit *after* the argon2 verification, not before it.
     *
     * Returning early on a deactivated account would skip the work every other
     * rejection pays for, and the response would come back fast enough to tell
     * someone holding a list of addresses which of them are real accounts that
     * happen to be switched off. Asserting the hash was read is what pins the
     * ordering: a short-circuit would never have touched it.
     */
    it("still pays for the password check before refusing a deactivated account", async () => {
      prisma.user.findUnique.mockResolvedValue(
        credentialRow({ active: false, passwordHash: FIXTURE_PASSWORD_HASH }),
      );

      await expect(auth.login(credentials)).rejects.toMatchObject({ status: 401 });

      // An early `if (!account.active) throw` above the verification would fail
      // here, and nowhere else — the status code is identical either way.
      expect(vi.mocked(verifyPassword)).toHaveBeenCalledWith(
        FIXTURE_PASSWORD_HASH,
        FIXTURE_PASSWORD,
      );
    });

    it("refuses an address that is not registered", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(auth.login(credentials)).rejects.toMatchObject({ status: 401 });
    });

    it("verifies against the stored hash rather than re-hashing the input", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow({ passwordHash: FIXTURE_PASSWORD_HASH }))
        .mockResolvedValueOnce(userRow());

      await expect(auth.login(credentials)).resolves.toBeDefined();
    });
  });

  describe("the two token kinds", () => {
    /**
     * They are signed with different secrets, so neither verifies as the other.
     * This is the property the whole split exists for: the refresh token is
     * long-lived and travels to this API on every auth request, and it must not
     * be presentable as the credential that opens guarded routes.
     */
    it("cannot be verified as each other", async () => {
      const access = await tokens.signAccess(USER_ID, "AUTHOR");
      const refresh = await tokens.signRefresh(USER_ID, 0);

      await expect(tokens.verifyRefresh(access)).rejects.toThrow();
      await expect(tokens.verifyAccess(refresh)).rejects.toThrow();
    });

    it("carries no password material in either payload", async () => {
      const access = await tokens.signAccess(USER_ID, "AUTHOR");
      const refresh = await tokens.signRefresh(USER_ID, 0);

      for (const token of [access, refresh]) {
        const claims = Buffer.from(token.split(".")[1]!, "base64url").toString();

        expect(claims).not.toContain("password");
        expect(claims).not.toContain("argon2");
      }
    });
  });

  describe("logout", () => {
    it("moves the token version, which is what revokes the refresh tokens", async () => {
      prisma.user.update.mockResolvedValue({ id: USER_ID });

      await auth.logout({ id: USER_ID, role: "AUTHOR" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true },
      });
    });
  });

  describe("refresh", () => {
    // The role in the new access token comes from the row the refresh strategy
    // just read, not from the token being redeemed — so a demotion takes effect
    // on the next renewal rather than when a thirty-day cookie finally expires.
    it("re-reads the role rather than trusting the redeemed token", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ role: "AUTHOR" }));

      const { session } = await auth.refresh({ id: USER_ID, role: "ADMIN", tokenVersion: 3 });
      const payload = await tokens.verifyAccess(session.accessToken);

      expect(payload.role).toBe("AUTHOR");
    });

    it("keeps the verified token version, so the cookie stays valid", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      const { refreshToken } = await auth.refresh({
        id: USER_ID,
        role: "AUTHOR",
        tokenVersion: 3,
      });

      expect(await tokens.verifyRefresh(refreshToken)).toMatchObject({ ver: 3 });
    });
  });

  describe("register", () => {
    it("creates an AUTHOR by omitting the role entirely", async () => {
      prisma.user.create.mockResolvedValue(userRow());
      prisma.user.findUnique.mockResolvedValue(sessionRow());

      await auth.register({
        email: "New@Moodnight.dev",
        name: "Ольга",
        surname: "Кобилянська",
        password: FIXTURE_PASSWORD,
      });

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];

      expect(data).not.toHaveProperty("role");
      expect(data.email).toBe("new@moodnight.dev");
    });
  });
});
