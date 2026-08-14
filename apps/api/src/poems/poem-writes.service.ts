import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@moodnight/db";
import {
  type Actor,
  type CreatePoemInput,
  POEM_TAGS_MAX,
  type StudioPoem,
  type UpdatePoemInput,
} from "@moodnight/shared";

import { slugPrefix, uniqueSlug } from "../common/unique-slug";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertMayFeature,
  assertMayReach,
  assertMaySetStatus,
  noSuchPoem,
  type Ownership,
  OWNERSHIP_FIELDS,
} from "./poem-access";
import { STUDIO_FIELDS } from "./poem-fields";
import { toStudioPoem } from "./poem-mappers";

/**
 * The write path — creating a poem, changing one, deleting one.
 *
 * Deliberately a separate service from `PoemsService` rather than three more
 * methods on it, and the reason is the one thing that file is built around:
 * every query there carries a base constraint pinning `status` to PUBLISHED,
 * and nothing may lift it. A write path *has* to see drafts. Putting both in one
 * class would mean the constraint became something each method remembers
 * instead of something the class guarantees, and the read path's safety would
 * then rest on nobody ever calling the wrong helper.
 *
 * So the two paths share their column lists (./poem-fields), their mappers
 * (./poem-mappers) and no code path. This one takes an actor everywhere, is
 * guarded at every route, and answers with {@link StudioPoem} — which carries
 * `status` and a nullable `publishedAt`, because a poem that has just been
 * created has neither a publication date nor any business pretending to.
 *
 * Who may do what is ./poem-access, shared with the studio's read path and the
 * queue so that all three state it once. What is left here is the rules that
 * are about *this* path only:
 *
 * 1. **A poem belongs to whoever is holding the token.** `authorId` comes from
 *    the actor and there is no field that could carry anything else.
 * 2. **A published poem cannot be deleted where it stands.** Its URL has been
 *    shared; taking it down is a separate, reversible act.
 * 3. **Two timestamps are consequences, never inputs.** `publishedAt` is
 *    stamped the first time a poem goes public and `submittedAt` every time it
 *    enters the queue, both from the transition rather than from the body —
 *    two writable fields that have to agree is one more thing that can
 *    disagree.
 */

/** Prisma's code for "a unique constraint rejected this write". */
const UNIQUE_VIOLATION = "P2002";

/** Prisma's code for "the row this `update` or `delete` targeted does not exist". */
const RECORD_NOT_FOUND = "P2025";

/** Prisma's code for "a foreign key does not point at anything". */
const FOREIGN_KEY_VIOLATION = "P2003";

/**
 * The fallback slug for a title that transliterates to nothing at all — one
 * made only of punctuation, or of a script the table does not cover.
 *
 * `uniqueSlug` defaults to "author", which is right for the users path and
 * wrong here: `/poem/author` reads as a mistake. Passed to both halves of the
 * slug derivation, which is what the note on `slugPrefix` asks for.
 */
const SLUG_FALLBACK = "poem";

/** Narrow enough to act on: a Prisma failure, and the specific one expected. */
function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class PoemWritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes a new poem, owned by whoever is asking.
   *
   * `status` is optional and the column's `@default(DRAFT)` fills it in, so a
   * studio that saves before it asks anything gets the safe answer without
   * having to name it.
   */
  async create(input: CreatePoemInput, actor: Actor): Promise<StudioPoem> {
    assertMaySetStatus(actor.role, input.status);

    const { tags, ...fields } = input;
    const tagIds = await this.resolveTags(tags);
    const slug = await this.deriveSlug(input.title);

    try {
      const poem = await this.prisma.poem.create({
        data: {
          ...fields,
          slug,
          // Never from the body. There is no field that could carry another
          // account's id, so posting under somebody else's name is not a thing
          // this endpoint refuses — it is a thing it cannot express.
          authorId: actor.id,
          // A poem created straight into PUBLISHED — an editor posting on the
          // site's behalf — needs its date in the same write, or it would be
          // published and invisible: the feed's constraint is `status` *and*
          // `publishedAt: { not: null }`, and both have to hold.
          ...(input.status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
          // The same argument one status along: a poem written straight into
          // the queue has to carry the date the queue orders by, or it sorts
          // against a null and an editor never reaches it.
          ...(input.status === "PENDING_REVIEW" ? { submittedAt: new Date() } : {}),
          ...(tagIds.length > 0 ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
        },
        select: STUDIO_FIELDS,
      });

      return toStudioPoem(poem);
    } catch (error) {
      if (isPrismaError(error, UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `The slug "${slug}" was taken between choosing it and writing the row. Nothing was ` +
            "created; sending the same request again will pick the next free one.",
        );
      }

      // The only foreign key on an insert here is `authorId`, so this means the
      // account named by a still-valid access token has since been deleted.
      // A 401 rather than a 500: the token is the thing that is no longer good.
      if (isPrismaError(error, FOREIGN_KEY_VIOLATION)) {
        throw new UnauthorizedException("The account this token was issued to no longer exists.");
      }

      throw error;
    }
  }

  /**
   * Applies a partial change. Absent fields are left alone — Prisma writes only
   * the keys present in `data`, which is what makes this a PATCH and not a PUT.
   *
   * **The slug does not move when the title does.** A poem's address is settled
   * once, at creation, and then owned by the row; a shared URL is a promise, and
   * `User.slug` in schema.prisma makes exactly the same one. Fixing a typo in a
   * title is therefore free, and it is deliberately not a redirect problem.
   */
  async update(id: string, patch: UpdatePoemInput, actor: Actor): Promise<StudioPoem> {
    const current = await this.ownershipOf(id);

    assertMayReach(actor, current);
    assertMaySetStatus(actor.role, patch.status);
    assertMayFeature(actor.role, patch.featured);

    const { tags, ...fields } = patch;
    const tagIds = tags && (await this.resolveTags(tags));

    try {
      const poem = await this.prisma.poem.update({
        where: { id },
        data: {
          ...fields,
          // Stamped on the first publication and never again — so a poem that
          // is pulled down and put back keeps its place in the feed rather than
          // jumping to the top as though it were new. The column answers "when
          // did this become public", and that is still the first time.
          ...(patch.status === "PUBLISHED" && current.publishedAt === null
            ? { publishedAt: new Date() }
            : {}),
          // Stamped on every *entry* into the queue, which is the opposite rule
          // to `publishedAt` above and deliberately so. A rejected poem
          // resubmitted in August has waited since August, not since March, so
          // this is the last submission and not the first. The guard is on the
          // transition rather than on the value: a poem already in the queue
          // that is patched again — an editor fixing a line before approving —
          // keeps its place, which is the whole reason this column exists
          // instead of the queue being ordered by `updatedAt`.
          ...(patch.status === "PENDING_REVIEW" && current.status !== "PENDING_REVIEW"
            ? { submittedAt: new Date() }
            : {}),
          // Replaced wholesale rather than diffed. The join rows carry nothing
          // but the pair, so there is no state in them worth preserving, and a
          // diff would be three queries to reach the same two rows.
          ...(tagIds
            ? { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        select: STUDIO_FIELDS,
      });

      return toStudioPoem(poem);
    } catch (error) {
      // Racing a delete: the row was there when `ownershipOf` read it and gone
      // by the time this ran.
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchPoem(id);
      }

      throw error;
    }
  }

  /**
   * Deletes a poem — or refuses, if it is currently published.
   *
   * That refusal is rule 4, and it is the same shape as the users service's
   * "deactivate it instead": the destructive act is allowed, but only after the
   * reversible one has been done on purpose. A published poem has an address
   * readers may have shared, and deleting it turns that into a 404 nobody chose;
   * setting `status: DRAFT` first takes it out of the feed, is undoable, and
   * makes the deletion a second decision rather than a surprise inside the
   * first.
   *
   * Once it is down, the delete takes the poem's tag links and its moderation
   * history with it — both relations are `onDelete: Cascade` in schema.prisma,
   * which is the right reading for rows that describe a poem that no longer
   * exists.
   */
  async remove(id: string, actor: Actor): Promise<void> {
    const current = await this.ownershipOf(id);

    assertMayReach(actor, current);

    if (current.status === "PUBLISHED") {
      throw new ConflictException(
        "This poem is published, and readers may have its address. Take it down first — " +
          "send status DRAFT — and then delete it.",
      );
    }

    try {
      // `select` narrowed to the one column: nothing reads the deleted row, and
      // this is a 204, so there is no reason to carry it back from the database.
      await this.prisma.poem.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw noSuchPoem(id);
      }

      throw error;
    }
  }

  /**
   * The three columns the rules above need, and the 404 for a poem that is not
   * there.
   *
   * A read before the write, so it races in principle. Folding the conditions
   * into the `update`'s own `where` would avoid that and cost all three
   * messages: "no such poem", "not yours" and "publishing is an editor's" would
   * collapse into one indistinguishable P2025, and the author would be told
   * nothing at all. The same trade `UsersService.roleOf` makes, for the same
   * reason.
   */
  private async ownershipOf(id: string): Promise<Ownership> {
    const poem = await this.prisma.poem.findUnique({ where: { id }, select: OWNERSHIP_FIELDS });

    if (!poem) {
      throw noSuchPoem(id);
    }

    return poem;
  }

  /**
   * Tag slugs → tag ids, refusing any the archive does not have.
   *
   * Tags are curated on purpose (see the `Tag` model in packages/db), so this
   * looks them up rather than upserting them: a themed archive whose themes are
   * typed freehand by every author acquires five spellings of "Меланхолія" and
   * stops being browsable. The 400 names the slugs that missed, because "one of
   * your tags is wrong" is not something a client can act on.
   *
   * Duplicates are collapsed first. `PoemTag`'s primary key is the pair, so
   * `["nich", "nich"]` would otherwise be a unique violation surfacing as a
   * confusing 409 for what is plainly one theme named twice.
   */
  private async resolveTags(slugs: string[] | undefined): Promise<string[]> {
    if (!slugs) {
      return [];
    }

    const wanted = [...new Set(slugs)];

    if (wanted.length === 0) {
      return [];
    }

    const found = await this.prisma.tag.findMany({
      where: { slug: { in: wanted } },
      select: { id: true, slug: true },
    });

    if (found.length !== wanted.length) {
      const known = new Set(found.map((tag) => tag.slug));
      const missing = wanted.filter((slug) => !known.has(slug));

      throw new BadRequestException(
        `No theme has the slug ${missing.map((slug) => `"${slug}"`).join(", ")}. ` +
          `Themes are curated — a poem can be filed under up to ${POEM_TAGS_MAX} of the ` +
          "existing ones, and new ones are not created by writing a poem.",
      );
    }

    return found.map((tag) => tag.id);
  }

  /**
   * A free address for a new poem, derived from its title.
   *
   * One indexed range scan over the handful of rows sharing the base, rather
   * than a read of the whole column: `startsWith` on a B-tree prefix is exactly
   * what the unique index on `slug` already supports. It does not make the
   * insert safe on its own — two requests can settle on the same suffix — which
   * is what the unique violation in `create` is there to catch.
   */
  private async deriveSlug(title: string): Promise<string> {
    const neighbours = await this.prisma.poem.findMany({
      where: { slug: { startsWith: slugPrefix(title, SLUG_FALLBACK) } },
      select: { slug: true },
    });

    return uniqueSlug(
      title,
      neighbours.map((one) => one.slug),
      SLUG_FALLBACK,
    );
  }
}
