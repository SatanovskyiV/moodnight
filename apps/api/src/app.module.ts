import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PoemsModule } from "./poems/poems.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Local development only — in production Vercel puts these straight into
      // process.env, which always wins over a file. The second path is the
      // database package's own .env, so a connection string is written once and
      // read by both this app and the Prisma CLI instead of being kept in sync
      // in two places.
      envFilePath: [".env", "../../packages/db/.env"],
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PoemsModule,
  ],
})
export class AppModule {}
