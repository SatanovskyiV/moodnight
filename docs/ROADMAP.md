# MoodNight — from prototype to product

> **Status:** Phase 1 done, Phase 2 under way, Phase 3's API half landed, the three area shells framed out · **Last updated:** 2026-08-09
> Links to `../prototype/*` refer to the original prototype files, which Phase 1 replaces.

## Context

Today MoodNight is a 2,000-line static prototype: [MoodNight.html](../prototype/MoodNight.html) loads React 18 + Babel-standalone from a CDN and compiles four `.jsx` files in the browser. All data lives in [data.jsx](../prototype/data.jsx) as three hardcoded poems; reactions increment in `useState` and vanish on reload; the auth form in [app.jsx:243](../prototype/app.jsx#L243) calls `e.preventDefault()` and does nothing.

The design is the valuable part and it is finished — [styles.css](../prototype/styles.css) is 964 lines of hand-written gothic CSS with a coherent token system, and [ornaments.jsx](../prototype/ornaments.jsx) is an original SVG glyph set. None of that gets thrown away. What's missing is everything behind it: persistence, identity, publishing.

The goal is a real site for a small Ukrainian poetry group — non-commercial, no ads, no payments — built in small deployable steps and running at **$0/month**.

## Decisions

| Concern | Choice | Why |
|---|---|---|
| Frontend | Next.js 16.2 (App Router, React 19) | ISR caches the public read path at the edge, so free-tier limits are barely touched |
| Backend | NestJS 11 as a Vercel Function | Officially supported, zero-config; keeps a clean API boundary at no cost |
| Database | Neon Postgres | 0.5 GB + 100 CU-h/mo free, scale-to-zero, branching for preview deploys |
| ORM | Prisma 7 | Use Neon's **pooled** connection string — serverless opens many short-lived connections |
| Auth | NestJS-owned (Passport JWT + httpOnly refresh cookie) | Auth.js couples to the Next.js runtime and fights a separate backend |
| API client | orval, generated from `apps/api/openapi.json` | The document already comes from the shared zod schemas; generating the client extends that one definition all the way into the components that call it |
| Server state | TanStack Query, via orval's generated hooks | Caching, deduplication, retry and in-flight state arrive with each endpoint rather than being hand-rolled per component; fewer requests is also directly fewer function invocations |
| Repo | pnpm workspaces + Turborepo | pnpm 10.33 and Node 24.12 already installed locally |
| Styling | Tailwind v4.3 + shadcn/ui | Radix a11y under the hood; pays for itself on the Phase 3 forms and Phase 4 moderation queue |
| Fonts | `next/font` | Replaces the render-blocking Google Fonts `<link>` in [MoodNight.html:10](../prototype/MoodNight.html#L10) |
| Media | Cloudflare R2 (Phase 6) | 10 GB free, zero egress fees |
| Email | Resend free tier | Needed from Phase 3 for verification + moderation notices |

**Running cost: $0/month.** The only optional spend is a domain (~$12/yr); `*.vercel.app` works until then.

## Architecture

```
moodnight/
├── apps/
│   ├── web/          Next.js  → vercel project 1 (root dir: apps/web)
│   └── api/          NestJS   → vercel project 2 (root dir: apps/api)
└── packages/
    ├── shared/       DTOs, zod schemas, shared types — imported by both
    └── db/           Prisma schema + generated client (from Phase 2)
```

Two Vercel projects from one Git repo, each with its own **Root Directory** setting. Vercel detects the NestJS entrypoint automatically as long as it stays at `apps/api/src/main.ts` — the standard `NestFactory.create` + `app.listen(process.env.PORT ?? 3000)` bootstrap is what it expects, unchanged.

**Read path (the important one):** public pages are statically rendered with ISR. A reader hits Vercel's edge cache and touches neither the NestJS function nor Neon. This is what keeps a scale-to-zero database and a cold-starting function invisible to visitors, and what keeps usage inside the free tiers.

**Write path:** browser → NestJS function → Neon, then targeted `revalidateTag` back into Next.js.

## Design system

shadcn covers the *app* surfaces; it does not cover the gothic editorial ones. Two deliberate layers:

```
components/
├── ui/          shadcn primitives, gothic-themed via CSS vars
│                added one at a time, in the phase that needs them
└── editorial/   bespoke — not shadcn, not forced into it
                 hero, poem-card, divider, ornaments, embers, drop-cap
```

**Nothing is added ahead of need.** `shadcn add` is a per-component command precisely so you pull in `table` the day you build the moderation queue, not before. Each phase below lists the components it introduces; Phase 1 needs three. The same applies to the CSS port — a phase translates only the rules its screens actually use, so [styles.css](../prototype/styles.css) drains gradually rather than in one sitting and stays the reference until it is empty.

`PoemCard` does **not** become shadcn's `<Card>`. Its corner frames at [styles.css:530-542](../prototype/styles.css#L530-L542), the drop cap, and the poetry type scale are the product's identity — they get built as bespoke components using Tailwind utilities.

**Token mapping.** The prototype's palette at [styles.css:3-21](../prototype/styles.css#L3-L21) maps cleanly onto shadcn's variable contract, defined in `:root` and exposed through `@theme inline`:

| Prototype | shadcn | |
|---|---|---|
| `--ink` `#0a0805` | `--background` | |
| `--ink-2` `#14100a` | `--card` `--popover` | |
| `--ink-3` `#1c1610` | `--secondary` `--muted` | |
| `--parchment` `#e8dcc0` | `--foreground` | |
| `--parchment-dim` | `--muted-foreground` | |
| `--accent` `#c9a35a` | **`--primary`** | ⚠️ see below |
| `--accent-bright` | `--ring` | |
| `--accent-deep` | `--border` `--input` | |
| `--blood` `#5a1a1a` | `--destructive` | |
| `--ember` `#d97a3a` | custom `--ember` | registered via `@theme inline` |

⚠️ **Naming collision worth getting right up front:** the prototype's `--accent` is the gold brand colour and must map to shadcn's **`--primary`**. shadcn's own `--accent` means something different — hover/interactive state. Mapping gold onto `--accent` will make every shadcn component look wrong.

**Beyond colour, the same rule.** The prototype spells out its gold as a literal `rgba(201, 163, 90, ·)` in a dozen glows, and repeats the same handful of display sizes and letter-spacings on every screen. Ported literally, each of those becomes an arbitrary value (`text-[0.85rem]`, `[text-shadow:0_0_10px_rgba(…)]`) that the next screen has to guess again — and that a `[data-accent]` swap leaves gold on a crimson page. So the ladders are registered as tokens too, in `@theme`, alongside the colours:

| Namespace | Tokens | |
|---|---|---|
| `--text-*` | `micro` `caption` `label` `brand` | chrome sizes; body/headline copy still uses Tailwind's own ladder |
| `--tracking-*` | `label` `display` `action` `brand` `eyebrow` | Tailwind's widest is `0.1em`, far too tight for uppercase Cinzel |
| `--text-shadow-*` `--shadow-*` `--drop-shadow-*` | `glow` `glow-soft` `glow-strong` | `color-mix` over `--accent-gold`, so they follow a `[data-accent]` swap |
| `--container-*` | `page` `reading` | the prototype's two column widths |

**Two rules that keep it consistent.** A raw colour or an off-ladder size in a component is a missing token — add it here, with a name that says its role, not its pixel value. And a treatment worn by more than one component is a component, not an exported class string: `NavLink` is the bar's link rule, and it is what lets `aria-current` alone light up the reader's current page. Both are what `cn` + CVA + `asChild` are for; both keep the styling on the element, where Tailwind can be read.

**Dark-only.** This is a night-themed poetry site; a light mode is meaningless. Put the gothic values directly in `:root` and skip the `.dark` class convention entirely rather than duplicating every token. The four accent variants at [styles.css:937-955](../prototype/styles.css#L937-L955) survive as `[data-accent="crimson"]` blocks that override `--primary` / `--ring` / `--border`.

**What stays hand-written CSS.** Tailwind utilities can't express these cleanly, and they belong in `globals.css`: the SVG noise texture and vignette on `body::before/after` ([styles.css:49-68](../prototype/styles.css#L49-L68)), the ember keyframes driven by the `--drift` custom property, and the `@font-face` / type scale.

**Gothic buttons.** Rather than keeping a parallel `.btn`, rewrite the CVA variants inside `components/ui/button.tsx` to encode the gothic styles from [styles.css:231-283](../prototype/styles.css#L231-L283). You keep shadcn's API, `asChild`, and focus handling while the look stays yours — this is exactly what shadcn's copy-in-rather-than-install model is for.

## Data model (Phase 2 onward)

```
User      id, email, passwordHash, penName, slug, initials, roleTitle,
          bio, avatarUrl, role: ROOT|ADMIN|EDITOR|AUTHOR, emailVerifiedAt
          — at most one ROOT row, by partial unique index
Poem      id, slug, title, subtitle, body, authorId, readCount,
          status: DRAFT|PENDING_REVIEW|PUBLISHED|REJECTED, publishedAt
Tag       id, name, slug              PoemTag       poemId, tagId
Reaction  poemId, userId, kind: KINDLE|LAMENT   — unique(poemId, userId, kind)
Review    poemId, reviewerId, action: APPROVE|REJECT, note, createdAt
Collection / CollectionPoem            — the "Збірки" nav item
```

Two things worth naming carefully: `role` is the permission (`ROOT|ADMIN|EDITOR|AUTHOR`) while `roleTitle` is the decorative display string from the prototype ("Хранитель слова", "Мандрівний поет"). And `readCount` stays a denormalized counter on `Poem` — do not count rows.

`ROOT` is the site owner and a singleton — the database allows one such row and no more. Phase 3's guard is what decides who may *assign* it; the index only guarantees that no two accounts ever hold it at once.

## The three areas

The site has three surfaces, and they were framed out ahead of their contents so that where a thing lives could be settled before anything had to be built inside it. Each is a shell with real navigation and real access control and placeholder pages.

| Area | Route | Sections so far | Floor |
|---|---|---|---|
| Public | everything else | — | — |
| Studio | `/studio` | `/studio/poems` | `AUTHOR`, i.e. anybody signed in |
| Administration | `/admin` | `/admin/users` | `ADMIN`, until the queue lands |

Each area carries one section for now, and its own address redirects to it — there is no overview page while there is nothing to overview. An area's floor is the gentlest floor any of its sections keeps, computed from the table rather than declared beside it, so the administration reopens to `EDITOR` the moment `/admin/queue` is back in Phase 4 without a second place to remember. The rest of the sections listed in the phases below (the queue, responses, echoes, published poems, the hearth) arrive with the work that fills them.

**The studio is not the `EDITOR` role.** Everyone who can post is an `AUTHOR` — the column's default — and that is who the studio is for; `EDITOR` is the queue moderator, an *admin*-area role. The word "editor" is therefore never used for the studio, and `/me/poems` in Phase 4 below is `/studio/poems`.

Sections and their floors are declared once, in `apps/web/src/components/area/links.ts`. The shell reads a page's floor out of that table and the rail filters its own rows against it, so a section cannot be hidden from the navigation and still open to anybody who types the address.

**Gating in the browser is chrome, not security.** The refresh cookie is pathed `/api/auth`, so a request for `/uk/studio` does not carry it — neither the Next.js proxy nor a Server Component can tell who is asking, and buying that knowledge would mean an API call per page view against a cost model built on static delivery. So the pages stay prerendered, `RequireRole` decides what to *show*, and `RolesGuard` on the API decides what to *allow*. A gated page is built at deploy time for everybody and its payload is fetchable by anybody, so data must always arrive over an authenticated call and never be baked into a page.

*shadcn: `dropdown-menu` (the user menu in the top bar).*

## Phase 1 — Skeleton (no DB)

Pure plumbing. Nothing here talks to a database; the point is a green pipeline from local dev to two live URLs.

1. **Monorepo** — pnpm workspace + Turborepo, TypeScript strict, ESLint, Prettier, Vitest.
2. **`apps/web`** — Next.js 16 App Router, then `pnpm dlx shadcn@latest init --monorepo` (components land in `apps/web`; adding later ones uses `shadcn add <name> -c apps/web`). A shared `packages/ui` is not worth it with a single frontend consumer.

   **shadcn components this phase: `button`, `input`, `label`.** That is the whole set the existing landing page needs. Everything else waits.

   Then port the prototype:
   - **Theme first, before any component.** Translate [styles.css:3-21](../prototype/styles.css#L3-L21) into `:root` + `@theme inline` per the mapping above, converting to OKLCH — Tailwind v4 and shadcn both default to it. This is the one piece worth doing completely up front: get it right and every component added in any later phase arrives gothic with no extra work.
   - `ornaments.jsx` → `components/editorial/ornaments.tsx`, typed, dropping the `window.*` exports at the bottom.
   - `app.jsx` → `components/editorial/{hero,poem-card,divider,embers}.tsx` + `components/{top-nav,featured-feed,footer}.tsx`. Server Components by default; `PoemCard`, `Embers`, `AuthSection` need `"use client"`.
   - Rewrite `components/ui/button.tsx` CVA variants with the gothic button styles.
   - Rebuild the auth form in [app.jsx:243](../prototype/app.jsx#L243) with plain `Input` + `Label`. No `form` component yet — it stays non-functional markup until Phase 3 brings react-hook-form.
   - Google Fonts `<link>` → `next/font/google` (Cinzel, Cormorant Garamond, IM Fell English SC, UnifrakturMaguntia) with the Cyrillic subset.
   - Port only the CSS these screens use — hero, poem card, divider, embers, nav, footer, auth card. Skip the `[data-density]` and `[data-type-pair]` variant blocks at [styles.css:910-935](../prototype/styles.css#L910-L935); with the tweaks panel gone nothing toggles them, and they can come back if a theme switcher ever ships.
   - **Drop the tweaks panel.** [tweaks-panel.jsx](../prototype/tweaks-panel.jsx) is 425 lines of design-exploration tooling. Bake in the resolved defaults from [app.jsx:5-12](../prototype/app.jsx#L5-L12) — accent `gold`, type `ornate`, density `spacious`, texture and embers on — and delete the panel.
3. **`apps/api`** — NestJS 11 with `GET /health` and `GET /poems`, the latter returning the three poems from [data.jsx](../prototype/data.jsx) moved into `packages/shared` as typed fixtures. Swagger UI on `/docs`, its components generated from the same shared zod schemas via `z.toJSONSchema` — no parallel DTO classes, and no `@nestjs/swagger` CLI plugin, which only reads class-based DTOs this project does not have.
4. **`packages/shared`** — `Poem`/`Author` types and zod schemas, imported by both apps.
5. **Wire it end-to-end** — the Next.js feed fetches from the NestJS `/poems` endpoint rather than importing the fixtures directly. The data is still hardcoded, but the integration, CORS, and env-var plumbing are real and proven.
6. **CI** — GitHub Actions: lint, typecheck, test, build on PR.
7. **Deploy** — two Vercel projects, root dirs `apps/web` and `apps/api`, `NEXT_PUBLIC_API_URL` wired between them.

**Done when:** both URLs are live, the deployed site is visually indistinguishable from the prototype, and its poems arrive over HTTP from the deployed NestJS function.

## Later phases

Each phase ships and deploys on its own. The shadcn line is everything that phase introduces — the running total after Phase 4 is still only about a dozen components.

- **Phase 2 — Data.** Neon + Prisma + migrations, seed from `data.jsx`, read endpoints with pagination, ISR pages `/`, `/poem/[slug]`, `/author/[slug]`, `/tag/[slug]`. Slugs need Cyrillic transliteration. **The pagination arrived early and generically**, with `GET /users` — see the Lists section of [README.md](../README.md). A resource declares which of its properties are searchable, sortable and filterable, and the query parameters, the documented contract, the generated client and the Prisma `where` all follow; the poem lists here are that declaration and nothing more.
  *shadcn: `badge` (tags), `avatar` (author), `skeleton` (loading).*
- **Phase 3 — Auth.** ~~Register / login / refresh / logout / me. Argon2 hashing, short-lived JWT + httpOnly refresh cookie, roles guard.~~ **The API half is done** — see the Authentication section of [README.md](../README.md). Still to do: wire up the Phase 1 form with `react-hook-form` + `@hookform/resolvers/zod`, resolving against **the same zod schema `packages/shared` gives NestJS's validation pipe** — one schema, validated on both sides. Email verification via Resend. Google OAuth as a later Passport strategy. A password-reset flow, which is also what `PATCH /users/:id` deliberately does *not* provide.
  *shadcn: `form`, `sonner` (toasts), `dropdown-menu` (user menu).*
- **Phase 4 — Writing + moderation.** Poem editor, the `/studio/poems` dashboard, `DRAFT → PENDING_REVIEW → PUBLISHED|REJECTED` transitions, `/admin/queue` for editors, `Review` audit trail, notification emails. The shells are already in place (see "The three areas" above); this phase fills `/studio/poems` and adds the queue as a second row in `links.ts`. It is also where shadcn earns its place — the queue is a real data table and none of it gets hand-built.
  *shadcn: `table` (+ TanStack Table), `dialog`, `alert-dialog`, `textarea`, `select`, `tabs`.*
- **Phase 5 — Engagement.** Persist Kindle/Lament (one per user per kind, replacing the local `useState` at [app.jsx:177](../prototype/app.jsx#L177)), read counting, collections, author profiles, search. The lists' `search` is a case-insensitive `contains`, which is right for names and wrong for poem bodies — public search over the poems is the point at which Postgres full-text earns its place, alongside rather than inside the list framework.
  *shadcn: `tooltip`, `popover`, `command` (search).*
- **Phase 6 — Ops.** R2 for avatars and covers, OG images, sitemap, RSS, rate limiting, **scheduled `pg_dump` to R2** — Neon's free tier keeps only ~24h of history, and this archive is irreplaceable.

## Verification

Phase 1 is verified by inspection against the prototype, not by tests — there is no logic yet.

```bash
pnpm install && pnpm dev          # web :3000, api :3001
curl localhost:3001/health        # {"status":"ok"}
curl localhost:3001/poems         # the three seeded poems
curl localhost:3001/docs/json     # OpenAPI document; UI on /docs
pnpm lint && pnpm typecheck && pnpm build
```

Then run the existing prototype side by side (`python3 -m http.server 8777` → `/prototype/MoodNight.html`) and compare at 375 px, 768 px and 1440 px: hero, poem cards with corner frames, dividers, embers drifting, parchment texture, vignette, drop caps, button gradients and letter-spacing. Because Phase 1 re-implements rather than copies, treat any difference as a bug and fix it before moving on.

Finally confirm the deployed web URL renders poems fetched from the deployed API URL, and that a PR produces working preview deployments for both projects.

## Risks

- **Visual drift during the port.** Re-implementing rather than copying means the design can quietly degrade — letter-spacing, gradient stops, the corner-frame insets. The side-by-side check in Verification is the guard, and it is not optional. Because the CSS is ported per phase, this check repeats every phase that adds screens, not just in Phase 1.
- **The theme is the one thing that must be right early.** Everything else is deferrable; the token mapping is not. Changing `--primary` after twenty components reference it means re-checking all of them.
- **Vercel Hobby is non-commercial by ToS.** Fine for a poetry group with no ads or payments. The day donations or sales appear, it needs Pro at $20/mo.
- **Stacked cold starts.** A Vercel function wake plus a Neon scale-to-zero wake can reach a few seconds. ISR is the mitigation and it is why the read path must be cached rather than fetched per request.
- **Serverless NestJS has no in-process cron or queues.** Nothing in phases 1-5 needs them. If that changes, `apps/api` moves to Render or a small VPS unchanged — the deployment target is a config change, not a rewrite.
- **Neon free tier suspends** at 0.5 GB or 100 CU-h. Text-only poems will not approach either, but images must go to R2, never the database.

## Sources

Verified 2026-08-03; free tiers change often, so re-check before relying on any figure.

- [shadcn/ui theming](https://ui.shadcn.com/docs/theming) · [Tailwind v4 setup](https://ui.shadcn.com/docs/tailwind-v4) · [monorepo install](https://ui.shadcn.com/docs/installation/next)
- [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs)
- [Vercel free tier limits 2026](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
- [Neon pricing](https://neon.com/pricing)
- [Cloudflare R2 free tier](https://nubbo.app/blog/cloudflare-r2-free-tier/)
- [Render vs Railway vs Fly.io pricing 2026](https://hostim.dev/blog/render-vs-railway-vs-fly-pricing/)
