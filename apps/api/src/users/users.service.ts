import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@moodnight/db";
import {
  type Actor,
  type CreateUserInput,
  initialsOf,
  type ListUsersQuery,
  type UpdateUserInput,
  type User,
  userList,
  type UserPage,
  type UserRole,
} from "@moodnight/shared";

import { hashPassword } from "../auth/password";
import { listArgs, toPage } from "../common/list-query";
import { slugPrefix, uniqueSlug } from "../common/unique-slug";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The columns the API is willing to expose, named explicitly rather than taken
 * as Prisma's default of "every scalar on the model".
 *
 * This is the reason the endpoints stayed safe as the schema grew: `passwordHash`
 * and `tokenVersion` now exist on the model, and a bare `findMany()` would hand
 * both to anyone reading `/users` — while this list simply never mentioned them,
 * so nothing had to be remembered on the day they were added. The three methods
 * below that genuinely need a credential name it in their own `select`, one
 * field at a time, and none of them returns it to a client.
 */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  surname: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * What the login path needs and nothing else: enough to check a password, and
 * the token version to stamp into the session that follows — read here so a
 * successful sign-in costs two queries rather than three.
 *
 * `active` is one of the two places deactivation is enforced. It is read here,
 * beside the credential, so the check costs nothing extra and cannot be reached
 * around: there is no way to verify a password on this site without also
 * holding the answer to whether the account is allowed to use it.
 */
const CREDENTIAL_FIELDS = {
  id: true,
  role: true,
  active: true,
  passwordHash: true,
  tokenVersion: true,
} as const;

/**
 * What the refresh path needs: enough to check a token version and re-sign.
 *
 * `active` is the other enforcement point, and the one it would be easy to
 * leave out. Deactivating an account bumps its `tokenVersion`, so every refresh
 * token already issued stops verifying — but a token minted in the seconds
 * *after* that write would carry the new version and match. Reading the column
 * here is what closes that, and what makes deactivation take effect within one
 * access-token lifetime rather than at the end of a thirty-day cookie.
 */
const SESSION_FIELDS = {
  id: true,
  role: true,
  active: true,
  tokenVersion: true,
} as const;

/** Prisma's code for "a unique constraint rejected this write". */
const UNIQUE_VIOLATION = "P2002";

/**
 * The partial unique index that allows a single ROOT row, created by the
 * 20260804121000_one_root_account migration.
 */
const ONE_ROOT_INDEX = "users_one_root";

/**
 * The unique index on the public slug, added by 20260809120000_add_poems.
 *
 * `deriveProfile` picks a free slug before inserting, so a violation here means
 * two requests settled on the same suffix in the same instant — rare, and worth
 * telling apart from the email one, because "that email is taken" would send an
 * administrator looking in entirely the wrong place.
 */
const SLUG_INDEX = "users_slug_key";

/** Prisma's code for "the row this `update` or `delete` targeted does not exist". */
const RECORD_NOT_FOUND = "P2025";

/**
 * Prisma's code for "a foreign key still points at this row".
 *
 * Which, on this table, means the account has poems or moderation history —
 * both relations are `onDelete: Restrict` in schema.prisma. Without this the
 * database's refusal reaches the client as a 500, and an administrator learns
 * only that something broke.
 */
const FOREIGN_KEY_VIOLATION = "P2003";

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

/**
 * Narrow enough to act on: a Prisma failure, and the specific one expected.
 *
 * A type predicate rather than a plain boolean, so a caller that needs more
 * than the verdict — {@link violatedIndex} reads `meta` — gets the narrowed
 * error out of the same check instead of asserting the type a second time.
 */
function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Whether a unique violation came from a particular index.
 *
 * Three of them now guard this table, so a P2002 on its own says nothing
 * useful: which index Postgres rejected the write on is the difference between
 * "that email is taken", "there is already a root account" and "two accounts
 * raced for the same slug", and the client deserves the right one.
 *
 * Prisma reports the offending constraint in `meta.target`, and not in one
 * shape: Postgres gives back the index name as a string, other connectors give
 * an array of column names. Both are flattened to a list before the comparison,
 * so this asks "does the target name this index" rather than betting on which
 * form arrives. An unrecognisable target reads as `false` for every index,
 * which lands the caller on the email message — the oldest and likeliest of the
 * three.
 */
function violatedIndex(error: unknown, index: string): boolean {
  if (!isPrismaError(error, UNIQUE_VIOLATION)) {
    return false;
  }

  const target = error.meta?.target;
  const names = Array.isArray(target) ? target.map(String) : [String(target)];

  return names.includes(index);
}

/** One answer to "there is already a root", shared by `create` and `update`. */
function rootTaken(): ConflictException {
  return new ConflictException(
    "There is already a root account, and there can only be one. " +
      "Change the existing one's role first if this account is to take it over.",
  );
}

/** One answer to "no row has that id", shared by the three routes that take one. */
function noSuchUser(id: string): NotFoundException {
  return new NotFoundException(`No user with id ${id}.`);
}

/**
 * The two rules about the ROOT account that the database cannot express.
 *
 * The `users_one_root` index guarantees no two accounts hold the role at once.
 * It says nothing about *who may hand it over* — and without that, an admin
 * could simply delete the root account and appoint themselves, which is the
 * hole the users controller has been documenting since before there was
 * anything to close it with.
 *
 * So: only a root appoints a root, and only a root may edit or remove the
 * account that is one. Demoting themselves is still open to a root, which is
 * what keeps the role transferable rather than a decision the first seed makes
 * permanently.
 */
function assertMayAppointRoot(actor: UserRole, role: UserRole | undefined): void {
  if (role === "ROOT" && actor !== "ROOT") {
    throw new ForbiddenException("Only the root account can appoint a new one.");
  }
}

/** The other half: an admin may not edit or delete the account that holds ROOT. */
function assertMayTouchRootAccount(actor: UserRole, target: UserRole): void {
  if (target === "ROOT" && actor !== "ROOT") {
    throw new ForbiddenException("Only the root account can change or remove itself.");
  }
}

/**
 * The rule that needs to know *who* is asking rather than only what they are
 * allowed to do: nobody deactivates themselves.
 *
 * Not paternalism — it is unrecoverable by the person who did it. Deactivating
 * an account ends its sessions in the same write, and the login path then
 * refuses the credential that would undo it, so an administrator who ticks this
 * box on their own row is locked out until somebody else unticks it. On a site
 * whose administration may well be one person, that somebody may not exist.
 *
 * A root demoting or retiring themselves through another account is still open,
 * which keeps the site transferable — the same shape as the ROOT rules above.
 */
function assertNotRetiringSelf(actorId: string, targetId: string, active?: boolean): void {
  if (active === false && actorId === targetId) {
    throw new ForbiddenException(
      "Deactivating your own account would sign you out and leave you unable to sign back " +
        "in. Ask another administrator to do it.",
    );
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of users, searched, filtered and ordered as the query asks.
   *
   * Nothing about *which* properties may be searched, filtered or sorted is
   * decided here — `userList` in @moodnight/shared declares that, its schema
   * has already refused anything else with a 400, and `listArgs` turns what
   * survived into a `where` and an `orderBy`. This method is the two queries
   * and the envelope.
   *
   * Those two queries run together rather than in a transaction. A row written
   * between them could make `total` disagree with `items` by one, which costs a
   * pager a briefly wrong count and costs a serialised pair of round trips to
   * prevent — the wrong trade for an administration table, and a real one on a
   * database that scales to zero.
   */
  async list(query: ListUsersQuery): Promise<UserPage> {
    const { where, orderBy, skip, take } = listArgs<
      Prisma.UserWhereInput,
      Prisma.UserOrderByWithRelationInput
    >(userList, query);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip, take, select: PUBLIC_FIELDS }),
      // The same `where` object, so the count can never describe a different
      // set of rows than the page it is the total for.
      this.prisma.user.count({ where }),
    ]);

    return toPage(users.map(toUser), total, query);
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
   * it in when it is absent. `password` is optional too — an account may exist
   * before it has one, and until it does it simply cannot sign in.
   *
   * `actor` is who is asking, and it is optional for one caller: public
   * registration, which arrives through `AuthService` with nobody signed in.
   * That path is safe without an actor precisely because `registerSchema` has
   * no `role` field to carry, so the only role it can ever produce is the
   * column's default.
   *
   * The duplicate email is caught rather than checked for first. A `findUnique`
   * beforehand would still lose the race between the check and the insert, so
   * the unique index is the thing actually enforcing this and the catch is how
   * its verdict reaches the client. The same argument covers `role: "ROOT"`
   * when a root already exists: two simultaneous requests would both pass a
   * prior check and only the index can refuse the second insert.
   */
  async create(input: CreateUserInput, actor?: UserRole): Promise<User> {
    if (actor) {
      assertMayAppointRoot(actor, input.role);
    }

    const { password, ...fields } = input;
    const email = normaliseEmail(input.email);
    const profile = await this.deriveProfile(input.name, input.surname);

    try {
      const user = await this.prisma.user.create({
        data: {
          ...fields,
          ...profile,
          email,
          // Spread rather than assigned, so an absent password leaves the key
          // off the insert entirely and the column keeps its NULL — rather than
          // writing an explicit `undefined` that Prisma would have to interpret.
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
        },
        select: PUBLIC_FIELDS,
      });

      return toUser(user);
    } catch (error) {
      if (violatedIndex(error, ONE_ROOT_INDEX)) {
        throw rootTaken();
      }

      if (violatedIndex(error, SLUG_INDEX)) {
        throw new ConflictException(
          `The slug derived from "${profile.penName}" was taken between choosing it and ` +
            "writing the row. Nothing was created; sending the same request again will pick " +
            "the next free one.",
        );
      }

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
   *
   * Promoting someone to `ROOT` goes through here, and is refused with a 409
   * while another account holds it — and with a 403 if the person asking is not
   * themselves the root. Demoting the current root is an ordinary `role`
   * change, available to the root alone, which is what makes the promotion
   * recoverable rather than a decision the first seed makes permanently.
   *
   * There is no `password` in `UpdateUserInput`, and that is a deliberate
   * absence rather than an oversight — see the note on `updateUserSchema` in
   * @moodnight/shared.
   *
   * `active: false` is the one field here that does more than write a column,
   * and it is why this method takes the whole actor while its siblings take
   * only a role: retiring an account ends its sessions, and "you may not do
   * that to yourself" is a question about which row is asking, not about what
   * the asker is allowed to do.
   */
  async update(id: string, patch: UpdateUserInput, actor: Actor): Promise<User> {
    assertMayAppointRoot(actor.role, patch.role);
    assertNotRetiringSelf(actor.id, id, patch.active);
    assertMayTouchRootAccount(actor.role, await this.roleOf(id));

    const data = {
      ...patch,
      ...(patch.email ? { email: normaliseEmail(patch.email) } : {}),
      // Deactivation and sign-out are one write rather than two calls.
      //
      // The alternative — update the column, then `revokeSessions` — leaves a
      // window in which the account is deactivated and its refresh tokens still
      // verify, and leaves the pair able to half-succeed: the second query can
      // fail on a database that has just scaled to zero, and the account would
      // then be retired with its sessions intact and nothing to say so.
      //
      // Reactivation does not bump it back. Nothing was issued while the
      // account was down, so there is nothing to invalidate, and a second
      // increment would only cost the owner the sessions they are being handed
      // back.
      ...(patch.active === false ? { tokenVersion: { increment: 1 } } : {}),
    };

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

      if (violatedIndex(error, ONE_ROOT_INDEX)) {
        throw rootTaken();
      }

      if (isPrismaError(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(`A user with the email ${data.email} already exists.`);
      }

      throw error;
    }
  }

  /**
   * Deletes a user, or 404s if there is nothing to delete — and 409s if the
   * account has left anything behind.
   *
   * That last case is most of them. `Poem.author` and `Review.reviewer` are
   * both `onDelete: Restrict`, so this succeeds only for an account that never
   * published and never moderated: an invitation nobody accepted, a duplicate
   * created by mistake. Anyone who has actually used the site is refused here,
   * and `active: false` through `update` is what retires them — the decision
   * this method's comment spent two phases deferring, made in favour of keeping
   * the work.
   *
   * The 409 is not a fallback for an error nobody expected. It is the ordinary
   * answer for the ordinary case, and it says which of the two relations is
   * holding the row so an administrator knows what they are being told.
   */
  async remove(id: string, actor: UserRole): Promise<void> {
    assertMayTouchRootAccount(actor, await this.roleOf(id));

    try {
      // `select` narrowed to the one column: nothing reads the deleted row, and
      // this is a 204, so there is no reason to carry it back from the database.
      await this.prisma.user.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchUser(id);
      }

      if (isPrismaError(error, FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          "This account has published poems or moderation history, and deleting it would " +
            "take that with it. Deactivate it instead — it keeps the work and can no " +
            "longer sign in.",
        );
      }

      throw error;
    }
  }

  /**
   * An account's stored credential, for the login path — which is the only
   * caller, and the only reason `passwordHash` is ever read out of the table.
   *
   * Returns `null` for an address nobody has registered, and a row with a null
   * `passwordHash` for an account that has never set one. `AuthService` answers
   * both the same way, and takes the same time doing it.
   */
  findForAuth(email: string) {
    return this.prisma.user.findUnique({
      where: { email: normaliseEmail(email) },
      select: CREDENTIAL_FIELDS,
    });
  }

  /**
   * An account's current role and token version, for the refresh path.
   *
   * Both fields are read live rather than trusted from the token being
   * redeemed: `tokenVersion` is what makes a sign-out stick, and `role` is what
   * makes a demotion take effect within one refresh rather than at the end of a
   * thirty-day cookie.
   */
  findForRefresh(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: SESSION_FIELDS });
  }

  /**
   * Ends every session for an account by moving the number its refresh tokens
   * were signed against.
   *
   * `increment` rather than a read-then-write: two sign-outs racing each other
   * both need to invalidate, and reading the value first would let the slower
   * one write back a number the faster one had already passed.
   */
  async revokeSessions(id: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true },
      });
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchUser(id);
      }

      throw error;
    }
  }

  /**
   * The three public-profile columns an account cannot exist without, derived
   * from the name it was created with.
   *
   * None of them is on `createUserSchema`, and that is the scope line rather
   * than an oversight: an administrator creating an account is not the person
   * who gets to choose how its owner is credited on a poem. `penName` starts as
   * the legal name and becomes whatever the author makes it in the studio's
   * profile editor, which is Phase 4's; until that exists these are simply
   * sensible starting values.
   *
   * The slug is settled here and then frozen for the life of the row — see the
   * note on the column in schema.prisma. A published URL is a promise, so
   * renaming a pen name deliberately does not move the address it was first
   * given.
   */
  private async deriveProfile(name: string, surname: string) {
    const penName = `${name} ${surname}`;

    // One indexed range scan over a handful of rows, rather than a read of the
    // whole column: `startsWith` on a B-tree prefix is exactly what the unique
    // index on `slug` already supports.
    const neighbours = await this.prisma.user.findMany({
      where: { slug: { startsWith: slugPrefix(penName) } },
      select: { slug: true },
    });

    return {
      penName,
      initials: initialsOf(penName),
      slug: uniqueSlug(
        penName,
        neighbours.map((one) => one.slug),
      ),
    };
  }

  /**
   * The target's role, for the two ROOT rules above.
   *
   * A read before the write, so it races in principle: the row could change
   * roles in between. In practice the ROOT row is not changing under anyone,
   * and the alternative — folding the condition into the `update`'s `where` —
   * would collapse "no such user" and "you may not touch the root" into one
   * indistinguishable P2025 and lose both messages.
   */
  private async roleOf(id: string): Promise<UserRole> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });

    if (!user) {
      throw noSuchUser(id);
    }

    return user.role;
  }
}
