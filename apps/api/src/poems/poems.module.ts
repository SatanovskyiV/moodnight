import { Module } from "@nestjs/common";

import { PoemsController } from "./poems.controller";
import { PoemsService } from "./poems.service";

/**
 * The public read path. Nothing is exported: Phase 4's studio and moderation
 * queue want a *different* service — one that sees drafts and takes an actor —
 * and letting them reach for this one would mean loosening the base constraint
 * that makes these endpoints safe to serve anonymously.
 */
@Module({
  controllers: [PoemsController],
  providers: [PoemsService],
})
export class PoemsModule {}
