import { defineConfig } from "orval";

/**
 * Generates `src/lib/api/generated` from the API's OpenAPI document.
 *
 * Run it with `pnpm api:generate` from the repo root, which re-emits the
 * document first — running orval alone regenerates against whatever
 * apps/api/openapi.json currently says, which is the right thing when only the
 * client side is being changed and the wrong thing after touching a controller.
 *
 * The chain behind that file is: the zod schemas in @moodnight/shared, which
 * apps/api validates against and turns into `components.schemas`, which becomes
 * openapi.json, which becomes the types below. One definition of every shape,
 * and a rename anywhere along it fails a build rather than reaching a reader.
 *
 * What is deliberately *not* generated: zod. orval can emit validators from the
 * same document, and having it do so would put a second copy of every schema in
 * the repo, checked against the first by nothing. The forms keep resolving
 * @moodnight/shared, which is the copy the API enforces.
 */
export default defineConfig({
  moodnight: {
    // The file rather than the running server's /docs/json, so generating a
    // client never requires an API to be up — see apps/api/src/swagger/emit-openapi.ts.
    input: { target: "../api/openapi.json" },
    output: {
      // One file per `@ApiTags` — auth.ts, users.ts, health.ts — so the import
      // in a component says which part of the API it reaches for.
      mode: "tags",
      target: "./src/lib/api/generated",
      schemas: "./src/lib/api/generated/model",
      // Every endpoint arrives as a `useX` hook as well as a plain function, and
      // the hooks are what components call — see the react-query note in
      // README.md. Nothing about caching, retries, in-flight state or
      // invalidation is written by hand in this app; this line is where that
      // comes from, and a new endpoint gets all of it by existing.
      //
      // The plain functions remain, and are still the right thing outside a
      // component: `SessionProvider` builds its own `useQuery` around `refresh`
      // because that endpoint is a POST the app treats as a read.
      client: "react-query",
      // …still over `fetch`, not axios, which this app does not have. It is what
      // decides the mutator's signature: `(url, init)` rather than a config
      // object, so ./src/lib/api/request.ts stays a thin wrapper over the
      // platform's own function.
      httpClient: "fetch",
      // Removing an endpoint from the API should delete its client, not leave
      // an orphan that still compiles. Scoped to `target`, so the hand-written
      // request.ts and error.ts beside it are never touched.
      clean: true,
      override: {
        // The whole transport: base URL, credentials, body parsing. Every
        // generated function calls it and none of them know anything else about
        // how a request is made.
        mutator: { path: "./src/lib/api/request.ts", name: "request" },
      },
    },
  },
});
