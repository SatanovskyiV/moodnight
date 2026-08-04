import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { authTestImports, authTestProviders } from "../testing/auth-harness";
import {
  createPrismaMock,
  credentialRow,
  FIXTURE_PASSWORD,
  type PrismaMock,
  sessionRow,
  USER_ID,
  userJson,
  userRow,
} from "../testing/prisma-mock";
import { UsersService } from "../users/users.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { REFRESH_COOKIE } from "./refresh-cookie";
import { TokensService } from "./tokens.service";

/**
 * The auth endpoints, over HTTP.
 *
 * Same trade as users.controller.spec.ts — only the database is faked — and for
 * the same reason: most of what these routes promise lives in the framework and
 * in the cookie headers, not in the handler bodies. Real tokens are signed and
 * really verified here; a mocked `TokensService` would let every assertion pass
 * against an application that never checks a signature.
 *
 * One thing does have to be mirrored from main.ts: `cookieParser`. It is the
 * only middleware main.ts registers, and without it `request.cookies` is
 * undefined and every refresh reads as "no token". That single line is the
 * whole of what this file has to remember.
 */
describe("Auth endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaMock;
  let tokens: TokensService;

  beforeAll(async () => {
    prisma = createPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: authTestImports(),
      controllers: [AuthController],
      providers: [
        AuthService,
        UsersService,
        ...authTestProviders,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    tokens = moduleRef.get(TokensService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** The `Set-Cookie` line for the refresh cookie, or undefined if there is none. */
  function refreshCookie(response: request.Response): string | undefined {
    const header = response.headers["set-cookie"];
    const lines = Array.isArray(header) ? header : header ? [header] : [];

    return lines.find((line) => line.startsWith(`${REFRESH_COOKIE}=`));
  }

  describe("POST /auth/register", () => {
    const body = {
      email: "New.Poet@Moodnight.dev",
      name: "Ольга",
      surname: "Кобилянська",
      password: FIXTURE_PASSWORD,
    };

    beforeEach(() => {
      prisma.user.create.mockResolvedValue(userRow());
      prisma.user.findUnique.mockResolvedValue(sessionRow());
    });

    it("creates the account, answers 201 and returns a session", async () => {
      const response = await http().post("/auth/register").send(body).expect(201);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
        user: userJson(),
      });
    });

    // The single most important assertion in this file. If the refresh token
    // ever appears in a response body, it becomes readable by any script on the
    // page and the httpOnly cookie stops being a protection.
    it("puts the refresh token in an httpOnly cookie and nowhere else", async () => {
      const response = await http().post("/auth/register").send(body).expect(201);
      const cookie = refreshCookie(response);

      expect(cookie).toBeDefined();
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/auth");
      expect(response.body).not.toHaveProperty("refreshToken");

      // The whole token, not a prefix of it: every JWT this API signs shares
      // the same base64 header, so comparing the first few characters would
      // match the access token in the body and fail against correct behaviour.
      const token = cookie!.split(";")[0]!.slice(REFRESH_COOKIE.length + 1);

      expect(token).not.toHaveLength(0);
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it("hashes the password rather than storing it", async () => {
      await http().post("/auth/register").send(body).expect(201);

      const [{ data }] = prisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data.passwordHash).toEqual(expect.stringMatching(/^\$argon2id\$/));
      expect(JSON.stringify(data)).not.toContain(FIXTURE_PASSWORD);
    });

    // `registerSchema` is strict and has no `role`. Someone trying to sign
    // themselves up as an admin gets a 400 naming the key, not an account.
    it("400s rather than accepting a role", async () => {
      const response = await http()
        .post("/auth/register")
        .send({ ...body, role: "ADMIN" })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("role")]),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("400s on a password below the minimum", async () => {
      await http()
        .post("/auth/register")
        .send({ ...body, password: "short" })
        .expect(400);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("409s when the email is already registered", async () => {
      const { prismaError } = await import("../testing/prisma-mock");
      prisma.user.create.mockRejectedValue(prismaError("P2002"));

      await http().post("/auth/register").send(body).expect(409);
    });
  });

  describe("POST /auth/login", () => {
    const body = { email: "poet@moodnight.dev", password: FIXTURE_PASSWORD };

    it("answers 200 with a session and sets the cookie", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow())
        .mockResolvedValueOnce(userRow());

      const response = await http().post("/auth/login").send(body).expect(200);

      expect(response.body.user).toEqual(userJson());
      expect(refreshCookie(response)).toContain("HttpOnly");
    });

    it("401s on a wrong password", async () => {
      prisma.user.findUnique.mockResolvedValue(credentialRow());

      const response = await http()
        .post("/auth/login")
        .send({ ...body, password: "not-the-password" })
        .expect(401);

      expect(response.body.message).toBe("Invalid email or password.");
      expect(refreshCookie(response)).toBeUndefined();
    });

    /**
     * The three ways to fail have to be one answer. An address nobody has
     * registered, an account that has never set a password, and a wrong
     * password are all "invalid email or password" — anything finer grained
     * would let someone with a list of addresses find out which of them are
     * members here.
     */
    it("gives the identical answer for an unknown address and an account with no password", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await http().post("/auth/login").send(body).expect(401);

      prisma.user.findUnique.mockResolvedValue(credentialRow({ passwordHash: null }));
      const passwordless = await http().post("/auth/login").send(body).expect(401);

      expect(unknown.body).toEqual(passwordless.body);
      expect(unknown.body.message).toBe("Invalid email or password.");
    });

    // Not `passwordSchema`: a password that predates a tightening of the rules
    // must still be submittable, and a 400 spelling out the length policy would
    // hand it to an unauthenticated caller.
    it("does not apply the registration password rules to a sign-in attempt", async () => {
      prisma.user.findUnique.mockResolvedValue(credentialRow());

      await http()
        .post("/auth/login")
        .send({ ...body, password: "short" })
        .expect(401);
    });
  });

  describe("POST /auth/refresh", () => {
    /** Signs in and returns the refresh cookie, as a client would hold it. */
    async function signIn(): Promise<string> {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow())
        .mockResolvedValueOnce(userRow());

      const response = await http()
        .post("/auth/login")
        .send({ email: "poet@moodnight.dev", password: FIXTURE_PASSWORD })
        .expect(200);

      return refreshCookie(response)!;
    }

    it("issues a new access token and re-sets the cookie", async () => {
      const cookie = await signIn();
      vi.clearAllMocks();

      prisma.user.findUnique.mockResolvedValueOnce(sessionRow()).mockResolvedValueOnce(userRow());

      const response = await http().post("/auth/refresh").set("cookie", cookie).expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookie(response)).toContain("HttpOnly");
    });

    it("401s with no cookie at all", async () => {
      await http().post("/auth/refresh").expect(401);
    });

    /**
     * The revocation mechanism, end to end: the token carries the version it
     * was issued against, the column has moved on, and the strategy refuses it.
     * This is what makes signing out mean something without a sessions table.
     */
    it("401s once the account's token version has moved", async () => {
      const cookie = await signIn();
      vi.clearAllMocks();

      prisma.user.findUnique.mockResolvedValue(sessionRow({ tokenVersion: 1 }));

      await http().post("/auth/refresh").set("cookie", cookie).expect(401);
    });

    // The two token kinds are signed with different secrets, so an access token
    // presented as a refresh cookie cannot verify. Worth pinning: the whole
    // point of the split is that the long-lived credential and the widely-sent
    // one are not interchangeable.
    it("401s when an access token is presented as the refresh cookie", async () => {
      const access = await tokens.signAccess(USER_ID, "AUTHOR");

      await http().post("/auth/refresh").set("cookie", `${REFRESH_COOKIE}=${access}`).expect(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("204s, revokes every refresh token for the account, and clears the cookie", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(credentialRow())
        .mockResolvedValueOnce(userRow());

      const login = await http()
        .post("/auth/login")
        .send({ email: "poet@moodnight.dev", password: FIXTURE_PASSWORD })
        .expect(200);

      const cookie = refreshCookie(login)!;
      vi.clearAllMocks();

      prisma.user.findUnique.mockResolvedValue(sessionRow());
      prisma.user.update.mockResolvedValue({ id: USER_ID });

      const response = await http().post("/auth/logout").set("cookie", cookie).expect(204);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true },
      });

      // Cleared with the same Path it was set with — a Set-Cookie whose path
      // differs does not replace the original, and the sign-out would appear to
      // work while leaving the cookie in place.
      expect(refreshCookie(response)).toContain("Path=/auth");
    });

    it("401s without a refresh cookie, so a sign-out cannot be forged for someone else", async () => {
      await http().post("/auth/logout").expect(401);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("GET /auth/me", () => {
    it("returns the account named by the access token", async () => {
      prisma.user.findUnique.mockResolvedValue(userRow());

      const token = await tokens.signAccess(USER_ID, "AUTHOR");
      const response = await http()
        .get("/auth/me")
        .set("authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual(userJson());
    });

    it("401s without a token", async () => {
      await http().get("/auth/me").expect(401);
    });

    it("401s on a token signed with the wrong secret", async () => {
      // A refresh token is exactly that: correctly formed, wrong secret.
      const refresh = await tokens.signRefresh(USER_ID, 0);

      await http().get("/auth/me").set("authorization", `Bearer ${refresh}`).expect(401);
    });
  });
});
