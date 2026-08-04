import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The real `AppModule`, booted.
 *
 * Every other spec assembles its own testing module, listing the providers it
 * needs. That is the right way to test a controller and the wrong way to catch
 * the class of mistake this file exists for: a guard that resolves in a spec's
 * hand-built module and not in the application, or a controller added later
 * without the `@UseGuards` decorator that protects it. Both would leave the
 * whole suite green and the deployed API open.
 *
 * Nothing here touches the database. A 401 is decided by a guard before the
 * handler runs, so these requests never reach Prisma — which is what lets this
 * run with a connection string that points at nothing.
 */
describe("AppModule", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set before the module is imported, because `TokensService` reads them in
    // its constructor and `prismaClientOptions` throws without a connection
    // string. `process.env` wins over any .env file @nestjs/config finds, so a
    // developer's real secrets cannot leak into this run.
    process.env.JWT_ACCESS_SECRET = "app-module-spec-access";
    process.env.JWT_REFRESH_SECRET = "app-module-spec-refresh";
    process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";

    const { AppModule } = await import("./app.module");

    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it("answers /health without a token, and without a database", async () => {
    const response = await http().get("/health").expect(200);

    expect(response.body).toMatchObject({ status: "ok", service: "moodnight-api" });
  });

  it("leaves the auth routes open, since nobody can authenticate to reach them", async () => {
    // A 400 rather than a 401: the request got past the routing and the guards
    // and was refused by the zod pipe on an empty body, which is what "open"
    // means here.
    await http().post("/auth/register").send({}).expect(400);
    await http().post("/auth/login").send({}).expect(400);
  });

  it("guards every /users route in the assembled application", async () => {
    await http().get("/users").expect(401);
    await http().get("/users/0192f5a1-8c2b-7a3d-9e4f-1a2b3c4d5e6f").expect(401);
    await http().post("/users").send({}).expect(401);
    await http().patch("/users/0192f5a1-8c2b-7a3d-9e4f-1a2b3c4d5e6f").send({}).expect(401);
    await http().delete("/users/0192f5a1-8c2b-7a3d-9e4f-1a2b3c4d5e6f").expect(401);
  });

  it("guards the routes that redeem a refresh cookie", async () => {
    await http().post("/auth/refresh").expect(401);
    await http().post("/auth/logout").expect(401);
    await http().get("/auth/me").expect(401);
  });
});
