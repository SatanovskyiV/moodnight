import { BadRequestException } from "@nestjs/common";
import { createUserSchema, updateUserSchema } from "@moodnight/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * The pipe on its own, checked against the shape of its failures.
 *
 * users.controller.spec.ts already proves that a bad body is a 400 on every
 * route that takes one. What it cannot show is the message format, which is the
 * part a client writes code against: a string array, one entry per issue,
 * `field: message`. That is a contract with the browser, matching what Nest's
 * own ValidationPipe produces, and it is asserted here where it can be stated
 * once instead of at every endpoint.
 */
describe("ZodValidationPipe", () => {
  it("returns the parsed value, not the raw one", () => {
    const pipe = new ZodValidationPipe(z.object({ count: z.coerce.number() }));

    expect(pipe.transform({ count: "42" })).toEqual({ count: 42 });
  });

  it("throws a BadRequestException whose message is an array of strings", () => {
    const pipe = new ZodValidationPipe(createUserSchema);

    try {
      pipe.transform({ email: "nope", name: "", surname: "Українка" });
      expect.unreachable("the pipe should have rejected this body");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const { message } = (error as BadRequestException).getResponse() as { message: string[] };
      expect(Array.isArray(message)).toBe(true);
      expect(message).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^email: /),
          expect.stringMatching(/^name: /),
        ]),
      );
    }
  });

  /**
   * `updateUserSchema`'s "at least one field" rule is a `.refine()` on the whole
   * object, so its issue has an empty path. The message has to survive that
   * without turning into a stray `": Provide at least one field to change."`.
   */
  it("reports a whole-body issue without a leading separator", () => {
    const pipe = new ZodValidationPipe(updateUserSchema);

    try {
      pipe.transform({});
      expect.unreachable("an empty patch should have been rejected");
    } catch (error) {
      const { message } = (error as BadRequestException).getResponse() as { message: string[] };
      expect(message).toEqual(["Provide at least one field to change."]);
    }
  });

  it("rejects a body that is not an object at all", () => {
    const pipe = new ZodValidationPipe(createUserSchema);

    expect(() => pipe.transform("poet@moodnight.dev")).toThrow(BadRequestException);
  });
});
