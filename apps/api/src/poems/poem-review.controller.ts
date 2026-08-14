import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type Actor,
  type ApprovePoemInput,
  approvePoemSchema,
  type RejectPoemInput,
  rejectPoemSchema,
  type StudioPoem,
} from "@moodnight/shared";

import { CurrentUser, Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { zodRef } from "../swagger/openapi-schemas";
import { PoemQueueService } from "./poem-queue.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

/**
 * The two decisions — the third controller on `/poems`, and the last one.
 *
 * **Why these live on the poem rather than under `/admin/queue`.** Approving is
 * something done *to a poem*, and the client doing it is usually already
 * holding the poem — it has just been read at `GET /studio/poems/{id}` and
 * possibly patched at `PATCH /poems/{id}`. Hanging the verb off the queue would
 * make the address depend on which screen the editor came from, and would put
 * three different prefixes in one editorial workflow. The queue is a *view* of
 * poems waiting; this is the poem's own state machine.
 *
 * No collision with the two classes already on this path, and the reason is
 * worth naming because it is not the same as the GET situation: `POST /poems`
 * on `PoemWritesController` is a different path from `POST /poems/{id}/approve`
 * — one segment against three — so Nest matches them independently, in either
 * registration order. The reads are the fragile ones, which is why
 * `PoemStudioController` took a prefix of its own.
 *
 * `@Roles("EDITOR")` for the class. There is deliberately no per-row rule
 * underneath it: an editor may decide on their own poem, which has always been
 * true through `PATCH status: PUBLISHED` and which the `Review` row now records
 * rather than prevents.
 *
 * **A 200 and not a 204**, though the decision is the point rather than the
 * answer: the poem comes back changed — a new `status`, and on an approval a
 * `publishedAt` the server chose — and a queue that has to re-fetch a row it
 * just moved is a second round trip for something the first one already knew.
 */
@ApiTags("poems")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@ApiForbiddenResponse({ description: "The account's role is not high enough." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("EDITOR")
@Controller("poems")
export class PoemReviewController {
  constructor(private readonly queue: PoemQueueService) {}

  @Post(":id/approve")
  // 200 rather than Nest's 201 for a POST: nothing was created. The poem
  // already existed and has moved, which is what comes back.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "approvePoem",
    summary: "Approve a poem",
    description:
      "Publishes a poem waiting in the queue and records the decision. For " +
      "editors and above.\n\n" +
      "Two rows are written in one transaction — the poem's new status and a " +
      "`Review` naming who decided — so a poem cannot become public without a " +
      "record of why it did.\n\n" +
      "The note is optional here and required on a rejection: an approval that " +
      "says nothing has already said the only thing that matters, which is that " +
      "the poem is on the site.\n\n" +
      "`publishedAt` is stamped only if the poem has never held one. A poem " +
      "taken down, revised and approved again keeps its place in the feed " +
      "rather than jumping to the top as though it were new.\n\n" +
      "Only a PENDING_REVIEW poem can be approved — anything else is a 409, " +
      "including a poem another editor decided on a moment earlier.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiBody({ schema: zodRef("ApprovePoem") })
  @ApiOkResponse({ description: "The poem, now published.", schema: zodRef("StudioPoem") })
  @ApiBadRequestResponse({ description: "The id or the body does not match the schema." })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  @ApiConflictResponse({ description: "The poem is not waiting in the queue." })
  approve(
    @Param("id", UUID_PARAM) id: string,
    @Body(new ZodValidationPipe(approvePoemSchema)) input: ApprovePoemInput,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoem> {
    return this.queue.approve(id, input, actor);
  }

  @Post(":id/reject")
  // 200 rather than Nest's 201 for a POST: nothing was created. The poem
  // already existed and has moved, which is what comes back.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "rejectPoem",
    summary: "Send a poem back",
    description:
      "Returns a poem waiting in the queue to its author, with the reason " +
      "attached. For editors and above.\n\n" +
      "**The note is required**, and that is the whole reason rejecting is an " +
      "endpoint rather than `PATCH status: REJECTED` — which the API does not " +
      "accept and never will. A rejection is not a field: it is a decision with " +
      "a reason, and an author sent their poem back with no reason has been " +
      "told nothing they can act on. The status and the `Review` carrying the " +
      "note are written in one transaction, so neither can exist without the " +
      "other.\n\n" +
      "Nothing is destroyed. The author can revise and send the poem back to " +
      "the queue with `PATCH status: PENDING_REVIEW`, which restamps how long " +
      "it has been waiting; the decision stays on the record either way.\n\n" +
      "Only a PENDING_REVIEW poem can be sent back — anything else is a 409.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiBody({ schema: zodRef("RejectPoem") })
  @ApiOkResponse({ description: "The poem, sent back.", schema: zodRef("StudioPoem") })
  @ApiBadRequestResponse({
    description: "The id does not match the schema, or the body carries no note.",
  })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  @ApiConflictResponse({ description: "The poem is not waiting in the queue." })
  reject(
    @Param("id", UUID_PARAM) id: string,
    @Body(new ZodValidationPipe(rejectPoemSchema)) input: RejectPoemInput,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoem> {
    return this.queue.reject(id, input, actor);
  }
}
