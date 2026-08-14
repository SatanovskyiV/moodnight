import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
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
import {
  type Actor,
  type ListStudioPoemsQuery,
  listStudioPoemsQuerySchema,
  type StudioPoem,
  type StudioPoemPage,
  studioPoemList,
} from "@moodnight/shared";

import { CurrentUser, Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiListQuery, zodRef } from "../swagger/openapi-schemas";
import { PoemStudioService } from "./poem-studio.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

/**
 * What a writer sees of their own work — the reads behind `/studio/poems`.
 *
 * **A path of its own rather than more routes under `/poems`,** and that is
 * forced rather than chosen: `PoemsController` claims `GET /poems/{slug}`, a
 * UUID is a perfectly good string, and any sibling GET on that prefix would be
 * swallowed by whichever controller Nest happened to register first. The
 * failure would not be a 404 from the right handler — it would be the *public*
 * handler answering "no published poem with the slug 0192f5a1…", which is a
 * confusing lie about a draft that exists. A second prefix makes the collision
 * impossible instead of ordering-dependent.
 *
 * The address then matches the area it serves, which is the roadmap's own
 * naming: `/studio` is where an author keeps their work and `/admin/queue` is
 * where an editor reads other people's.
 *
 * `@Roles("AUTHOR")` is the floor for the class — the bottom of the ladder, so
 * "anybody signed in" rather than a permission anyone has to be given. What
 * separates an author from an editor is enforced per row in the service,
 * because "your own poem" is a fact about the row and not about the caller.
 */
@ApiTags("poems")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("AUTHOR")
@Controller("studio/poems")
export class PoemStudioController {
  constructor(private readonly studio: PoemStudioService) {}

  @Get()
  @ApiOperation({
    operationId: "listStudioPoems",
    summary: "List my poems",
    description:
      "One page of the poems belonging to the account making the request, most " +
      "recently saved first. Drafts, poems waiting in the queue, poems " +
      "published and poems sent back — every state, which is what `GET /poems` " +
      "cannot answer because it is pinned to the published ones.\n\n" +
      "The author is not a parameter and cannot be one: it is the token. There " +
      "is no query that reaches another account's drafts, which is why `status` " +
      "is safe to filter on here and absent from the public feed.\n\n" +
      "`?status=DRAFT&status=REJECTED` accepts several. `search` matches title " +
      "and subtitle, case-insensitively, and every whitespace-separated term " +
      "has to match one of them. `?sort=status` orders by the poem's journey — " +
      "draft, queued, published, rejected — because that is the order the " +
      "Postgres enum declares.\n\n" +
      "Rows carry the first few lines rather than the whole poem. Ask for one " +
      "by id to read it in full.",
  })
  @ApiListQuery(studioPoemList)
  @ApiOkResponse({ description: "A page of my poems.", schema: zodRef("StudioPoemPage") })
  @ApiBadRequestResponse({ description: "The query does not match the schema." })
  list(
    @Query(new ZodValidationPipe(listStudioPoemsQuerySchema)) query: ListStudioPoemsQuery,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoemPage> {
    return this.studio.listMine(query, actor);
  }

  @Get(":id")
  @ApiOperation({
    operationId: "getStudioPoem",
    summary: "Read one poem, in full",
    description:
      "The whole poem, whatever state it is in — the text, its status, when it " +
      "was submitted and when it was last saved.\n\n" +
      "An author may read their own poems; an editor may read anybody's, which " +
      "is what makes reviewing possible: a decision taken on six lines of " +
      "teaser is not a review, and the `PATCH /poems/{id}` that fixes a line " +
      "before approving needs the text it is fixing. Somebody else's poem is a " +
      "403 for an author, not a 404 — the caller has signed in and typed an id " +
      "they got from somewhere, and being told it is not theirs is the only " +
      "answer they can act on.\n\n" +
      "By id rather than slug, like the write routes and unlike " +
      "`GET /poems/{slug}`: the slug is the poem's public address, and this is " +
      "the studio's key — it exists before a slug is settled and survives the " +
      "poem being retitled.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiOkResponse({ description: "The poem.", schema: zodRef("StudioPoem") })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiForbiddenResponse({ description: "The poem is somebody else's." })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  find(@Param("id", UUID_PARAM) id: string, @CurrentUser() actor: Actor): Promise<StudioPoem> {
    return this.studio.findById(id, actor);
  }
}
