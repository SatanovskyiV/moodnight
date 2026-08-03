# MoodNight — from prototype to product

> **Status:** planning complete, Phase 1 not started · **Last updated:** 2026-08-03
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

**Dark-only.** This is a night-themed poetry site; a light mode is meaningless. Put the gothic values directly in `:root` and skip the `.dark` class convention entirely rather than duplicating every token. The four accent variants at [styles.css:937-955](../prototype/styles.css#L937-L955) survive as `[data-accent="crimson"]` blocks that override `--primary` / `--ring` / `--border`.

**What stays hand-written CSS.** Tailwind utilities can't express these cleanly, and they belong in `globals.css`: the SVG noise texture and vignette on `body::before/after` ([styles.css:49-68](../prototype/styles.css#L49-L68)), the ember keyframes driven by the `--drift` custom property, and the `@font-face` / type scale.

**Gothic buttons.** Rather than keeping a parallel `.btn`, rewrite the CVA variants inside `components/ui/button.tsx` to encode the gothic styles from [styles.css:231-283](../prototype/styles.css#L231-L283). You keep shadcn's API, `asChild`, and focus handling while the look stays yours — this is exactly what shadcn's copy-in-rather-than-install model is for.

## Data model (Phase 2 onward)

```
User      id, email, passwordHash, penName, slug, initials, roleTitle,
          bio, avatarUrl, role: ADMIN|EDITOR|AUTHOR, emailVerifiedAt
Poem      id, slug, title, subtitle, body, authorId, readCount,
          status: DRAFT|PENDING_REVIEW|PUBLISHED|REJECTED, publishedAt
Tag       id, name, slug              PoemTag       poemId, tagId
Reaction  poemId, userId, kind: KINDLE|LAMENT   — unique(poemId, userId, kind)
Review    poemId, reviewerId, action: APPROVE|REJECT, note, createdAt
Collection / CollectionPoem            — the "Збірки" nav item
```

Two things worth naming carefully: `role` is the permission (`ADMIN|EDITOR|AUTHOR`) while `roleTitle` is the decorative display string from the prototype ("Хранитель слова", "Мандрівний поет"). And `readCount` stays a denormalized counter on `Poem` — do not count rows.

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

- **Phase 2 — Data.** Neon + Prisma + migrations, seed from `data.jsx`, read endpoints with pagination, ISR pages `/`, `/poem/[slug]`, `/author/[slug]`, `/tag/[slug]`. Slugs need Cyrillic transliteration.
  *shadcn: `badge` (tags), `avatar` (author), `skeleton` (loading).*
- **Phase 3 — Auth.** Register / login / refresh / logout / me. Argon2 hashing, short-lived JWT + httpOnly refresh cookie, roles guard. Wire up the Phase 1 form with `react-hook-form` + `@hookform/resolvers/zod`, resolving against **the same zod schema `packages/shared` gives NestJS's validation pipe** — one schema, validated on both sides. Email verification via Resend. Google OAuth as a later Passport strategy.
  *shadcn: `form`, `sonner` (toasts), `dropdown-menu` (user menu).*
- **Phase 4 — Writing + moderation.** Poem editor, `/me/poems` dashboard, `DRAFT → PENDING_REVIEW → PUBLISHED|REJECTED` transitions, `/admin/queue` for editors, `Review` audit trail, notification emails. This is where shadcn earns its place — the queue is a real data table and none of it gets hand-built.
  *shadcn: `table` (+ TanStack Table), `dialog`, `alert-dialog`, `textarea`, `select`, `tabs`.*
- **Phase 5 — Engagement.** Persist Kindle/Lament (one per user per kind, replacing the local `useState` at [app.jsx:177](../prototype/app.jsx#L177)), read counting, collections, author profiles, search.
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
