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

The API documents itself from the zod schemas in `packages/shared` — a schema listed in [openapi-schemas.ts](apps/api/src/swagger/openapi-schemas.ts) becomes an OpenAPI component, and controllers point at it with `zodRef("Name")`. There are no duplicate DTO classes to keep in sync. `SWAGGER_ENABLED=false` hides the docs.

The same schemas validate what comes in: a write endpoint applies [`ZodValidationPipe`](apps/api/src/common/zod-validation.pipe.ts) to its `@Body`, so the shape Swagger documents is the shape the route enforces, and a rejected request comes back as `{ statusCode, error, message: [...] }` — the shape Nest's own `ValidationPipe` produces.

**None of the routes are authenticated yet** — Phase 3 brings the roles guard they need. `GET /users` hands out email addresses and `POST /users` accepts a `role`, so this is not an API to expose publicly before then.

### The database

Postgres via Prisma 7, all of it in `packages/db`. Nothing else in the repo talks to the database directly: `apps/api` injects `PrismaService`, and `apps/web` never connects at all — its read path is ISR-cached and goes over HTTP.

**Locally it runs in Docker.** [packages/db/compose.yaml](packages/db/compose.yaml) defines a Postgres pinned to the major Neon runs, on `localhost:5432`, with its data in a named volume. From a fresh clone:

```bash
pnpm db:up                    # start Postgres, wait until it accepts connections
pnpm db:migrate               # apply the migrations
pnpm db:seed                  # a few users, one per role
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

**Changing the schema** means editing [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) and running `pnpm db:migrate`, which writes the SQL to `packages/db/prisma/migrations/` — committed, reviewed like any other code, and applied in order everywhere else with `pnpm db:deploy`. The SQL is never edited after it has been applied anywhere; a mistake is corrected by a new migration.

The generated client is **not** committed. It is rebuilt from the schema on every install and every build, so it cannot drift from the migrations.

Where things are: connection URLs in [prisma.config.ts](packages/db/prisma.config.ts) for the CLI, the runtime pool and driver adapter in [src/client.ts](packages/db/src/client.ts), and the Nest provider in [apps/api/src/prisma/prisma.service.ts](apps/api/src/prisma/prisma.service.ts). The schema itself holds no URLs — Prisma 7 rejects them there, which is the right default for a committed file.

### Verification

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The same five commands run in CI on every PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

### Adding shadcn components

One at a time, in the phase that needs it — never ahead of need:

```bash
pnpm dlx shadcn@latest add <name> -c apps/web
```

They arrive gothic automatically: the theme in [apps/web/src/app/globals.css](apps/web/src/app/globals.css) maps the prototype's palette onto shadcn's variable contract.

### Deploying

Two Vercel projects from this one repo, each with its own **Root Directory**: `apps/web` and `apps/api`. Set `NEXT_PUBLIC_API_URL` on the web project to the api project's URL, and `CORS_ORIGINS` on the api project to the web project's URL.

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
