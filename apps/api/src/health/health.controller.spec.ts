import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { healthSchema } from "@moodnight/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";

/**
 * The liveness probe, which the deployment polls and which therefore has to
 * answer without a database.
 *
 * The module built here provides no `PrismaService` at all — deliberately. If
 * anything is ever added to this route that reaches for the database, Nest
 * fails to resolve the dependency and this file stops compiling the module,
 * which is a louder and earlier signal than a probe that starts timing out in
 * production whenever Neon is asleep.
 */
describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers 200 with a body matching the shared schema", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    // Parsed against the schema rather than compared field by field: the schema
    // is what apps/web will read this response through, so it is the right
    // judge of whether the response is usable. `uptime` cannot be asserted on
    // literally anyway — it is however long this test run has been going.
    expect(() => healthSchema.parse(response.body)).not.toThrow();
    expect(response.body).toMatchObject({ status: "ok", service: "moodnight-api" });
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
