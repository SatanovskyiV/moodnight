import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { User } from "@moodnight/shared";

import { zodArrayRef } from "../swagger/openapi-schemas";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Open to anyone, because there is no authentication to hang a guard on until
   * Phase 3 — at which point this wants a roles guard, since the payload
   * includes email addresses.
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
}
