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

/**
 * What a client sends to `POST /users`.
 *
 * Picked from {@link userSchema} rather than re-declared, so each field's rules
 * — what counts as an email, the 100-character name limit — are written once
 * and a request is checked against exactly what the response promises. The
 * server-assigned fields (`id`, `createdAt`, `updatedAt`) are absent because
 * they were never picked, not because something strips them later.
 *
 * Strict rather than stripping: an unrecognised key is a 400. A client that
 * misspells `surname` should hear about it on the request that did nothing,
 * not discover it when the row comes back missing a name.
 */
export const createUserSchema = userSchema
  .pick({ email: true, name: true, surname: true })
  .extend({
    // Optional here, with no zod-side default: the column's `@default(AUTHOR)`
    // in packages/db stays the single place the default is written, so there is
    // no second copy of it to fall out of step.
    role: userRoleSchema.optional(),
  })
  .strict()
  .meta({ description: "The fields needed to create a user." });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * What a client sends to `PATCH /users/:id` — any subset of the creatable
 * fields, and at least one of them.
 *
 * The at-least-one rule is not pedantry: Prisma stamps `updatedAt` on every
 * `update` call regardless of whether the data changes anything, so accepting
 * `{}` would let a no-op request rewrite the row's history.
 */
export const updateUserSchema = createUserSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to change.",
  })
  .meta({ description: "The fields to change on a user. At least one is required." });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
