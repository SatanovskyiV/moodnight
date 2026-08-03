import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Health } from "@moodnight/shared";

import { zodRef } from "../swagger/openapi-schemas";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({
    summary: "Liveness probe",
    description: "Answers as soon as the process is up. Touches no database.",
  })
  @ApiOkResponse({ description: "The service is running.", schema: zodRef("Health") })
  check(): Health {
    return {
      status: "ok",
      service: "moodnight-api",
      uptime: Math.round(process.uptime()),
    };
  }
}
