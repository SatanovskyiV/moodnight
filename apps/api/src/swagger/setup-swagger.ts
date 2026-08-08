import { type INestApplication, Logger } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";

import { buildOpenApiDocument } from "./build-document";

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
 * `/docs/yaml`).
 *
 * The document itself is built by {@link buildOpenApiDocument}, which
 * `emit-openapi.ts` also calls to produce the checked-in openapi.json that
 * apps/web's client is generated from. Nothing here is on that path: codegen
 * never starts a server, so the UI's quirks below cannot affect the client.
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
  SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app), {
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
