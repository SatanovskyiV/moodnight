import { z } from "zod";

/**
 * The permission ladder, in descending order of privilege. Kept in step with
 * the `UserRole` enum in packages/db by the mapper in the API's users service,
 * which assigns one union into the other — adding a role in one place and not
 * the other fails `tsc` rather than reaching production.
 *
 * This package is imported by the browser bundle, so it declares the values
 * rather than re-exporting Prisma's enum: nothing in @moodnight/db belongs in
 * apps/web.
 */
export const userRoleSchema = z.enum(["ADMIN", "EDITOR", "AUTHOR"]).meta({
  description:
    "What the account is allowed to do. ADMIN manages users, " +
    "EDITOR moderates the queue, AUTHOR writes their own poems.",
  example: "AUTHOR",
});

export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * A user as it crosses the wire — which is why the timestamps are ISO strings
 * and not `Date`s. Prisma hands the API `Date` objects; JSON has no such thing,
 * so the API serialises them and this schema describes what a client actually
 * receives.
 */
export const userSchema = z
  .object({
    id: z.uuid().meta({ description: "UUIDv7 — time-ordered, so it sorts by creation." }),
    email: z
      .email()
      .meta({ description: "Login identity. Unique.", example: "poet@moodnight.dev" }),
    name: z.string().min(1).max(100).meta({ example: "Леся" }),
    surname: z.string().min(1).max(100).meta({ example: "Українка" }),
    role: userRoleSchema,
    createdAt: z.iso.datetime().meta({ description: "When the account was created." }),
    updatedAt: z.iso.datetime().meta({ description: "When the account was last written to." }),
  })
  .meta({ description: "A registered user." });

export type User = z.infer<typeof userSchema>;
