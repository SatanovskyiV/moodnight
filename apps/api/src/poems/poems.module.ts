import { Module } from "@nestjs/common";

import { PoemWritesController } from "./poem-writes.controller";
import { PoemWritesService } from "./poem-writes.service";
import { PoemsController } from "./poems.controller";
import { PoemsService } from "./poems.service";

/**
 * Both halves of `/poems`, kept apart on purpose.
 *
 * `PoemsService` answers anonymous readers and can only ever see published
 * poems; `PoemWritesService` takes an actor, sees drafts, and is guarded at
 * every route. They share their column lists (./poem-fields) and no code path,
 * which is what keeps the read path's base constraint a property of the class
 * rather than something each method has to remember.
 *
 * Nothing is exported. Phase 4's moderation queue writes a `Review` row
 * alongside a status change, which is a transaction over two tables and its
 * own service — reaching for this one would mean loosening the rule that a
 * rejection always carries its note.
 */
@Module({
  controllers: [PoemsController, PoemWritesController],
  providers: [PoemsService, PoemWritesService],
})
export class PoemsModule {}
