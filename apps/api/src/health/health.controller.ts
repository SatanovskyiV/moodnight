import { Controller, Get } from "@nestjs/common";
import type { Health } from "@moodnight/shared";

@Controller("health")
export class HealthController {
  @Get()
  check(): Health {
    return {
      status: "ok",
      service: "moodnight-api",
      uptime: Math.round(process.uptime()),
    };
  }
}
