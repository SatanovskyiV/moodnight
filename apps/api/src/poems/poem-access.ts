import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@moodnight/db";
import { type Actor, hasRole, type UserRole, type WritablePoemStatus } from "@moodnight/shared";

/**
 * Who may do what to a poem — the rules the three authenticated services share,
 * in one file so that they are stated once.
 *
 * They live here rather than in a schema because none of them is a fact about a
 * single request in isolation: every one of them is a comparison between the
 * account holding the token and the row being reached for, which means both
 * halves have to be present before the question can be asked. A zod schema sees
 * only one of them.
 *
 * The four rules, and where each is applied:
 *
 * 1. **A poem belongs to whoever is holding the token.** `authorId` comes from
 *    the actor and there is no field on any request that could carry anything
 *    else — see `PoemWritesService.create`.
 * 2. **You may read and write your own poems; an editor may read and write
 *    anyone's.** {@link assertMayReach}, which is one function for both.
 * 3. **Publishing is an editor's decision.** An author moves a poem to
 *    PENDING_REVIEW and the queue moves it the rest of the way.
 *    {@link assertMaySetStatus}.
 * 4. **The front page is editorial.** {@link assertMayFeature}.
 *
 * The role floor on a route is a different question and is answered by
 * `@Roles()` on the controller: that asks whether the caller is the *kind* of
 * account this endpoint is for, and these ask whether this particular row is
 * theirs. A route needs both, and neither substitutes for the other.
 */

/** The lowest role that may publish, feature, or touch somebody else's poem. */
export const MODERATOR: UserRole = "EDITOR";

/** The columns the rules below need, and nothing else. */
export const OWNERSHIP_FIELDS = {
  authorId: true,
  status: true,
  publishedAt: true,
} as const;

export type Ownership = Prisma.PoemGetPayload<{ select: typeof OWNERSHIP_FIELDS }>;

/** One answer to "no row has that id", shared by every route that takes one. */
export function noSuchPoem(id: string): NotFoundException {
  return new NotFoundException(`No poem with id ${id}.`);
}

/**
 * Rule 2: your own poems, or anybody's if you moderate.
 *
 * **One function for reading and for writing, on purpose.** The two are the same
 * rule and should be hard to separate: an editor has to read a pending poem in
 * full before deciding on it — a queue that shows six lines and asks for a
 * verdict is not a review — and the write they then make is the point of having
 * read it. Splitting this into a looser `assertMayRead` and a stricter
 * `assertMayWrite` would create the two ways of getting the pair wrong: a read
 * of something you may not act on, or a write over something you were never
 * allowed to see. The day one genuinely has to be wider than the other is the
 * day this becomes two functions, deliberately.
 *
 * A 403 and not a 404, which is the opposite of the choice the public read path
 * makes — and for the opposite reason. There, the caller is a stranger and
 * "you may not see this one" would confirm a poem exists for somebody guessing
 * slugs. Here the caller has signed in and typed an id they got from somewhere;
 * telling them the poem is not theirs is the only answer that lets them work
 * out what went wrong.
 */
export function assertMayReach(actor: Actor, poem: Pick<Ownership, "authorId">): void {
  if (actor.id === poem.authorId || hasRole(actor.role, MODERATOR)) {
    return;
  }

  throw new ForbiddenException("This poem belongs to somebody else.");
}

/**
 * Rule 3: an author submits, an editor publishes.
 *
 * The gap this closes is the whole point of having a queue. Without it every
 * author could put their own work on the front page, and `PENDING_REVIEW` would
 * be a status nobody had a reason to choose.
 *
 * DRAFT and PENDING_REVIEW are open to anyone — on their own poem, which
 * {@link assertMayReach} is what enforces. Unpublishing is `status: DRAFT` and
 * therefore an editor's too, by rule 2 rather than by this one: it is somebody
 * else's poem, so an author cannot reach it, and its own author taking it back
 * down is a thing they are allowed to do.
 *
 * An editor publishing their *own* poem is allowed, here and in the queue. The
 * site is small enough that a four-eyes rule would mean the only editor on a
 * quiet week cannot post at all, and the `Review` row records who decided
 * either way — which is the thing an audit trail is for.
 */
export function assertMaySetStatus(role: UserRole, status: WritablePoemStatus | undefined): void {
  if (status === "PUBLISHED" && !hasRole(role, MODERATOR)) {
    throw new ForbiddenException(
      "Publishing is an editor's decision. Send status PENDING_REVIEW to put the poem in " +
        "the queue instead.",
    );
  }
}

/** Rule 4: the front page is editorial, so who may set `featured` is the same question. */
export function assertMayFeature(role: UserRole, featured: boolean | undefined): void {
  if (featured !== undefined && !hasRole(role, MODERATOR)) {
    throw new ForbiddenException("Only an editor decides what sits on the front page.");
  }
}
