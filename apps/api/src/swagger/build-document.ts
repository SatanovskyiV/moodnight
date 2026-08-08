import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

import { REFRESH_COOKIE } from "../auth/refresh-cookie";
import { buildComponentSchemas } from "./openapi-schemas";

/**
 * The OpenAPI document, built from the running module graph.
 *
 * Separate from the UI it is served through because it now has two readers: the
 * Swagger page mounted at `/docs`, and `emit-openapi.ts`, which writes it to a
 * file for orval to generate apps/web's client from. Both call this, so the
 * document a client is generated against is the same object the server
 * describes itself with — there is no second definition to keep in step.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("MoodNight API")
    .setDescription(
      "Read and write endpoints for the MoodNight poetry site. " +
        "Response shapes come from the zod schemas in @moodnight/shared, " +
        "the same ones the API validates against.",
    )
    .setVersion("0.0.0")
    // Paste an access token into Swagger's Authorize box and the guarded
    // routes become callable from the page. `/auth/login` returns one.
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "access-token")
    // The refresh cookie. Declared so `/auth/refresh` and `/auth/logout` show
    // what they read, though nothing needs typing in: the browser holds the
    // cookie already and sends it with the request Swagger makes.
    .addCookieAuth(REFRESH_COOKIE, { type: "apiKey", in: "cookie" }, REFRESH_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...buildComponentSchemas(),
  };

  return document;
}
