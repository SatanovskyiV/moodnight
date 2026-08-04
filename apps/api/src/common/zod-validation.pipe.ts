import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/**
 * Validates a request payload against a zod schema from @moodnight/shared and
 * hands the controller the parsed value.
 *
 * This is the pipe docs/ROADMAP.md promises for Phase 3's forms, arriving with
 * the first endpoints that take a body: the same schema the browser resolves
 * `react-hook-form` against is the one the server enforces, so there is no
 * second description of a payload to keep in step — and no class-validator
 * DTOs, which would be exactly that second description.
 *
 * It is applied per-parameter rather than globally, because a global pipe has
 * no way to know which schema a given body should be read as:
 *
 * ```ts
 * create(@Body(new ZodValidationPipe(createUserSchema)) input: CreateUserInput)
 * ```
 *
 * Not `@Injectable()`, deliberately — it takes a schema, so it is constructed
 * at the use site rather than resolved from Nest's container.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // A string array, which is the shape Nest's own ValidationPipe produces —
      // `{ statusCode, error, message: [...] }` — so a client handles a failed
      // body the same way whatever produced it.
      throw new BadRequestException(result.error.issues.map(describe));
    }

    // Parsed, not raw: strict schemas have already rejected unknown keys, and
    // any coercion a schema declares has been applied.
    return result.data;
  }
}

/** `email: Invalid email address` — or the bare message for whole-body issues. */
function describe(issue: z.core.$ZodIssue): string {
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
