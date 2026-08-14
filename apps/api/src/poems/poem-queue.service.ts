import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@moodnight/db";
import {
  type Actor,
  type ApprovePoemInput,
  poemQueueList,
  type PoemQueueQuery,
  type RejectPoemInput,
  type StudioPoem,
  type StudioPoemPage,
} from "@moodnight/shared";

import { listArgs, toPage } from "../common/list-query";
import { PrismaService } from "../prisma/prisma.service";
import { noSuchPoem, type Ownership, OWNERSHIP_FIELDS } from "./poem-access";
import { POEM_RELATIONS, STUDIO_FIELDS } from "./poem-fields";
import { toStudioPoem, toStudioSummary } from "./poem-mappers";

/**
 * The moderation queue — what is waiting, and the two decisions that empty it.
 *
 * A service of its own rather than three more methods on `PoemWritesService`,
 * and the module note has said why since before there was anything to put here:
 * **a decision writes two rows and not one.** A status change and the `Review`
 * that explains it have to land together or neither, and the moment that
 * transaction can be reached through a method that only writes the poem, "a
 * rejection always carries its reason" stops being a property of the code and
 * becomes something each caller remembers.
 *
 * So the transitions this file owns are the two that are decisions:
 *
 *     PENDING_REVIEW ──approve──> PUBLISHED
 *                    ──reject───> REJECTED
 *
 * and every other move a poem makes — a draft submitted, a published poem taken
 * back down — stays on the ordinary `PATCH`, because none of those is a
 * judgement anybody is owed an explanation for.
 *
 * **Who may decide is not asked here.** The floor is `@Roles("EDITOR")` on both
 * controllers, and there is no per-row rule underneath it: an editor may decide
 * on their own poem. The site is small enough that a four-eyes rule would mean
 * the only editor on a quiet week cannot post at all, and it would be
 * decorative in any case — `PATCH status: PUBLISHED` has always been open to an
 * editor on their own work. What the queue adds is not a restriction but a
 * record: the `Review` row names who decided, including when the answer is
 * "themselves".
 */

/**
 * The constraint that makes this the queue.
 *
 * Handed to `listArgs` as a base and spelled into both decisions' guards, so
 * "waiting to be read" is a property of the class rather than something each
 * method remembers — the same arrangement `PUBLIC_POEMS` has on the public read
 * path, and the mirror image of it.
 */
const QUEUED = { status: "PENDING_REVIEW" } as const satisfies Prisma.PoemWhereInput;

/** Prisma's code for "the row this `update` targeted does not exist". */
const RECORD_NOT_FOUND = "P2025";

/** Narrow enough to act on: a Prisma failure, and the specific one expected. */
function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** The 409 for a poem that is not waiting to be read, in whichever direction. */
function notInTheQueue(status: Ownership["status"]): ConflictException {
  return new ConflictException(
    `This poem is ${status}, not PENDING_REVIEW — there is nothing in the queue to decide on. ` +
      "A poem reaches the queue when its author submits it.",
  );
}

@Injectable()
export class PoemQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of poems waiting to be read, oldest submission first.
   *
   * The only list on the site that ascends by default, and the reason is what a
   * queue is: read newest-first, the poem that has waited longest is the one
   * never reached. `submittedAt` orders it rather than `updatedAt`, so an editor
   * who fixes a line before approving does not push the poem to the back of the
   * queue they are currently working through.
   */
  async list(query: PoemQueueQuery): Promise<StudioPoemPage> {
    const { where, orderBy, skip, take } = listArgs<
      Prisma.PoemWhereInput,
      Prisma.PoemOrderByWithRelationInput
    >(poemQueueList, query, { base: QUEUED, relations: POEM_RELATIONS });

    const [poems, total] = await Promise.all([
      this.prisma.poem.findMany({ where, orderBy, skip, take, select: STUDIO_FIELDS }),
      this.prisma.poem.count({ where }),
    ]);

    return toPage(poems.map(toStudioSummary), total, query);
  }

  /**
   * Publishes the poem and records who said so.
   *
   * `publishedAt` is stamped only if the poem has never held one, which is the
   * rule `PoemWritesService.update` already keeps: a poem taken down, revised,
   * resubmitted and approved again keeps its place in the feed rather than
   * jumping to the top as though it were new. The column answers "when did this
   * become public", and that is still the first time.
   *
   * `submittedAt` is deliberately *not* cleared. It says when the poem last
   * asked to be read, which stays true after it has been.
   */
  async approve(id: string, input: ApprovePoemInput, actor: Actor): Promise<StudioPoem> {
    const current = await this.waiting(id);

    return this.decide(id, {
      data: {
        status: "PUBLISHED",
        ...(current.publishedAt === null ? { publishedAt: new Date() } : {}),
      },
      review: { action: "APPROVE", note: input.note ?? null, reviewerId: actor.id },
    });
  }

  /**
   * Sends the poem back to its author, with the reason attached.
   *
   * The note is required by `rejectPoemSchema` rather than by anything here, and
   * that is the point of it being a schema: the request that carries no reason
   * never reaches this method.
   *
   * Nothing about the poem is destroyed. REJECTED is a state its author can move
   * out of — `PATCH status: PENDING_REVIEW` puts it back in the queue with a
   * fresh `submittedAt` — and the `Review` row stays behind it either way, which
   * is what makes the history readable later.
   */
  async reject(id: string, input: RejectPoemInput, actor: Actor): Promise<StudioPoem> {
    await this.waiting(id);

    return this.decide(id, {
      data: { status: "REJECTED" },
      review: { action: "REJECT", note: input.note, reviewerId: actor.id },
    });
  }

  /**
   * The shared half of both decisions: move the poem and write the row, or do
   * neither.
   *
   * **`status` is in the `where` as well as the id**, even though
   * {@link waiting} has just checked it. That check is for the *message* — it is
   * what tells a caller "this poem is DRAFT" rather than handing them an
   * indistinguishable failure — and it races by construction, because it is a
   * separate query. The guard here is what makes the answer true: two editors
   * deciding at the same instant means the second one's `update` matches no row,
   * the transaction rolls back, and no second `Review` is written against a poem
   * that had already left the queue. Without it the loser would silently
   * overwrite the winner's decision and both rows would survive.
   */
  private async decide(
    id: string,
    decision: {
      data: Prisma.PoemUpdateInput;
      review: { action: "APPROVE" | "REJECT"; note: string | null; reviewerId: string };
    },
  ): Promise<StudioPoem> {
    try {
      const [poem] = await this.prisma.$transaction([
        this.prisma.poem.update({
          where: { id, ...QUEUED },
          data: decision.data,
          select: STUDIO_FIELDS,
        }),
        this.prisma.review.create({
          // Nothing reads the row back — the decision the client receives is the
          // poem — so only the key comes home.
          data: { ...decision.review, poemId: id },
          select: { id: true },
        }),
      ]);

      return toStudioPoem(poem);
    } catch (error) {
      // The row was PENDING_REVIEW when `waiting` read it and is not any more.
      // A 409 rather than the 404 this code usually means: the poem is still
      // there, and what changed is that somebody else decided first.
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw new ConflictException(
          "Another editor decided on this poem a moment ago. Nothing was written — reload the " +
            "queue to see where it went.",
        );
      }

      throw error;
    }
  }

  /**
   * The three columns a decision needs, and the two refusals it can meet.
   *
   * A read before the write, so it races in principle — {@link decide} is what
   * closes that. Folding the check into the update's `where` alone would avoid
   * the extra query and cost both messages: "no such poem" and "that poem is a
   * draft" would collapse into one `P2025` an editor could not tell apart. The
   * same trade `PoemWritesService.ownershipOf` makes, for the same reason.
   */
  private async waiting(id: string): Promise<Ownership> {
    const poem = await this.prisma.poem.findUnique({ where: { id }, select: OWNERSHIP_FIELDS });

    if (!poem) {
      throw noSuchPoem(id);
    }

    if (poem.status !== "PENDING_REVIEW") {
      throw notInTheQueue(poem.status);
    }

    return poem;
  }
}
