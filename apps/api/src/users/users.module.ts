import { Module } from "@nestjs/common";

import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  // Exported so the Phase 3 auth module can look users up through this service
  // rather than opening its own path to the table.
  exports: [UsersService],
})
export class UsersModule {}
