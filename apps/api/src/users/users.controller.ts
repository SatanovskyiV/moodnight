import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  type User,
  updateUserSchema,
} from "@moodnight/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/openapi-schemas";
import { UsersService } from "./users.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Every route here is open to anyone, because there is no authentication to
   * hang a guard on until Phase 3.
   *
   * That is a real hole while it lasts, and a wider one now than when this was
   * read-only: the reads hand out email addresses, and `POST` accepts a `role`,
   * so anything that can reach the API can mint itself an `ADMIN` — or delete
   * the root account and claim the role, since only its uniqueness is enforced
   * and not who may take it. Phase 3's roles guard belongs on the whole
   * controller — read for editors and above, write for admins, `ROOT` reserved
   * to the root — and until it exists this API is not one to expose publicly.
   */
  @Get()
  @ApiOperation({
    summary: "List all users",
    description: "Every user, newest first. Unpaginated.",
  })
  @ApiOkResponse({ description: "The users.", schema: zodArrayRef("User") })
  findAll(): Promise<User[]> {
    return this.users.findAll();
  }

  // Declared after the bare `@Get()`, which is the order Nest registers them
  // in. It does not matter here — `/users` and `/users/:id` cannot both match a
  // path — but it will once a literal route like `/users/me` arrives in Phase 3,
  // and that one has to come first or `:id` will swallow it.
  @Get(":id")
  @ApiOperation({
    summary: "Get a user",
    description: "One user by id.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The user's id." })
  @ApiOkResponse({ description: "The user.", schema: zodRef("User") })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiNotFoundResponse({ description: "No user has that id." })
  findOne(@Param("id", UUID_PARAM) id: string): Promise<User> {
    return this.users.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: "Create a user",
    description:
      "Emails are stored lowercased and must be unique. " +
      "`role` may be omitted, in which case the account is an AUTHOR. " +
      "ROOT is a singleton: creating a second one is a 409.",
  })
  @ApiBody({ schema: zodRef("CreateUser") })
  @ApiCreatedResponse({ description: "The created user.", schema: zodRef("User") })
  @ApiBadRequestResponse({ description: "The body does not match the schema." })
  @ApiConflictResponse({ description: "That email is taken, or a root account already exists." })
  create(@Body(new ZodValidationPipe(createUserSchema)) input: CreateUserInput): Promise<User> {
    return this.users.create(input);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update a user",
    description:
      "Changes only the fields present in the body; at least one is required. " +
      "Ids and timestamps are not writable. Promoting an account to ROOT " +
      "requires that no other account holds it.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The user's id." })
  @ApiBody({ schema: zodRef("UpdateUser") })
  @ApiOkResponse({ description: "The updated user.", schema: zodRef("User") })
  @ApiBadRequestResponse({ description: "The id or the body does not match the schema." })
  @ApiNotFoundResponse({ description: "No user has that id." })
  @ApiConflictResponse({ description: "That email is taken, or a root account already exists." })
  update(
    @Param("id", UUID_PARAM) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) patch: UpdateUserInput,
  ): Promise<User> {
    return this.users.update(id, patch);
  }

  @Delete(":id")
  // 204 rather than Nest's default 200: the body would be empty either way, and
  // this says so in the status line instead of leaving a client to discover it.
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a user",
    description: "Permanent. Deleting a user that is already gone is a 404, not a no-op.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The user's id." })
  @ApiNoContentResponse({ description: "The user is gone." })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiNotFoundResponse({ description: "No user has that id." })
  remove(@Param("id", UUID_PARAM) id: string): Promise<void> {
    return this.users.remove(id);
  }
}
