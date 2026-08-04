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

  // `credentials: true` is what lets the browser send that cookie at all, and
  // it only works against an explicit origin list — never against `*`.
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
