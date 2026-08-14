import { Injectable } from "@nestjs/common";
import type { Prisma } from "@moodnight/db";
import {
  type Actor,
  type ListStudioPoemsQuery,
  type StudioPoem,
  type StudioPoemPage,
  studioPoemList,
} from "@moodnight/shared";

import { listArgs, toPage } from "../common/list-query";
import { PrismaService } from "../prisma/prisma.service";
import { assertMayReach, noSuchPoem, OWNERSHIP_FIELDS } from "./poem-access";
import { STUDIO_FIELDS } from "./poem-fields";
import { toStudioPoem, toStudioSummary } from "./poem-mappers";

/**
 * The studio's read path — an author's own shelf, and any one poem in full.
 *
 * The third service on `/poems` and the third base constraint, which is the
 * whole reason the classes are separate rather than one file with eight
 * methods. `PoemsService` can only ever see published poems; `PoemWritesService`
 * takes an actor and writes; this one takes an actor and reads what the public
 * path must never return. Each class guarantees one thing about every query it
 * makes, and none of them can be reached through another by mistake.
 *
 * The two methods here answer the same question at two scopes, and the
 * difference between them is deliberate:
 *
 * - **{@link listMine} is pinned to the caller.** `authorId` is a base
 *   constraint, so no query parameter narrows *or widens* past it — an editor
 *   listing here sees their own drafts and nobody else's, because the studio is
 *   where you keep your own work and the queue is where you read other people's.
 * - **{@link findById} is not pinned, and applies the ownership rule instead.**
 *   An editor has to be able to open somebody else's pending poem in full: a
 *   decision made on six lines of teaser is not a review, and the `PATCH` that
 *   fixes a line before approving needs the text it is fixing. The rule is
 *   `assertMayReach` in ./poem-access — the same one the write path applies, so
 *   an editor cannot reach a poem to read that they could not reach to change.
 */

@Injectable()
export class PoemStudioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the caller's own poems, whatever state each is in — the
   * dashboard at `/studio/poems`.
   *
   * The body is read and thrown away after {@link toStudioSummary} cuts the
   * teaser, which is the same trade the public feed makes and for the same
   * reason: one round trip that fetches a little too much beats two, and what
   * is expensive is *sending* twenty whole poems to a table that renders six
   * lines of each.
   */
  async listMine(query: ListStudioPoemsQuery, actor: Actor): Promise<StudioPoemPage> {
    const { where, orderBy, skip, take } = listArgs<
      Prisma.PoemWhereInput,
      Prisma.PoemOrderByWithRelationInput
    >(studioPoemList, query, { base: { authorId: actor.id } });

    const [poems, total] = await Promise.all([
      this.prisma.poem.findMany({ where, orderBy, skip, take, select: STUDIO_FIELDS }),
      // The same `where`, so the count can never describe a different set of
      // rows than the page it is the total for.
      this.prisma.poem.count({ where }),
    ]);

    return toPage(
      poems.map((poem) => toStudioSummary(poem, actor.role)),
      total,
      query,
    );
  }

  /**
   * One poem in full, for the person who wrote it or the editor about to decide
   * on it.
   *
   * By id and not by slug, which is the same choice the write routes make: this
   * is the studio's key, it exists before a slug is settled, and it survives the
   * poem being retitled. `GET /poems/{slug}` is the public address and stays
   * that way.
   *
   * The 404 comes before the 403, which is the honest order: "there is no such
   * poem" is true of an id that matches nothing regardless of who is asking,
   * and answering 403 first would tell a caller that a poem exists whenever
   * they guessed an id wrong.
   */
  async findById(id: string, actor: Actor): Promise<StudioPoem> {
    const poem = await this.prisma.poem.findUnique({
      where: { id },
      select: { ...STUDIO_FIELDS, ...OWNERSHIP_FIELDS },
    });

    if (!poem) {
      throw noSuchPoem(id);
    }

    assertMayReach(actor, poem);

    return toStudioPoem(poem, actor.role);
  }
}
