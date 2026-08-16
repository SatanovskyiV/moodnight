import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { POEM_REVISIONS_MAX, type PoemRevisions } from "@moodnight/shared";

import { Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { zodRef } from "../swagger/openapi-schemas";
import { PoemRevisionsService } from "./poem-revisions.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

/**
 * A poem's whole history — the fourth controller on `/poems`.
 *
 * On the poem's own path for the reason the two decisions are, written out on
 * `PoemReviewController`: this is something asked *about a poem*, by a client
 * that is usually already holding one, and hanging it off `/admin/queue` would
 * make its address depend on which screen the editor came from. It does not
 * collide with `GET /poems/{slug}` — two segments against one — which is the
 * collision `PoemStudioController` took a prefix of its own to avoid.
 *
 * **`@Roles("EDITOR")` on the class is the whole access rule**, and unlike every
 * other guarded read on a poem there is no per-row check underneath it. That is
 * not a gap: rule 2 in ./poem-access says a moderator may reach any poem, so a
 * row rule here could only ever pass. What the floor is doing instead is rule 6
 * — the trail is editorial working material, kept from the public path and from
 * the poem's own author alike — and unlike `lastEdit`, which is simply absent for
 * a caller who may not see it, this endpoint has nothing left to answer once the
 * history is withheld. So it refuses rather than empties: an author asking for
 * their own poem's history gets a 403, which is the honest answer.
 *
 * A `GET` and not a query parameter on `GET /studio/poems/{id}`, because the two
 * are read at different moments and cost differently. Every version carries a
 * whole body; a client opening a poem to decide on it wants one, and a client
 * opening the history wants all of them and has asked for that.
 */
@ApiTags("poems")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@ApiForbiddenResponse({ description: "The account's role is not high enough." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("EDITOR")
@Controller("poems")
export class PoemRevisionsController {
  constructor(private readonly revisions: PoemRevisionsService) {}

  @Get(":id/revisions")
  @ApiOperation({
    operationId: "listPoemRevisions",
    summary: "Read a poem's history",
    description:
      "Every version of a poem's text, oldest first, with the account that " +
      "saved each. For editors and above.\n\n" +
      "An editor may fix a line before approving a poem and keep fixing it " +
      "afterwards, so the text on the site is not always the text its author " +
      "submitted. This is the record of that: version 1 is the poem as its " +
      "author wrote it, the last is the poem as it reads now, and every one in " +
      "between names whoever changed it.\n\n" +
      "Each entry carries the whole text rather than a diff, so any two of them " +
      "can be compared however a client chooses to.\n\n" +
      `At most ${POEM_REVISIONS_MAX} entries. A poem rewritten more often than ` +
      "that keeps its original and its most recent versions, and the middle is " +
      "dropped — so the numbers count up without necessarily running " +
      "consecutively, and a jump is where the pruned versions were. The first " +
      "entry is always version 1.\n\n" +
      "**Not for the author.** What an editor changed before publishing is " +
      "editorial working material — it is not public, and it is not shown to " +
      "the poem's author either, who is refused here rather than given an " +
      "emptier answer.\n\n" +
      "Unpaginated: a trail is one poem's history and is read in one order.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiOkResponse({
    description: "Every version, oldest first.",
    schema: zodRef("PoemRevisions"),
  })
  @ApiBadRequestResponse({ description: "The id is not a UUIDv7." })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  list(@Param("id", UUID_PARAM) id: string): Promise<PoemRevisions> {
    return this.revisions.list(id);
  }
}
