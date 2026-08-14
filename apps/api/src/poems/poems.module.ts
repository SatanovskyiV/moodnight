import { Module } from "@nestjs/common";

import { PoemQueueController } from "./poem-queue.controller";
import { PoemQueueService } from "./poem-queue.service";
import { PoemReviewController } from "./poem-review.controller";
import { PoemStudioController } from "./poem-studio.controller";
import { PoemStudioService } from "./poem-studio.service";
import { PoemWritesController } from "./poem-writes.controller";
import { PoemWritesService } from "./poem-writes.service";
import { PoemsController } from "./poems.controller";
import { PoemsService } from "./poems.service";

/**
 * Everything a poem is reachable through, in four services that are kept apart
 * on purpose.
 *
 * Each one guarantees a single thing about every query it makes, and the split
 * is what makes that a property of the class rather than something each method
 * has to remember:
 *
 * - **`PoemsService`** answers anonymous readers and can only ever see
 *   published poems. No guard on its controller, by design — those routes are
 *   what Next.js calls while building the ISR pages.
 * - **`PoemWritesService`** takes an actor, sees drafts, and is guarded at every
 *   route. It owns the transitions that are not judgements: a draft submitted,
 *   a published poem taken back down.
 * - **`PoemStudioService`** takes an actor and reads what the public path must
 *   never return — an author's own shelf, pinned to them by a base constraint,
 *   and any one poem in full for whoever may reach it.
 * - **`PoemQueueService`** owns the two transitions that *are* judgements, and
 *   it exists separately for the reason this note used to state as future work:
 *   a decision writes two rows — the poem's new status and the `Review` that
 *   explains it — in one transaction. Reaching it through a service that writes
 *   only the poem would mean "a rejection always carries its reason" stopped
 *   being enforced and started being remembered.
 *
 * They share their column lists (./poem-fields), their mappers (./poem-mappers)
 * and their authorisation rules (./poem-access), and no code path.
 *
 * Ten routes across five controllers, three of them on `/poems`, because a
 * controller declares exactly one thing this module cares about — the role
 * floor — and two floors in one class means a handler that forgets to declare
 * its own inherits the gentler one, which is the failure worth designing
 * against because it fails open. `PoemStudioController` takes a prefix of its
 * own for a second reason, written out there: `GET /poems/{slug}` would swallow
 * any sibling GET on that path.
 *
 * Nothing is exported. A poem is written to through these routes or not at all.
 */
@Module({
  controllers: [
    PoemsController,
    PoemWritesController,
    PoemStudioController,
    PoemQueueController,
    PoemReviewController,
  ],
  providers: [PoemsService, PoemWritesService, PoemStudioService, PoemQueueService],
})
export class PoemsModule {}
