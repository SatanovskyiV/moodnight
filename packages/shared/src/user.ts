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
export const userRoleSchema = z.enum(["ROOT", "ADMIN", "EDITOR", "AUTHOR"]).meta({
  description:
    "What the account is allowed to do. ROOT is the site's owner and there is " +
    "at most one of them, ADMIN manages users, EDITOR moderates the queue, " +
    "AUTHOR writes their own poems.",
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
 * What a password has to look like to be *accepted*, which is a different
 * question from what has to be sent to *check* one — see `loginSchema` in
 * ./auth.
 *
 * It lives here rather than there because a password is a field of a user, and
 * because ./auth already imports this file: putting it the other way round
 * would make the two modules import each other, and a cycle between files that
 * build constants at module load is a class of bug worth simply not having.
 *
 * The maximum is not cosmetic. Argon2's cost is what makes it worth using, and
 * that cost scales with the input: without a cap, a single request carrying a
 * few megabytes of "password" is a CPU bomb aimed at a function that bills by
 * the millisecond. 128 is far past any real passphrase and far short of
 * dangerous.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.")
  .meta({
    description: "At least 8 characters, at most 128.",
    example: "свіча-у-вікні-7",
  });

/**
 * The fields a client may ever write to a user, and the base both the create
 * and the update schema are built from.
 *
 * Picked from {@link userSchema} rather than re-declared, so each field's rules
 * — what counts as an email, the 100-character name limit — are written once
 * and a request is checked against exactly what the response promises. The
 * server-assigned fields (`id`, `createdAt`, `updatedAt`) are absent because
 * they were never picked, not because something strips them later.
 */
const writableUserFields = userSchema.pick({ email: true, name: true, surname: true }).extend({
  // Optional here, with no zod-side default: the column's `@default(AUTHOR)`
  // in packages/db stays the single place the default is written, so there is
  // no second copy of it to fall out of step.
  //
  // `ROOT` is accepted by this schema and may still be refused by the server
  // for two reasons no schema validating a single request can see: "at most one
  // root account" is a fact about the rows already in the table (409), and
  // "only a root may appoint one" is a fact about who is asking (403).
  role: userRoleSchema.optional(),
});

/**
 * What a client sends to `POST /users` — an administrative create, not the
 * public sign-up route (that is `registerSchema` in ./auth).
 *
 * Strict rather than stripping: an unrecognised key is a 400. A client that
 * misspells `surname` should hear about it on the request that did nothing,
 * not discover it when the row comes back missing a name.
 */
export const createUserSchema = writableUserFields
  .extend({
    // Optional, because an account is allowed to exist before it has a
    // password — the column is nullable for exactly this. Such an account
    // cannot sign in until one is set, which is the honest state of an invite
    // rather than a placeholder credential pretending to be real.
    password: passwordSchema.optional(),
  })
  .strict()
  .meta({ description: "The fields needed to create a user." });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * What a client sends to `PATCH /users/:id` — any subset of the writable
 * fields, and at least one of them.
 *
 * Built from `writableUserFields` rather than from `createUserSchema`, and the
 * difference is the whole point: **`password` is not patchable.** Deriving this
 * from the create schema would hand any admin the ability to overwrite another
 * account's password and then sign in as its owner — a takeover dressed up as
 * an edit. Choosing a password stays something only the account's owner does,
 * through a flow that proves who they are.
 *
 * The at-least-one rule is not pedantry: Prisma stamps `updatedAt` on every
 * `update` call regardless of whether the data changes anything, so accepting
 * `{}` would let a no-op request rewrite the row's history.
 */
export const updateUserSchema = writableUserFields
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to change.",
  })
  .meta({ description: "The fields to change on a user. At least one is required." });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
