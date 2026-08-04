import { z } from "zod";

import { passwordSchema, userRoleSchema, userSchema, type UserRole } from "./user";

/**
 * What a client sends to `POST /auth/register`.
 *
 * There is deliberately no `role` field. Its absence is what makes public
 * registration safe: the API cannot pass a role it was never given, so the
 * column's `@default(AUTHOR)` in packages/db decides, and that default stays
 * written in exactly one place. An admin who genuinely needs to mint an editor
 * uses `POST /users`, which is guarded.
 */
export const registerSchema = userSchema
  .pick({ email: true, name: true, surname: true })
  .extend({ password: passwordSchema })
  .strict()
  .meta({ description: "The fields needed to register an account." });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * What a client sends to `POST /auth/login`.
 *
 * The password is a non-empty string and pointedly **not** {@link passwordSchema}.
 * Two reasons, both about the answer this endpoint gives: a password that
 * predates a tightening of the rules must still be submittable, and a 400
 * spelling out the length rules would tell an unauthenticated caller the
 * policy. Whether the credentials are right is the one thing this route is
 * allowed to reveal, and it reveals it as a 401.
 */
export const loginSchema = z
  .object({
    email: z.email().meta({ example: "poet@moodnight.dev" }),
    password: z.string().min(1, "Enter your password."),
  })
  .strict()
  .meta({ description: "Credentials for signing in." });

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * What register, login and refresh all answer with.
 *
 * The refresh token is *not* in here, and that is the point: it travels as an
 * httpOnly cookie the browser cannot read, so it never passes through
 * JavaScript and cannot be lifted out of storage by a script on the page. Only
 * the short-lived access token is the client's to hold.
 */
export const sessionSchema = z
  .object({
    accessToken: z.string().meta({
      description: "Bearer token for the Authorization header.",
    }),
    expiresIn: z.number().int().positive().meta({
      description: "Seconds until the access token expires.",
      example: 900,
    }),
    user: userSchema,
  })
  .meta({ description: "A signed-in session." });

export type Session = z.infer<typeof sessionSchema>;

/**
 * The permission ladder as numbers, so a guard can ask "is this role at least
 * that one" instead of listing every acceptable role at every route.
 *
 * The order matches the Postgres enum's, which the 20260804120000_add_root_role
 * migration established on purpose (`ADD VALUE 'ROOT' BEFORE 'ADMIN'`) — so
 * this table and an `ORDER BY role` in SQL rank accounts the same way rather
 * than being two independent opinions that happen to agree today.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  ROOT: 3,
  ADMIN: 2,
  EDITOR: 1,
  AUTHOR: 0,
};

/** Whether `role` sits at or above `required` on the ladder above. */
export function hasRole(role: UserRole, required: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/**
 * Who is making a request, as every guarded route sees it.
 *
 * Exactly what an access token carries and nothing more: verifying one involves
 * no database round trip, so this is the whole of what the API knows about a
 * caller until something deliberately looks the account up. The consequence
 * worth stating — a role change or a deletion is invisible here until the
 * token expires.
 */
export const actorSchema = z.object({
  id: z.uuid(),
  role: userRoleSchema,
});

export type Actor = z.infer<typeof actorSchema>;
