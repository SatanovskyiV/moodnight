import { applyDecorators } from "@nestjs/common";
import {
  approvePoemSchema,
  createPoemSchema,
  createUserSchema,
  healthSchema,
  type ListDefinition,
  loginSchema,
  poemAuthorSchema,
  poemEditSchema,
  poemPageSchema,
  poemReviewSchema,
  poemRevisionSchema,
  poemRevisionsSchema,
  poemSchema,
  poemSummarySchema,
  poemTagSchema,
  registerSchema,
  rejectPoemSchema,
  sessionSchema,
  studioPoemPageSchema,
  studioPoemSchema,
  studioPoemSummarySchema,
  updatePoemSchema,
  updateUserSchema,
  userPageSchema,
  userSchema,
} from "@moodnight/shared";
import { ApiQuery } from "@nestjs/swagger";
import type {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { z } from "zod";

/**
 * Every shape the OpenAPI document exposes, keyed by the name it takes in
 * `components.schemas`. The zod schemas in @moodnight/shared stay the single
 * source of truth: nothing here re-declares a payload, so the documented
 * contract cannot drift from the validated one. Add a schema to this map and
 * it is documented; reference it from a controller with `zodRef`.
 *
 * Request bodies belong here as much as responses do — `CreateUser` is the
 * schema the users controller validates against, so what Swagger offers to send
 * is what the endpoint accepts, down to the rejected unknown keys.
 */
const openApiSchemas = {
  Health: healthSchema,
  User: userSchema,
  CreateUser: createUserSchema,
  UpdateUser: updateUserSchema,
  Register: registerSchema,
  Login: loginSchema,
  // Nests `User`, and because the whole map goes through one zod registry below
  // it comes out as a `$ref` to the sibling component rather than a second
  // inlined copy of the user shape.
  Session: sessionSchema,
  // The same, for the paged envelope every list endpoint answers with. Only the
  // envelope is named per resource; what a page *of* looks like is `User`.
  UserPage: userPageSchema,
  // The public read path. `PoemAuthor` and `PoemTag` are registered in their own
  // right rather than left to be inlined: both are nested by two of the three
  // shapes below, and naming them here is what makes the generated client
  // produce one `PoemAuthor` type instead of two structurally identical
  // anonymous ones.
  PoemAuthor: poemAuthorSchema,
  PoemTag: poemTagSchema,
  // Two shapes for one model, which the document should say plainly: `Poem` has
  // the body and comes from `/poems/{slug}`, `PoemSummary` has the teaser and is
  // what a page of the feed is made of.
  Poem: poemSchema,
  PoemSummary: poemSummarySchema,
  PoemPage: poemPageSchema,
  // Nested by both studio shapes, and registered in its own right for the same
  // reason `PoemAuthor` is: one `PoemReview` type in the generated client rather
  // than two identical anonymous ones. Its `reviewer` is a `PoemAuthor` — an
  // editor is a poet with a role, and the fields a client renders are the same
  // ones — so the document reuses that component instead of naming a second
  // shape with the same five properties.
  PoemReview: poemReviewSchema,
  // Nested by both studio shapes as `lastEdit`, and registered for the same
  // reason `PoemReview` is. Its `editor` is a `PoemAuthor` too — the third use
  // of that component, and the third time the answer to "what may be said about
  // an account" is the same five columns.
  PoemEdit: poemEditSchema,
  // The trail behind `lastEdit`, from `GET /poems/{id}/revisions`. Both halves
  // are named: `PoemRevision` because a client renders one version at a time and
  // wants a type for it, and `PoemRevisions` because the envelope is what the
  // endpoint answers with.
  PoemRevision: poemRevisionSchema,
  PoemRevisions: poemRevisionsSchema,
  // The write path, and a third shape for the same model — which the document
  // should say plainly rather than leave a client to discover. `StudioPoem`
  // carries `status` and a nullable `publishedAt` because that is what a poem
  // looks like before it is public, and `Poem` above cannot describe a draft.
  StudioPoem: studioPoemSchema,
  CreatePoem: createPoemSchema,
  UpdatePoem: updatePoemSchema,
  // The private read path, which repeats the summary/full split one level down:
  // `StudioPoemSummary` is a row in the studio's dashboard or the moderation
  // queue, `StudioPoem` above is the poem an editor is about to decide on.
  StudioPoemSummary: studioPoemSummarySchema,
  // One envelope for both `GET /studio/poems` and `GET /admin/queue`. They
  // answer with the same rows — what differs is *which* rows, and that is a
  // `where` clause rather than a shape. Registering it twice would put two
  // structurally identical types in the generated client and leave a queue table
  // unable to reuse the studio's row renderer.
  StudioPoemPage: studioPoemPageSchema,
  // The two decisions. Separate schemas rather than one with an `action`,
  // because the note is optional on an approval and required on a rejection —
  // which is the application half of a promise `Review.note`'s nullable column
  // cannot make on its own.
  ApprovePoem: approvePoemSchema,
  RejectPoem: rejectPoemSchema,
} satisfies Record<string, z.ZodType>;

export type OpenApiSchemaName = keyof typeof openApiSchemas;

/** `@ApiOkResponse({ schema: zodRef("Health") })` — a `$ref` into the components above. */
export function zodRef(name: OpenApiSchemaName): ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

/**
 * Documents a list endpoint's query parameters from the same zod schema its
 * `@Query()` is validated against: `@ApiListQuery(userList)`.
 *
 * OpenAPI has no way to point a whole set of query parameters at one component,
 * so they have to be spelled out one by one — and spelling them out by hand
 * beside a schema that already describes them is exactly the duplication the
 * rest of this file exists to avoid. This walks the schema instead, so
 * `defineList` remains the only place a list's parameters are written down and
 * a new filter is documented by being declared.
 *
 * Read in the **input** direction, which is the difference between a truthful
 * document and a misleading one: `page` and `sort` carry defaults, so their
 * output is always present while their input is optional, and reading the
 * output side would document every parameter as required.
 */
export function ApiListQuery(definition: ListDefinition) {
  const { properties = {}, required = [] } = z.toJSONSchema(definition.query, {
    target: "openapi-3.0",
    io: "input",
  }) as { properties?: Record<string, SchemaObject>; required?: string[] };

  return applyDecorators(
    ...Object.entries(properties).map(([name, { description, ...schema }]) =>
      ApiQuery({ name, description, required: required.includes(name), schema }),
    ),
  );
}

/**
 * Converts the map into OpenAPI 3.0 component schemas. Going through a zod
 * registry rather than converting each schema on its own is what makes nested
 * schemas (Poem → Author, once Phase 2 lands) come out as `$ref`s to sibling
 * components instead of being inlined at every use site.
 */
export function buildComponentSchemas(): Record<string, SchemaObject> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(openApiSchemas)) {
    registry.add(schema, { id });
  }

  const { schemas } = z.toJSONSchema(registry, {
    target: "openapi-3.0",
    uri: (id) => `#/components/schemas/${id}`,
  });

  return Object.fromEntries(
    // `uri` also stamps each schema with a `$id`; OpenAPI has no use for it.
    Object.entries(schemas).map(([name, { $id: _id, ...schema }]) => [
      name,
      schema as SchemaObject,
    ]),
  );
}
