import { z } from "zod";

/**
 * The one contract Phase 1 needs: proof that both apps resolve the same
 * workspace package and agree on a payload shape. Domain schemas
 * (Poem, Author, …) land here as the phases that need them arrive.
 */
export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  uptime: z.number().nonnegative(),
});

export type Health = z.infer<typeof healthSchema>;
