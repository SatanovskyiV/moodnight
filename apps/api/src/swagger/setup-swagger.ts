import { type INestApplication, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { buildComponentSchemas } from "./openapi-schemas";

const DOCS_PATH = "docs";

/**
 * Mounts Swagger UI at `/docs`, with the raw document at `/docs/json` (and
 * `/docs/yaml`) so a typed client can be generated from it later.
 *
 * Note for the Vercel deploy: the UI's static assets are served by the
 * function itself, which serverless runtimes occasionally mangle. If the page
 * ever loads unstyled in production, point `customCssUrl`/`customJsUrl` at a
 * CDN copy of swagger-ui-dist, or set `SWAGGER_ENABLED=false` there and read
 * the docs locally — `/docs/json` is plain JSON and always works.
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
    // Inert until a controller carries @ApiBearerAuth — declared now so the
    // Phase 3 JWT endpoints only need the decorator.
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "access-token")
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
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });

  Logger.log(`Swagger UI mounted on /${DOCS_PATH}`, "Bootstrap");
}
