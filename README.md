# moodnight

A space for Ukrainian poetry.

**Live (prototype):** https://satanovskyiv.github.io/moodnight/

**Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md) — the plan for turning the prototype into a real product (Next.js + NestJS + Postgres), phase by phase.

The repo holds two things side by side: the monorepo that is being built, and the original static prototype it replaces. The prototype stays until the port is complete — it is the visual reference every phase is checked against.

```
apps/
├── web/        Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui)
└── api/        NestJS 11
packages/
├── shared/     types + zod schemas imported by both
└── db/         Prisma schema, migrations, and the client apps/api injects
prototype/      the original static prototype — reference, not built
docs/           ROADMAP.md
index.html      GitHub Pages entry → prototype/MoodNight.html
```

## The monorepo

### Running locally

```bash
pnpm install
pnpm dev                     # web :3000, api :3001
curl localhost:3001/health   # {"status":"ok","service":"moodnight-api","uptime":…}
open localhost:3001/docs     # Swagger UI; the raw document is on /docs/json
```

Copy `apps/web/.env.example` and `apps/api/.env.example` to `.env.local` / `.env` if you need to change ports or the API URL. The API also needs a database — see below; it refuses to start without one.

`pnpm dev` needs neither file: the web app falls back to `localhost:3001` for the API in development. `pnpm build` does need `API_ORIGIN` — it is where the `/api` proxy forwards to, so building without one is a deploy that looks green and cannot reach the API at all, and the build stops instead.

The API documents itself from the zod schemas in `packages/shared` — a schema listed in [openapi-schemas.ts](apps/api/src/swagger/openapi-schemas.ts) becomes an OpenAPI component, and controllers point at it with `zodRef("Name")`. There are no duplicate DTO classes to keep in sync. `SWAGGER_ENABLED=false` hides the docs.

The same schemas validate what comes in: a write endpoint applies [`ZodValidationPipe`](apps/api/src/common/zod-validation.pipe.ts) to its `@Body`, so the shape Swagger documents is the shape the route enforces, and a rejected request comes back as `{ statusCode, error, message: [...] }` — the shape Nest's own `ValidationPipe` produces.

### The web app's API client

`apps/web` does not hand-write requests. [orval](https://orval.dev) generates them from the API's own OpenAPI document, so the chain from one definition to the calling code is unbroken: zod schema in `packages/shared` → `components.schemas` in the document → TypeScript in `apps/web/src/lib/api/generated`.

Every endpoint arrives as a **[TanStack Query](https://tanstack.com/query) hook** — `useLogin`, `useListUsers`, `useGetUser` — as well as a plain function. Components call the hooks and get caching, deduplication, retries, and `isPending`/`error` without any of it being written here; a new endpoint gets all of it by existing. The plain functions are still the right thing outside a component, or when an endpoint's HTTP method disagrees with what it means: `SessionProvider` wraps `refresh` in its own `useQuery` because `POST /auth/refresh` is a read as far as the browser is concerned.

```bash
pnpm api:generate            # re-emit apps/api/openapi.json, then regenerate the client
```

Run it after changing any controller, schema or route. **Both outputs are committed**, which is what lets `apps/web` be typechecked and built without booting the API against a database — and CI runs the same command and fails if the result differs from what was committed, so they cannot quietly go stale.

Three files around it are hand-written and stay that way:

- [request.ts](apps/web/src/lib/api/request.ts) — the transport every generated endpoint calls: the base URL, `credentials: "include"` for the refresh cookie, and body parsing that tolerates a 204 with nothing in it. Anything outside 2xx throws an `ApiRequestError`, which is what makes the generated hooks behave like query hooks — `error`, `retry` and `isSuccess` are all driven by a rejected fetcher. Adding an endpoint adds no code here.
- [error.ts](apps/web/src/lib/api/error.ts) — that error, plus `payload()`, which picks the successful member out of a generated response union so a caller reads a `Session` rather than a `Session | void`.
- [components/query](apps/web/src/components/query/index.tsx) — the `QueryClient` the whole tree shares, and the three defaults this site argues for: retry only what never arrived or broke on the way, no refetch on window focus, a minute of `staleTime`.

`apps/api/openapi.json` is produced by [emit-openapi.ts](apps/api/src/swagger/emit-openapi.ts) from the same builder that serves `/docs`, in Nest's preview mode — the module graph is explored without instantiating a provider, so it needs no database, no secrets and no listening port.

### Authentication

`POST /auth/register` and `POST /auth/login` both answer with a short-lived **access token** in the body and a long-lived **refresh token** in an httpOnly cookie. Passwords are argon2id ([apps/api/src/auth/password.ts](apps/api/src/auth/password.ts)).

```bash
# The web app's proxy, not :3001 directly — the refresh cookie is pathed for
# how the browser reaches the API, and curl matches paths the same way it does.
# `pnpm dev` runs both, so this is already up.
API=localhost:3000/api

curl -s -c jar.txt -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@moodnight.dev","password":"moodnight-dev"}' | jq -r .accessToken > tok

curl -s $API/auth/me    -H "authorization: Bearer $(cat tok)"   # the signed-in account
curl -s $API/users      -H "authorization: Bearer $(cat tok)"   # guarded; 401 without
curl -s -b jar.txt -X POST $API/auth/refresh                     # a new access token
curl -i -b jar.txt -X POST $API/auth/logout                      # 204, and revokes
```

`moodnight-dev` is the seeded password for every account the seed creates — it exists only on a local database, and nothing seeds a deployed one.

Two things worth knowing before changing any of it:

- **Signing out revokes everywhere.** There is no sessions table; instead every refresh token carries the account's `tokenVersion`, and `POST /auth/logout` increments the column, so every refresh token ever issued for that account stops verifying at once. Access tokens already handed out keep working until they expire — minutes, not days.
- **The browser never calls the API directly — it calls `/api` on the web app's own origin**, and the rewrite in [next.config.ts](apps/web/next.config.ts) forwards it. That exists for one reason: the two Vercel projects are different subdomains of `vercel.app`, which the Public Suffix List makes *cross-site*, so a refresh cookie set by the api project is a third-party cookie. Safari has blocked those outright since 13.1, as do Chrome's incognito windows and Brave — sign-in worked, the cookie was dropped, and the next reload showed "sign in" again. `SameSite=None` asks permission; it does not grant it. Behind the proxy the cookie is first-party, so it is plain `SameSite=Lax` and behaves the same in development and production. Its `Path` is `/api/auth` — the path the *browser* uses — which is the one part of [refresh-cookie.ts](apps/api/src/auth/refresh-cookie.ts) that has to move if the proxy prefix ever does.

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are required and must differ — see [apps/api/.env.example](apps/api/.env.example). The API refuses to start without them.

**Who may do what.** `/users` is the administrative surface, not the way anyone signs up, and every route on it now requires a token and a minimum role — reads for `EDITOR` and above, writes for `ADMIN` and above. Two rules about `ROOT` sit under those, in the service: only a root may appoint a root, and only a root may edit or delete the account that is one. The single-root index enforces *how many* root accounts exist; those two enforce who may become one.

### Lists

Every list endpoint on this API pages, searches, filters and sorts the same way, and none of it is written per endpoint. A resource declares which of *its own properties* take part, and the query parameters, the OpenAPI document, the generated client and the Prisma `where` all follow from that one declaration:

```ts
// packages/shared/src/user.ts
export const userList = defineList({
  item: userSchema,
  searchable: ["name", "surname", "email"],
  sortable: ["name", "surname", "email", "role", "createdAt"],
  filterable: ["role"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
});
```

```bash
curl -s "$API/users?search=леся&role=ADMIN&role=EDITOR&sort=surname&order=asc&page=2&perPage=10" \
  -H "authorization: Bearer $(cat tok)"
# { "items": [...], "total": 137, "page": 2, "perPage": 10, "pageCount": 14 }
```

The field names are checked against `userSchema`, so a renamed column is a failed build rather than a parameter that silently matches nothing, and a property nobody listed is not sortable, not filterable and not searched. **The omission is the boundary** — `?sort=passwordHash` is a 400 for a parameter that was never offered, not a query that happens to find nothing.

What the three lists mean, and the parts worth knowing before adding the next one ([packages/shared/src/list.ts](packages/shared/src/list.ts) and [apps/api/src/common/list-query.ts](apps/api/src/common/list-query.ts)):

- **`search`** is one parameter matched against every searchable property, case-insensitively. It splits on whitespace and every term has to match *something* — so `?search=леся укра` finds Леся Українка across two columns, which a single `contains` over the whole phrase never would. It compiles to a leading-wildcard `ILIKE`, which no B-tree index can serve; `pg_trgm` is the answer when one of these tables stops being small.
- **A filter is a parameter of the property's own name**, taking the property's own values — `?role=ADMIN`, repeated for several. Because the accepted values come from `userRoleSchema` itself, a new role becomes filterable the day it is added to the enum. The cost of the flat naming is one shared namespace, so `defineList` refuses at import time to build a filter called `page`, `perPage`, `search`, `sort` or `order`.
- **`sort` is always made total** by appending the primary key in the same direction. A sort that is not total is a paging bug rather than an aesthetic one: rows that tie have no order between them, so Postgres may put the same row on page 1 and page 2 and skip another entirely. `?sort=role` orders by the Postgres enum's declaration order, which is the privilege ladder rather than the alphabet.
- **`perPage` is capped**, and asking for more is a 400 rather than something quietly clamped — a client told it received 1000 rows when it received 100 will page straight past the rest.
- **Every parameter is optional and an empty one reads as absent**, so a table can keep its controls in the URL and clear them without pruning the query string. An *unrecognised* parameter is still a 400 naming the key, for the same reason the write schemas are strict: `?nmae=Леся` would otherwise come back looking like a successful search over every row.

Two things a list does not do. It is not a query language — no `?filter[name][gte]`, no boolean expressions, no client-chosen `select`; each of those is a way to write SQL through a URL, and the cost lands on whoever has to make it safe and indexable later. And the page and its `total` are two queries running together rather than one transaction, so a row written between them can make the count differ by one — the right trade for an administration table on a database that scales to zero.

One caveat about alphabetical sorting: it is whatever the database's collation says it is, and a Postgres initialised under the `C` locale sorts Cyrillic by code point — і, ї, є and ґ land after я, and every capital before every lowercase. If that turns out to be true of the local container or of Neon, the fix is a migration giving `name` and `surname` an ICU collation (`ALTER TABLE "users" ALTER COLUMN "name" TYPE VARCHAR(100) COLLATE "uk-UA-x-icu"`), not a change in the list definition — Prisma cannot express a collation, so it is hand-written SQL of the same kind as `users_one_root`.

### The database

Postgres via Prisma 7, all of it in `packages/db`. Nothing else in the repo talks to the database directly: `apps/api` injects `PrismaService`, and `apps/web` never connects at all — its read path is ISR-cached and goes over HTTP.

**Locally it runs in Docker.** [packages/db/compose.yaml](packages/db/compose.yaml) defines a Postgres pinned to the major Neon runs, on `localhost:5432`, with its data in a named volume. From a fresh clone:

```bash
pnpm db:up                    # start Postgres, wait until it accepts connections
pnpm db:migrate               # apply the migrations
pnpm db:seed                  # a few users, one per role — all with the same password
pnpm dev
```

`pnpm db:up` returns only once the container reports healthy, so the three lines can be chained without the migration racing the server's startup.

**The connection string** lives in `packages/db/.env` — one file, read by both the Prisma CLI and `apps/api`, so it is never copied per app. The local one is written for you against the container above; copy `packages/db/.env.example` over it to point somewhere else. In production nothing reads a file: Vercel supplies the same variables to the api project.

Two strings there, and they are not interchangeable: **`DATABASE_URL`** is Neon's pooled `-pooler` host, which the application connects through, and **`DIRECT_URL`** is the unpooled one, which migrations use because PgBouncer in transaction mode cannot hold the locks the schema engine takes out. A local Postgres has neither — it needs only `DATABASE_URL`, which `DIRECT_URL` falls back to.

```bash
pnpm db:up / db:down          # start / stop the container — data survives both
pnpm db:nuke                  # stop it and delete the volume, for a truly empty start
pnpm db:migrate               # create + apply a migration from schema changes (dev)
pnpm db:seed                  # re-run the seed; idempotent, safe any time
pnpm db:reset                 # wipe, re-apply every migration, re-seed
pnpm db:generate              # regenerate the client — also runs on install and build
pnpm db:status                # which migrations the database is missing
pnpm db:studio                # browse the data
pnpm db:deploy                # apply pending migrations — production only, never generates
```

**No Docker?** `pnpm db exec prisma dev` starts a Postgres the Prisma CLI ships with and prints a `DATABASE_URL` to paste into `packages/db/.env`. A Neon database works the same way. Nothing else in the workflow changes.

**The seed** is [packages/db/src/seed.ts](packages/db/src/seed.ts), every row an `upsert` on a natural key so re-running it is always safe. `prisma migrate reset` runs it automatically, which is what makes `pnpm db:reset` a one-command return to a known state.

**Roles** are `ROOT | ADMIN | EDITOR | AUTHOR`, in descending order of privilege, and everyone registers as an `AUTHOR`. `ROOT` is the site owner and **there is at most one of them** — enforced by a partial unique index, `users_one_root`, created in [20260804121000_one_root_account](packages/db/prisma/migrations/20260804121000_one_root_account/migration.sql). Creating or promoting a second root is a 409 from the API, and a rejected write from anything talking to Postgres directly. The role can still be handed over: demote the current root, then promote the next one.

That index is the one thing in the schema that Prisma cannot express — there is no syntax for a filtered index — so it lives only in the migration. **If `pnpm db:migrate` ever generates a `DROP INDEX "users_one_root"`, delete that line before applying the migration.** It is the standard cost of a database feature Prisma does not model, and the comment under the `User` model says so too.

**Changing the schema** means editing [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) and running `pnpm db:migrate`, which writes the SQL to `packages/db/prisma/migrations/` — committed, reviewed like any other code, and applied in order everywhere else with `pnpm db:deploy`. The SQL is never edited after it has been applied anywhere; a mistake is corrected by a new migration.

Two of those migrations do one thing each for a reason: Postgres will not let a transaction use an enum value that the same transaction added, and Prisma runs every migration in a transaction, so `ROOT` is added in one migration and first used by the index in the next.

The generated client is **not** committed. It is rebuilt from the schema on every install and every build, so it cannot drift from the migrations.

Where things are: connection URLs in [prisma.config.ts](packages/db/prisma.config.ts) for the CLI, the runtime pool and driver adapter in [src/client.ts](packages/db/src/client.ts), and the Nest provider in [apps/api/src/prisma/prisma.service.ts](apps/api/src/prisma/prisma.service.ts). The schema itself holds no URLs — Prisma 7 rejects them there, which is the right default for a committed file.

### Verification

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The same five commands run in CI on every PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

### Tests

[Vitest](https://vitest.dev), from the repo root:

```bash
pnpm test                                # the whole workspace
pnpm --filter @moodnight/api test        # one package
pnpm --filter @moodnight/api test:watch  # rerun on save
```

**Nothing has to be running.** No `pnpm db:up`, no containers — see the trade-off below.

Turbo caches `pnpm test`, so a second run with no changes prints `>>> FULL TURBO` and skips the suite. That is a real pass, not a silent one; `pnpm test --force` runs it anyway when you want to watch it happen.

To narrow a run, use Vitest directly from inside the package — Turbo's filters select packages, not files:

```bash
cd apps/api
pnpm vitest run src/users                          # a directory
pnpm vitest run users.controller                   # a file, by path substring
pnpm vitest run -t "409s when the email is taken"  # a single test, by name
```

Specs sit next to what they test — `users.service.spec.ts` beside `users.service.ts` — so neither can be renamed without the other showing up in the same diff. Endpoint specs boot a real Nest application and drive it with supertest, so a request travels the whole path a client's would: routing, the UUID and zod pipes, status codes, exception mapping. Calling a controller method directly would test only the line that delegates to the service.

Tokens in the specs are **real** ones, signed and verified by the same `TokensService` the app uses ([apps/api/src/testing/auth-harness.ts](apps/api/src/testing/auth-harness.ts) sets the test secrets and mints them). Argon2 hashing is real too — which is why the fixture hash in `prisma-mock.ts` is a literal rather than something recomputed per file.

**No test touches a database.** Prisma is stubbed in [apps/api/src/testing/prisma-mock.ts](apps/api/src/testing/prisma-mock.ts), which is what lets the suite pass on a laptop with nothing up and in CI with no database service. The trade is that the queries themselves are unverified: a test asserts that `findMany` was called with the right `select` and `orderBy`, not that Postgres answers it correctly. Integration tests against the Docker Postgres above are the missing half, and are worth adding when the schema grows relations that a mock stops being able to describe honestly.

Adding tests to a package that has none yet takes three things, copied from [apps/api](apps/api): a `test` script, a `vitest.config.mts`, and — wherever decorators are involved — the SWC transform that config sets up, because Vitest's default esbuild does not implement `emitDecoratorMetadata` and Nest cannot resolve a single dependency without it.

### Adding shadcn components

One at a time, in the phase that needs it — never ahead of need:

```bash
pnpm dlx shadcn@latest add <name> -c apps/web
```

They arrive gothic automatically: the theme in [apps/web/src/app/globals.css](apps/web/src/app/globals.css) maps the prototype's palette onto shadcn's variable contract.

### Deploying

Two Vercel projects from this one repo, each with its own **Root Directory**: `apps/web` and `apps/api`. Set `API_ORIGIN` on the web project to the api project's URL — that is what its `/api` proxy forwards to, and it is read at build time, so changing it needs a redeploy rather than just a restart. `CORS_ORIGINS` on the api project should still name the web project's URL; no visitor's browser depends on it now that requests are same-origin, but anything calling the API directly does.

The api project also needs `DATABASE_URL`, `DIRECT_URL`, and both JWT secrets (`openssl rand -base64 48`, twice — they must differ). It will not boot without any of them, which is deliberate: a missing secret should stop a deploy, not sign tokens with `undefined`.

Neither project needs a custom build command. Vercel detects Turborepo and builds `--filter` the project, and [turbo.json](turbo.json) makes `build` depend on `^build`, so `packages/db` is built — and the Prisma client generated — before `apps/api` compiles. Leave the dashboard's build and install commands empty; overriding them is what breaks this.

**Environment variables, api project only.** The deployed function needs exactly one: `DATABASE_URL`, Neon's pooled `-pooler` host. Neon's Vercel integration sets it, along with several aliases the app ignores. The web project must not have it — it never connects, and giving it the credentials only widens what a compromise reaches. Note that `apps/api` refuses to boot without it: a missing `DATABASE_URL` takes `/health` down too, not just the database routes.

`DIRECT_URL` is **not** a deployment variable. Only the Prisma CLI reads it, so it belongs wherever migrations are run from — a developer's machine, or CI — and setting it on Vercel does nothing.

**Migrations are not part of the build.** They are run deliberately, so a schema change lands when someone means it to rather than as a side effect of a preview deploy:

```bash
DIRECT_URL="postgresql://…neon.tech/moodnight?sslmode=require" pnpm db:deploy
```

The shell variable wins over `packages/db/.env`, which is why that command reaches Neon rather than the local container without any file being edited.

**Order matters.** Apply the migration *before* the deploy that needs it: code expecting a table Neon does not have yet returns 500s until it exists. The reverse — a column added but unused — is harmless, which is the argument for schema changes that are backwards compatible with the running version.

Do not seed production. [seed.ts](packages/db/src/seed.ts) writes sample users and is meant for a local database.

## The original prototype

React 18 + Babel standalone, no build step — it is not part of the pnpm workspace and nothing builds or lints it. Needs an HTTP server: `file://` won't work, because the JSX is loaded via `<script src>`.

```bash
python3 -m http.server 8777
```

Then open http://localhost:8777/prototype/MoodNight.html — or run it side by side with `pnpm dev` to compare the port against it, which [docs/ROADMAP.md](docs/ROADMAP.md) asks for at the end of every phase that adds screens.

- `prototype/MoodNight.html` — page shell
- `prototype/app.jsx` — page components
- `prototype/data.jsx` — sample poems
- `prototype/ornaments.jsx` — SVG ornaments
- `prototype/styles.css` — styles
- `prototype/tweaks-panel.jsx` — tweaks panel (dropped in the port)
