import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { setupSwagger } from "./swagger/setup-swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
  });

  if (process.env.SWAGGER_ENABLED !== "false") {
    setupSwagger(app);
  }
  // No global ValidationPipe: validation goes through the zod schemas in
  // @moodnight/shared (a ZodValidationPipe lands in Phase 3, when there are
  // request bodies), so class-validator never enters the dependency tree.

  // Without this, SIGTERM kills the process before `onModuleDestroy` runs and
  // the database connections are dropped rather than closed — noticeable in
  // local dev, where every watch restart would otherwise leak a pool.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
  Logger.log(`API listening on ${await app.getUrl()}`, "Bootstrap");
}

void bootstrap();
