import {
  createUserSchema,
  healthSchema,
  loginSchema,
  registerSchema,
  sessionSchema,
  updateUserSchema,
  userSchema,
} from "@moodnight/shared";
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
} satisfies Record<string, z.ZodType>;

export type OpenApiSchemaName = keyof typeof openApiSchemas;

/** `@ApiOkResponse({ schema: zodRef("Health") })` — a `$ref` into the components above. */
export function zodRef(name: OpenApiSchemaName): ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

/** The same, for the list endpoints: `@ApiOkResponse({ schema: zodArrayRef("User") })`. */
export function zodArrayRef(name: OpenApiSchemaName): SchemaObject {
  return { type: "array", items: zodRef(name) };
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
