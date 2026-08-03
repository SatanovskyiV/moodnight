import { Injectable } from "@nestjs/common";
import type { User } from "@moodnight/shared";

import { PrismaService } from "../prisma/prisma.service";

/**
 * The columns the API is willing to expose, named explicitly rather than taken
 * as Prisma's default of "every scalar on the model".
 *
 * This is the reason the endpoint stays safe as the schema grows: when Phase 3
 * adds `passwordHash`, a bare `findMany()` would start returning it and nothing
 * would complain. With an explicit `select`, a new column is invisible until
 * someone adds it here on purpose.
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

    return users.map((user) => ({
      ...user,
      // Prisma's `Date` → the ISO string `userSchema` describes. Assigning
      // Prisma's `UserRole` into the shared union is also what pins the two
      // enums together: if they ever diverge, this line stops compiling.
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));
  }
}
