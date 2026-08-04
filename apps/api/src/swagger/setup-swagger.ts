import { type INestApplication, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { REFRESH_COOKIE } from "../auth/refresh-cookie";
import { buildComponentSchemas } from "./openapi-schemas";

const DOCS_PATH = "docs";

/**
 * Kept in step with the `swagger-ui-dist` version @nestjs/swagger resolves to.
 * A mismatch here is silent — the UI renders against a different release than
 * the one in node_modules — so bump it when @nestjs/swagger moves.
 */
const SWAGGER_UI_VERSION = "5.32.8";
const SWAGGER_UI_CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

/**
 * Mounts Swagger UI at `/docs`, with the raw document at `/docs/json` (and
 * `/docs/yaml`) so a typed client can be generated from it later.
 *
 * The UI's CSS and JS come from a CDN rather than from the function. Swagger's
 * HTML template links them as files inside `swagger-ui-dist`, which Vercel's
 * bundler does not trace into the deployed function, so on Vercel they 404 and
 * the page dies on `SwaggerUIBundle is not defined`. `customJs` is injected
 * after Swagger's own `swagger-ui-init.js`, but that file only registers a
 * `window.onload` handler, so the CDN globals are in place before it runs.
 *
 * `/docs/json` is generated in-process and needs none of this — it is the
 * reliable read if the UI is ever unavailable.
 */
export function setupSwagger(app: INestApplication): void {
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

  SwaggerModule.setup(DOCS_PATH, app, document, {
    customSiteTitle: "MoodNight API",
    jsonDocumentUrl: `${DOCS_PATH}/json`,
    yamlDocumentUrl: `${DOCS_PATH}/yaml`,
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
    ],
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });

  Logger.log(`Swagger UI mounted on /${DOCS_PATH}`, "Bootstrap");
}
