import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, prismaClientOptions } from "@moodnight/db";

/**
 * The database client, as a Nest provider.
 *
 * It extends `PrismaClient` rather than wrapping it, so every model delegate
 * (`prisma.poem.findMany()`, …) is available on the injected service with no
 * forwarding layer to keep in sync as the schema grows. How it connects is not
 * decided here — that is `prismaClientOptions()` in `@moodnight/db`, shared with
 * anything else that talks to the database.
 *
 * One instance per process: Nest's container is a singleton scope, and each
 * client carries its own connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(prismaClientOptions());
  }

  /**
   * There is deliberately no `onModuleInit` calling `$connect()`.
   *
   * Prisma connects lazily on the first query, which is what a scale-to-zero
   * database on a cold-starting function wants: connecting eagerly would make
   * every cold start wait for Neon to wake, including the requests that never
   * touch the database — `/health` above all, whose whole job is to answer
   * immediately.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Disconnected from the database.");
  }
}
