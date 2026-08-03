import { z } from "zod";

/**
 * The one contract Phase 1 needs: proof that both apps resolve the same
 * workspace package and agree on a payload shape. Domain schemas
 * (Poem, Author, …) land here as the phases that need them arrive.
 */
export const healthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string().meta({ description: "Which service answered.", example: "moodnight-api" }),
    uptime: z
      .number()
      .nonnegative()
      .meta({ description: "Whole seconds since the process started.", example: 42 }),
  })
  // `.meta()` is not decoration: apps/api turns these schemas into the OpenAPI
  // components behind /docs, so descriptions written here are the ones the API
  // documentation shows.
  .meta({ description: "Liveness payload returned by GET /health." });

export type Health = z.infer<typeof healthSchema>;
