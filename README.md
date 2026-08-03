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
└── shared/     types + zod schemas imported by both
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

Copy `apps/web/.env.example` and `apps/api/.env.example` to `.env.local` / `.env` if you need to change ports or the API URL.

The API documents itself from the zod schemas in `packages/shared` — a schema listed in [openapi-schemas.ts](apps/api/src/swagger/openapi-schemas.ts) becomes an OpenAPI component, and controllers point at it with `zodRef("Name")`. There are no duplicate DTO classes to keep in sync. `SWAGGER_ENABLED=false` hides the docs.

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
