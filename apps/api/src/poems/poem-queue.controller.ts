import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type Actor,
  poemQueueList,
  type PoemQueueQuery,
  poemQueueQuerySchema,
  type StudioPoemPage,
} from "@moodnight/shared";

import { CurrentUser, Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiListQuery, zodRef } from "../swagger/openapi-schemas";
import { PoemQueueService } from "./poem-queue.service";

/**
 * What is waiting to be read — the list behind `/admin/queue`.
 *
 * One route, and its own class rather than a second method on the studio's
 * controller, because the two differ in the only thing a controller decides:
 * `/studio/poems` opens at `AUTHOR` and this opens at `EDITOR`. A class holding
 * both would need the floor declared per handler, and a handler that forgot
 * would inherit the gentler one — which is the one failure mode worth designing
 * against, since it fails open.
 *
 * The decisions taken *on* a queued poem are `PoemReviewController`, on the
 * poem's own path rather than under this one: approving is something done to a
 * poem, and a client holding a poem's id should not have to know which screen
 * it came from. Both classes share `PoemQueueService`, which is where the two
 * rows a decision writes are kept together.
 *
 * Every editor sees the same queue — there is no assignment, no claiming, no
 * per-reviewer slice — so the token decides nothing about *which* rows come
 * back. `@CurrentUser()` is here for the one thing it does decide: a poem that
 * has been through the queue before carries the decision that sent it back, and
 * the name on that decision is a moderator's to see. The role is passed down
 * rather than inferred from `@Roles("EDITOR")` above it, so what the response
 * contains follows from who is asking and not from a decorator a refactor could
 * move.
 */
@ApiTags("poems")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@ApiForbiddenResponse({ description: "The account's role is not high enough." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("EDITOR")
@Controller("admin/queue")
export class PoemQueueController {
  constructor(private readonly queue: PoemQueueService) {}

  @Get()
  @ApiOperation({
    operationId: "listPoemQueue",
    summary: "List poems waiting for review",
    description:
      "Every poem in PENDING_REVIEW, oldest submission first. For editors and " +
      "above.\n\n" +
      "**The only list on this API that ascends by default**, because that is " +
      "what a queue is: read newest-first, the poem that has waited longest is " +
      "the one nobody ever reaches. It is ordered by when the poem entered the " +
      "queue and not by when it was last saved, so an editor who fixes a line " +
      "before approving does not push it to the back of the queue they are " +
      "working through.\n\n" +
      "There is no `status` parameter and cannot be one: the endpoint *is* the " +
      "status. `author` and `tag` take slugs and may be repeated — " +
      "`?author=vasyl-stus` is everything one poet has waiting.\n\n" +
      "Rows carry the first few lines. Read a poem in full at " +
      "`GET /studio/poems/{id}`, which an editor may do for anybody's poem, and " +
      "decide on it at `POST /poems/{id}/approve` or `/reject`.\n\n" +
      "A poem that has been here before carries its last decision in `review` — " +
      "what was said, and, because the caller moderates, who said it. A poem " +
      "waiting for the first time carries `null`.",
  })
  @ApiListQuery(poemQueueList)
  @ApiOkResponse({ description: "A page of waiting poems.", schema: zodRef("StudioPoemPage") })
  @ApiBadRequestResponse({ description: "The query does not match the schema." })
  list(
    @Query(new ZodValidationPipe(poemQueueQuerySchema)) query: PoemQueueQuery,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoemPage> {
    return this.queue.list(query, actor);
  }
}
