import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type Actor,
  type CreatePoemInput,
  createPoemSchema,
  type StudioPoem,
  type UpdatePoemInput,
  updatePoemSchema,
} from "@moodnight/shared";

import { CurrentUser, Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { zodRef } from "../swagger/openapi-schemas";
import { PoemWritesService } from "./poem-writes.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

/**
 * Writing poems — the other half of `/poems`, and a second controller on the
 * same path rather than three more routes on `PoemsController`.
 *
 * The split is not tidiness. That class documents its lack of guards as the
 * design: its two routes are what Next.js calls while building the ISR pages,
 * they are cached at the edge, and they must stay reachable with no token at
 * all. Hanging authenticated routes off it would put a `@UseGuards` in a file
 * whose contract is that it has none, and the next person to read it would have
 * to work out which sentence still applies. Two classes, one path, and each of
 * them says one true thing about itself.
 *
 * The URL is unchanged by that: `POST /poems`, `PATCH /poems/{id}` and
 * `DELETE /poems/{id}` are the resource's ordinary write verbs, and Nest routes
 * them here because no method collides — the reads are GETs on the other class.
 *
 * **The address is an id and not a slug**, which is the deliberate opposite of
 * `GET /poems/{slug}`. That route is the poem's public address and a UUID in a
 * shared link would be a worse URL for no gain; these are the studio's, where
 * the key has to survive the poem being retitled and has to exist before the
 * slug is known. Ids were always the internal key, and this is where they show.
 *
 * `@Roles("AUTHOR")` is the floor for the whole class, which is the bottom of
 * the ladder and therefore means "anybody signed in" rather than a permission
 * anyone has to be given. What separates an author from an editor is enforced
 * per row in the service, because "your own poem" is a fact about the row and
 * not about the caller.
 */
@ApiTags("poems")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("AUTHOR")
@Controller("poems")
export class PoemWritesController {
  constructor(private readonly poems: PoemWritesService) {}

  @Post()
  @ApiOperation({
    operationId: "createPoem",
    summary: "Write a poem",
    description:
      "Creates a poem owned by the account making the request. There is no " +
      "field for an author — a poem belongs to whoever is holding the token.\n\n" +
      "`status` may be omitted, in which case the poem is a DRAFT and nobody " +
      "but its author sees it. An author may also send PENDING_REVIEW, which " +
      "puts it in the moderation queue; PUBLISHED is an editor's to set, and is " +
      "a 403 otherwise.\n\n" +
      "The slug is derived from the title, disambiguated with a numeric suffix " +
      "if that address is taken, and then fixed for the life of the poem — " +
      "retitling it later does not move it.\n\n" +
      "`tags` are slugs of themes that already exist. An unknown one is a 400 " +
      "naming it: themes are curated, and writing a poem is not how a new one " +
      "is created.",
  })
  @ApiBody({ schema: zodRef("CreatePoem") })
  @ApiCreatedResponse({ description: "The poem, as written.", schema: zodRef("StudioPoem") })
  @ApiBadRequestResponse({
    description: "The body does not match the schema, or names a theme that does not exist.",
  })
  @ApiForbiddenResponse({ description: "Only an editor may publish outright." })
  @ApiConflictResponse({
    description: "Two requests raced for the same slug. Nothing was created.",
  })
  create(
    @Body(new ZodValidationPipe(createPoemSchema)) input: CreatePoemInput,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoem> {
    return this.poems.create(input, actor);
  }

  @Patch(":id")
  @ApiOperation({
    operationId: "updatePoem",
    summary: "Change a poem",
    description:
      "Changes only the fields present in the body; at least one is required. " +
      "An author may change their own poems, an editor anybody's.\n\n" +
      "The slug is not writable and does not follow the title: a poem's address " +
      "is settled when it is created, because a link somebody has shared is a " +
      "promise. Neither are the author, the read count, or the publication " +
      "date — the last of which is stamped by the server the first time the " +
      "poem is published, and kept if it is taken down and put back.\n\n" +
      "`status: PUBLISHED` and `featured` are both editors' decisions and a 403 " +
      "otherwise. `status: DRAFT` on a published poem takes it down, which is " +
      "the reversible act that has to happen before it can be deleted.\n\n" +
      "`tags` replaces the whole set rather than adding to it, so `[]` files the " +
      "poem under nothing and omitting the field leaves its themes alone.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiBody({ schema: zodRef("UpdatePoem") })
  @ApiOkResponse({ description: "The poem, as changed.", schema: zodRef("StudioPoem") })
  @ApiBadRequestResponse({ description: "The id or the body does not match the schema." })
  @ApiForbiddenResponse({
    description: "The poem is somebody else's, or the change is an editor's to make.",
  })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  update(
    @Param("id", UUID_PARAM) id: string,
    @Body(new ZodValidationPipe(updatePoemSchema)) patch: UpdatePoemInput,
    @CurrentUser() actor: Actor,
  ): Promise<StudioPoem> {
    return this.poems.update(id, patch, actor);
  }

  @Delete(":id")
  // 204 rather than Nest's default 200: the body would be empty either way, and
  // this says so in the status line instead of leaving a client to discover it.
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deletePoem",
    summary: "Delete a poem",
    description:
      "Permanent, and only available for a poem that is not currently public. " +
      "A published poem is refused with a 409: readers may have its address, so " +
      "taking it down (`status: DRAFT`) is a separate and reversible decision " +
      "that has to be made first.\n\n" +
      "Deleting takes the poem's themes and its moderation history with it. " +
      "Deleting a poem that is already gone is a 404, not a no-op.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The poem's id." })
  @ApiNoContentResponse({ description: "The poem is gone." })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiForbiddenResponse({ description: "The poem is somebody else's." })
  @ApiNotFoundResponse({ description: "No poem has that id." })
  @ApiConflictResponse({ description: "The poem is published. Take it down first." })
  remove(@Param("id", UUID_PARAM) id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.poems.remove(id, actor);
  }
}
