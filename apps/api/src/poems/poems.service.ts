import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@moodnight/db";
import {
  type ListPoemsQuery,
  type Poem,
  poemList,
  type PoemPage,
  type PoemSummary,
} from "@moodnight/shared";

import { listArgs, toPage } from "../common/list-query";
import { PrismaService } from "../prisma/prisma.service";
import { type FullPoemRow, POEM_FIELDS, POEM_RELATIONS, type PoemRow } from "./poem-fields";
import { toTeaser } from "./poem-mappers";

/**
 * The public read path. Everything here answers anonymous requests, is cached
 * by Next.js at the edge, and never sees a signed-in user — which is why there
 * is no actor parameter anywhere in this file and no guard on the controller.
 *
 * The single rule the whole service is built around: **a poem that is not
 * PUBLISHED must never leave here.** That is not enforced by remembering to
 * write it into each method. It is {@link PUBLIC_POEMS} below, handed to
 * `listArgs` as a base constraint that no query parameter can lift, and spelled
 * into the one `findFirst` that does not go through the list framework.
 */

/**
 * The constraint that makes these endpoints public.
 *
 * `publishedAt: { not: null }` looks redundant beside the status — Phase 4's
 * transitions will always set one with the other — but it is what lets the wire
 * schema declare `publishedAt` non-nullable and mean it. A row that somehow
 * held PUBLISHED with no date would be excluded rather than serialised with a
 * fabricated one.
 */
const PUBLIC_POEMS = {
  status: "PUBLISHED",
  publishedAt: { not: null },
} as const satisfies Prisma.PoemWhereInput;

/**
 * The shared half of both mappers: Prisma's `Date`s become ISO strings, and the
 * join rows on `tags` are flattened to the tags themselves.
 *
 * `publishedAt` cannot be null for any row either query returns —
 * {@link PUBLIC_POEMS} is on both — so the fallback is unreachable rather than a
 * default. It coalesces to `createdAt` instead of throwing because a reader who
 * asked for a poem deserves the poem, and a date that is merely too early is a
 * better failure than a 500 on a page that would otherwise have rendered.
 */
function toCore(row: PoemRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    tags: row.tags.map(({ tag }) => tag),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    readCount: row.readCount,
    featured: row.featured,
  };
}

/** A row as a card wants it: the core fields, and the teaser instead of the body. */
function toSummary(row: FullPoemRow): PoemSummary {
  return { ...toCore(row), ...toTeaser(row.body) };
}

@Injectable()
export class PoemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of published poems, searched, filtered and ordered as the query
   * asks — the feed, `/tag/[slug]` and `/author/[slug]` all being this method
   * with a different query string.
   *
   * The body is read out of the database and thrown away after
   * {@link toTeaser} cuts it, which is deliberate. Postgres stores a poem's text
   * inline or in TOAST depending on its length, and either way fetching it costs
   * far less than the round trip would cost to fetch the rest again — while
   * *sending* twelve full poems to a scroller that renders six lines of each is
   * a cost paid on every page, by every reader.
   */
  async list(query: ListPoemsQuery): Promise<PoemPage> {
    const { where, orderBy, skip, take } = listArgs<
      Prisma.PoemWhereInput,
      Prisma.PoemOrderByWithRelationInput
    >(poemList, query, { base: PUBLIC_POEMS, relations: POEM_RELATIONS });

    const [poems, total] = await Promise.all([
      this.prisma.poem.findMany({
        where,
        orderBy,
        skip,
        take,
        select: { ...POEM_FIELDS, body: true },
      }),
      // The same `where`, so the count can never describe a different set of
      // rows than the page it is the total for.
      this.prisma.poem.count({ where }),
    ]);

    return toPage(poems.map(toSummary), total, query);
  }

  /**
   * One poem by slug, in full.
   *
   * `findFirst` and not `findUnique`, even though `slug` is unique: the lookup
   * carries {@link PUBLIC_POEMS} alongside the slug, and `findUnique` accepts
   * only the unique columns in its `where`. The difference matters — a draft
   * fetched by a guessed slug would otherwise be a published poem as far as
   * this method is concerned.
   *
   * A draft is therefore a 404 and not a 403, which is the right answer to give
   * a stranger: "no such poem" tells them nothing, while "you may not see this
   * one" confirms it exists and is worth guessing at.
   */
  async findBySlug(slug: string): Promise<Poem> {
    const poem = await this.prisma.poem.findFirst({
      where: { slug, ...PUBLIC_POEMS },
      select: { ...POEM_FIELDS, body: true },
    });

    if (!poem) {
      throw new NotFoundException(`No published poem with the slug ${slug}.`);
    }

    return { ...toCore(poem), body: poem.body };
  }
}
