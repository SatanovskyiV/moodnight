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
  Query,
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
  type CreateUserInput,
  createUserSchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type UpdateUserInput,
  type User,
  updateUserSchema,
  userList,
  type UserPage,
} from "@moodnight/shared";

import { CurrentUser, Roles } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiListQuery, zodRef } from "../swagger/openapi-schemas";
import { UsersService } from "./users.service";

/**
 * Ids are UUIDv7 (`@default(uuid(7))` in schema.prisma), so a malformed one is
 * a 400 here rather than a database round trip that finds nothing and 404s —
 * two different answers to two different mistakes.
 */
const UUID_PARAM = new ParseUUIDPipe({ version: "7" });

/**
 * Administration of accounts — not the way anyone signs up. Public
 * registration is `POST /auth/register`, which cannot express a role at all.
 *
 * The hole this controller documented until Phase 3 is now closed. Every route
 * requires an access token and a minimum role, declared per route with
 * `@Roles` and compared against the shared `ROLE_RANK` ladder, so a route names
 * the lowest role it accepts rather than listing every role above it:
 *
 * - **reads** — EDITOR and above; these hand out email addresses
 * - **writes** — ADMIN and above
 *
 * Two rules about ROOT sit underneath, in the service, because they are about
 * the row and not merely about the caller: only a root may appoint a root, and
 * only a root may edit or delete the account that is one. The `users_one_root`
 * index guarantees no two accounts hold the role at once; these are what stop
 * an admin from deleting the root and claiming it.
 *
 * The guards are attached here rather than registered globally in main.ts —
 * the reasoning is in auth/guards.ts, and the cost is that a new controller
 * has to remember them.
 */
@ApiTags("users")
@ApiBearerAuth("access-token")
@ApiUnauthorizedResponse({ description: "No valid access token." })
@ApiForbiddenResponse({ description: "The account's role is not high enough." })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles("EDITOR")
  @ApiOperation({
    operationId: "listUsers",
    summary: "List users",
    description:
      "One page of users, newest first unless asked otherwise. For editors and " +
      "above.\n\n" +
      "`search` matches name, surname and email, case-insensitively, and every " +
      "whitespace-separated term has to match one of them — so `леся укра` " +
      "finds a Леся Українка. `role` may be repeated to accept several " +
      "(`?role=ADMIN&role=EDITOR`). `sort` accepts only the properties listed " +
      "on it, and `?sort=role` orders by the privilege ladder rather than " +
      "alphabetically, because that is the order the Postgres enum declares.\n\n" +
      "Every parameter is optional and an empty one is read as absent, so a " +
      "table can keep its controls in the URL and clear them without pruning " +
      "the query string. An unrecognised parameter is a 400 rather than " +
      "something ignored.",
  })
  // Declared from the same schema the pipe below validates against — see
  // ApiListQuery. Nothing about these parameters is written twice.
  @ApiListQuery(userList)
  @ApiOkResponse({ description: "A page of users.", schema: zodRef("UserPage") })
  @ApiBadRequestResponse({ description: "The query does not match the schema." })
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<UserPage> {
    return this.users.list(query);
  }

  // Declared after the bare `@Get()`, which is the order Nest registers them
  // in. It does not matter here — `/users` and `/users/:id` cannot both match a
  // path — but it would the moment a literal route like `/users/me` appeared,
  // and that one would have to come first or `:id` would swallow it. The
  // current account is `GET /auth/me` partly to keep that trap unsprung.
  @Get(":id")
  @Roles("EDITOR")
  @ApiOperation({
    operationId: "getUser",
    summary: "Get a user",
    description: "One user by id. For editors and above.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The user's id." })
  @ApiOkResponse({ description: "The user.", schema: zodRef("User") })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiNotFoundResponse({ description: "No user has that id." })
  findOne(@Param("id", UUID_PARAM) id: string): Promise<User> {
    return this.users.findOne(id);
  }

  @Post()
  @Roles("ADMIN")
  @ApiOperation({
    operationId: "createUser",
    summary: "Create a user",
    description:
      "Emails are stored lowercased and must be unique. " +
      "`role` may be omitted, in which case the account is an AUTHOR; only a " +
      "root account may ask for ROOT, and ROOT is a singleton, so a second one " +
      "is a 409. `password` may be omitted too — the account then exists but " +
      "cannot sign in until one is set.",
  })
  @ApiBody({ schema: zodRef("CreateUser") })
  @ApiCreatedResponse({ description: "The created user.", schema: zodRef("User") })
  @ApiBadRequestResponse({ description: "The body does not match the schema." })
  @ApiConflictResponse({ description: "That email is taken, or a root account already exists." })
  create(
    @Body(new ZodValidationPipe(createUserSchema)) input: CreateUserInput,
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    return this.users.create(input, actor.role);
  }

  @Patch(":id")
  @Roles("ADMIN")
  @ApiOperation({
    operationId: "updateUser",
    summary: "Update a user",
    description:
      "Changes only the fields present in the body; at least one is required. " +
      "Ids, timestamps and passwords are not writable here. Promoting an " +
      "account to ROOT requires both that no other account holds it and that " +
      "the caller is the root; so does editing the root account itself. " +
      "Sending `active: false` retires an account: it keeps everything it has " +
      "written, every session for it ends immediately, and it can no longer " +
      "sign in. Nobody may do that to their own account.",
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
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    // The whole actor, not just the role: retiring an account is refused when
    // the account is the one asking, which is a question about `id`.
    return this.users.update(id, patch, actor);
  }

  @Delete(":id")
  @Roles("ADMIN")
  // 204 rather than Nest's default 200: the body would be empty either way, and
  // this says so in the status line instead of leaving a client to discover it.
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: "deleteUser",
    summary: "Delete a user",
    description:
      "Permanent, and only available for an account that has left nothing " +
      "behind: an account with poems or moderation history is refused with a " +
      "409, and retiring it with `active: false` is what applies to it " +
      "instead. Deleting a user that is already gone is a 404, not a no-op. " +
      "The root account can only be deleted by itself.",
  })
  @ApiParam({ name: "id", format: "uuid", description: "The user's id." })
  @ApiNoContentResponse({ description: "The user is gone." })
  @ApiBadRequestResponse({ description: "The id is not a UUID." })
  @ApiNotFoundResponse({ description: "No user has that id." })
  @ApiConflictResponse({
    description: "The account has poems or moderation history. Deactivate it instead.",
  })
  remove(@Param("id", UUID_PARAM) id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.users.remove(id, actor.role);
  }
}
