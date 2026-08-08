import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { setupSwagger } from "./swagger/setup-swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The refresh token arrives as an httpOnly cookie, and `request.cookies` is
  // where the refresh strategy reads it from — Express does not parse the
  // Cookie header on its own. Unsigned: the token is a JWT and carries its own
  // signature, so a second one around the cookie would prove nothing new.
  app.use(cookieParser());

  // No longer on the path any visitor takes: apps/web proxies this API through
  // its own origin (see the rewrite in apps/web/next.config.ts), so the browser
  // makes same-origin requests and CORS never enters into it. What this still
  // covers is everything that calls the API directly — Swagger UI on another
  // host, a script, a future second client — and `credentials: true` with an
  // explicit origin list, never `*`, is what lets any of those send the cookie.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
  });

  if (process.env.SWAGGER_ENABLED !== "false") {
    setupSwagger(app);
  }
  // No global ValidationPipe: bodies are validated by `ZodValidationPipe`
  // against the zod schemas in @moodnight/shared, applied per parameter because
  // only the route knows which schema its body should be read as. Nothing here
  // needs class-validator, so it never enters the dependency tree.

  // Without this, SIGTERM kills the process before `onModuleDestroy` runs and
  // the database connections are dropped rather than closed — noticeable in
  // local dev, where every watch restart would otherwise leak a pool.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
  Logger.log(`API listening on ${await app.getUrl()}`, "Bootstrap");
}

void bootstrap();
