import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

/**
 * Global so feature modules can inject `PrismaService` without importing this
 * one. That is the standard treatment for a single, process-wide database
 * connection — the alternative is repeating `imports: [PrismaModule]` in every
 * module the phases add, which says nothing.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
