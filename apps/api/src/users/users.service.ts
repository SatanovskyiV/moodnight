import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@moodnight/db";
import type { CreateUserInput, UpdateUserInput, User } from "@moodnight/shared";

import { PrismaService } from "../prisma/prisma.service";

/**
 * The columns the API is willing to expose, named explicitly rather than taken
 * as Prisma's default of "every scalar on the model".
 *
 * This is the reason the endpoints stay safe as the schema grows: when Phase 3
 * adds `passwordHash`, a bare `findMany()` would start returning it and nothing
 * would complain. With an explicit `select`, a new column is invisible until
 * someone adds it here on purpose. Every read and every write below returns
 * through it, so there is one answer to "what does a user look like on the
 * wire" rather than one per method.
 */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  surname: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Prisma's code for "a unique constraint rejected this write" — here, always `email`. */
const UNIQUE_VIOLATION = "P2002";

/** Prisma's code for "the row this `update` or `delete` targeted does not exist". */
const RECORD_NOT_FOUND = "P2025";

type UserRow = Prisma.UserGetPayload<{ select: typeof PUBLIC_FIELDS }>;

/**
 * Prisma's `Date`s → the ISO strings `userSchema` describes. JSON has no date
 * type, so the schema documents what a client actually receives and this is
 * where that becomes true.
 *
 * Assigning Prisma's `UserRole` into the shared union is also what pins the two
 * enums together: if they ever diverge, this function stops compiling.
 */
function toUser(user: UserRow): User {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Postgres compares text case-sensitively, so `Poet@moodnight.dev` and
 * `poet@moodnight.dev` are two rows as far as the unique index is concerned.
 * Lowercasing every write is what makes that index mean what people assume it
 * does — the promise `schema.prisma` makes on the `email` column, kept here.
 *
 * `toLowerCase` and not `toLocaleLowerCase`: the latter is locale-dependent and
 * would map `I` differently under a Turkish locale.
 */
function normaliseEmail(email: string): string {
  return email.toLowerCase();
}

/** Narrow enough to act on: a Prisma failure, and the specific one expected. */
function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** One answer to "no row has that id", shared by the three routes that take one. */
function noSuchUser(id: string): NotFoundException {
  return new NotFoundException(`No user with id ${id}.`);
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every user, newest first.
   *
   * Unpaginated on purpose — it matches the endpoint as asked for, and the
   * table is small. It is also the thing to revisit first when it stops being
   * small; the roadmap's Phase 2 pagination applies here as much as to poems.
   */
  async findAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      select: PUBLIC_FIELDS,
      // `id` is a UUIDv7, so it breaks `createdAt` ties in creation order
      // rather than arbitrarily — two rows written in the same millisecond
      // still come back in a stable sequence across requests.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return users.map(toUser);
  }

  /**
   * One user, by id.
   *
   * `findUnique` and an explicit null check rather than `findUniqueOrThrow`:
   * the absent row is the expected case here, not an exception, and this way
   * the 404 is visible in the method instead of routed through a catch.
   */
  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });

    if (!user) {
      throw noSuchUser(id);
    }

    return toUser(user);
  }

  /**
   * Creates a user. `role` is optional; the column's `@default(AUTHOR)` fills
   * it in when it is absent.
   *
   * The duplicate email is caught rather than checked for first. A `findUnique`
   * beforehand would still lose the race between the check and the insert, so
   * the unique index is the thing actually enforcing this and the catch is how
   * its verdict reaches the client.
   */
  async create(input: CreateUserInput): Promise<User> {
    const email = normaliseEmail(input.email);

    try {
      const user = await this.prisma.user.create({
        data: { ...input, email },
        select: PUBLIC_FIELDS,
      });

      return toUser(user);
    } catch (error) {
      if (isPrismaError(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(`A user with the email ${email} already exists.`);
      }

      throw error;
    }
  }

  /**
   * Applies a partial change. Absent fields are left alone — Prisma writes only
   * the keys present in `data`, which is what makes this a PATCH and not a PUT.
   *
   * The schema guarantees at least one key, so this never issues an update that
   * changes nothing but `updatedAt`.
   */
  async update(id: string, patch: UpdateUserInput): Promise<User> {
    const data = patch.email ? { ...patch, email: normaliseEmail(patch.email) } : patch;

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: PUBLIC_FIELDS,
      });

      return toUser(user);
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchUser(id);
      }

      if (isPrismaError(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(`A user with the email ${data.email} already exists.`);
      }

      throw error;
    }
  }

  /**
   * Deletes a user, or 404s if there is nothing to delete.
   *
   * A hard delete is right while `User` stands alone. Once Phase 2's `Poem`
   * carries an `authorId`, this becomes the decision it has been deferring:
   * cascade the poems, reassign them, or soft-delete the account and keep the
   * work. The referential action on that relation is where it gets made.
   */
  async remove(id: string): Promise<void> {
    try {
      // `select` narrowed to the one column: nothing reads the deleted row, and
      // this is a 204, so there is no reason to carry it back from the database.
      await this.prisma.user.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchUser(id);
      }

      throw error;
    }
  }
}
