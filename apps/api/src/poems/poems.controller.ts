import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  type ListPoemsQuery,
  listPoemsQuerySchema,
  type Poem,
  poemList,
  type PoemPage,
} from "@moodnight/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiListQuery, zodRef } from "../swagger/openapi-schemas";
import { PoemsService } from "./poems.service";

/**
 * The reader-facing endpoints, and the only unauthenticated ones on this API
 * besides `/health` and registration.
 *
 * **No `@UseGuards`, and that is the design rather than an omission.** These
 * two routes are what Next.js calls while building the ISR pages a reader
 * actually hits, so the read path stays cacheable at the edge and touches
 * neither a JWT nor — for the overwhelming majority of requests — this function
 * at all. Anything a signed-in reader gets on top of a poem (their own
 * reactions, Phase 5) is a separate authenticated call, precisely so this
 * response can be one cached document shared by everybody.
 *
 * What keeps that safe is in the service: every query carries a base constraint
 * pinning `status` to PUBLISHED, and the author columns are named one by one
 * rather than joined wholesale. A poem in the queue and an author's email
 * address are both unreachable from here by construction, not by a guard that
 * a future route might forget to repeat.
 */
@ApiTags("poems")
@Controller("poems")
export class PoemsController {
  constructor(private readonly poems: PoemsService) {}

  @Get()
  @ApiOperation({
    operationId: "listPoems",
    summary: "List published poems",
    description:
      "One page of published poems, newest first unless asked otherwise. " +
      "Public — no token required, and drafts are unreachable through it.\n\n" +
      "Each poem arrives with a teaser rather than its body: the first few " +
      "lines, plus `truncated` saying whether there is more. The whole text is " +
      "`GET /poems/{slug}`.\n\n" +
      "`search` matches title and subtitle, case-insensitively, and every " +
      "whitespace-separated term has to match one of them. Searching *inside* " +
      "poems is deliberately not offered here — that is Postgres full-text, and " +
      "it arrives beside this rather than inside it.\n\n" +
      "`tag` and `author` take slugs and may each be repeated, which reads as " +
      "'any of these' — `?tag=sakralne&tag=balady` is both themes, not their " +
      "intersection. `featured=true` narrows to what an editor has put on the " +
      "front page.\n\n" +
      "Every parameter is optional and an empty one is read as absent. An " +
      "unrecognised parameter is a 400 rather than something ignored.",
  })
  // Declared from the same schema the pipe below validates against, so the two
  // cannot drift — including the relation filters, which are ordinary query
  // parameters as far as the document is concerned.
  @ApiListQuery(poemList)
  @ApiOkResponse({ description: "A page of poems.", schema: zodRef("PoemPage") })
  @ApiBadRequestResponse({ description: "The query does not match the schema." })
  list(
    @Query(new ZodValidationPipe(listPoemsQuerySchema)) query: ListPoemsQuery,
  ): Promise<PoemPage> {
    return this.poems.list(query);
  }

  // A slug and not an id, because this route *is* the poem's public address:
  // `/poem/tin-nad-polem` in the browser is `GET /poems/tin-nad-polem` here,
  // and a UUID in a shared link would be a worse URL for no gain. Ids stay the
  // internal key and the studio's routes will use them.
  @Get(":slug")
  @ApiOperation({
    operationId: "getPoem",
    summary: "Get a poem",
    description:
      "One published poem by slug, with its full text. A draft, a poem waiting " +
      "in the queue and a slug nobody has used are all the same 404 — telling a " +
      "stranger which of the three it was would confirm the poem exists.",
  })
  @ApiParam({ name: "slug", description: "The poem's slug.", example: "tin-nad-polem" })
  @ApiOkResponse({ description: "The poem.", schema: zodRef("Poem") })
  @ApiNotFoundResponse({ description: "No published poem has that slug." })
  findOne(@Param("slug") slug: string): Promise<Poem> {
    return this.poems.findBySlug(slug);
  }
}
