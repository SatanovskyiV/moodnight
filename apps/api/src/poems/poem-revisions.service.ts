import { Injectable } from "@nestjs/common";
import type { PoemRevisions } from "@moodnight/shared";

import { PrismaService } from "../prisma/prisma.service";
import { noSuchPoem } from "./poem-access";
import { REVISION_FIELDS } from "./poem-fields";
import { toRevisions } from "./poem-mappers";

/**
 * The trail behind `lastEdit` — every version a poem's text has had, and who
 * wrote each one.
 *
 * The fifth service on `/poems` and the only one that reads a table other than
 * `poems`. It takes no base constraint, unlike the four beside it, because it
 * does not need one: the controller's `@Roles("EDITOR")` floor is the whole of
 * who may be here, and an editor may reach every poem (rule 2 in ./poem-access).
 * There is no narrower set for a query parameter to widen past.
 *
 * Which is also why no `assertMayReach` is applied. It would be a rule that
 * cannot fail — every caller who gets this far is a moderator, and moderators
 * reach everything — and a check that can only pass reads as though it were
 * protecting something.
 */
@Injectable()
export class PoemRevisionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every version of one poem, oldest first.
   *
   * Ordered by `version`, which is a column rather than a position, so the
   * numbers a client renders are the numbers the rows were given. They count up
   * but need not run consecutively: a poem past `POEM_REVISIONS_MAX` has had the
   * middle of its trail pruned, and the jump from 1 to 52 is where those versions
   * were. That gap is the honest answer, and the reason numbering by position was
   * given up — it would have renumbered the survivors and shown a hundred rows as
   * though they were the whole story.
   *
   * Unpaginated, and that is a decision rather than an omission. A trail is at
   * most `POEM_REVISIONS_MAX` entries by construction, so there is a bound
   * already; `page`, `perPage`, `sort` and `order` would be four parameters that
   * either do nothing or let a caller read a history out of order, which is the
   * one thing this endpoint must not offer.
   *
   * **The 404 costs a second query, and only on the way to failing.** A trail
   * that comes back empty is almost always a mistyped id, but "no such poem" and
   * "a poem with nothing on record" are different answers and an editor looking
   * at the poem they asked about deserves the second rather than being told it
   * does not exist. The confirming read runs only when there is nothing to
   * return, so the ordinary path is one query.
   *
   * The second case should not arise at all: a poem's first version is written in
   * the same statement as the poem, and the backfill in 20260816120000 gave one
   * to every poem older than the table. It is answered rather than asserted
   * because if the invariant ever does break, an empty history is the true thing
   * to say about it — and a 404 would send an editor looking for a poem that is
   * sitting in front of them.
   */
  async list(id: string): Promise<PoemRevisions> {
    const rows = await this.prisma.poemRevision.findMany({
      where: { poemId: id },
      select: REVISION_FIELDS,
      orderBy: { version: "asc" },
    });

    if (rows.length === 0) {
      const poem = await this.prisma.poem.findUnique({ where: { id }, select: { id: true } });

      if (!poem) {
        throw noSuchPoem(id);
      }
    }

    return { items: toRevisions(rows) };
  }
}
