"use client";

import type { PoemSummary } from "@moodnight/shared";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { payload } from "@/lib/api/error";
import { useGetPoem } from "@/lib/api/generated/poems";

import { DropCap } from "./drop-cap";
import { Rune } from "./ornaments";

/**
 * One poem in the feed, ported from prototype/app.jsx:116-170 and
 * prototype/styles.css:492-700.
 *
 * Bespoke on purpose and not shadcn's `<Card>` — docs/ROADMAP.md names this
 * component specifically. The heraldic corners, the drop cap and the poetry type
 * scale are the product's identity; a `<Card>` would give them a radius, a
 * shadow and a palette that are somebody else's.
 *
 * **Why this one is a client component when the feed could have been static.**
 * A card is not a card until it can be opened, and opening it is two pieces of
 * state: whether the reader asked, and the body that only `GET /poems/{slug}`
 * has. A `PoemSummary` deliberately does not carry the whole text — the note in
 * packages/shared/src/poem.ts spells out why, and it is the reason a feed of
 * twenty cards is a small payload rather than twenty poems.
 *
 * The full body is fetched lazily and only once: `enabled` holds the request
 * until the reader asks, and the 60s `staleTime` in components/query means
 * closing a poem and opening it again costs nothing. Nothing is discarded on
 * collapse — the cache outlives this component's state, which is what makes the
 * second open instant.
 *
 * **What the foot does not have.** Kindle and Lament are in the prototype and
 * are not here, because there is no table behind them until Phase 5
 * (docs/ROADMAP.md). A button that increments a number and forgets it on reload
 * is worse than no button: it tells a poet their work was met when nothing was
 * recorded. The read count is real, so the read count is what it shows.
 */
export function PoemCard({ poem }: { poem: PoemSummary }) {
  const t = useTranslations("feed");
  const [expanded, setExpanded] = useState(false);
  // `useId` and not the slug: the slug is a URL segment and may hold characters
  // that are legal there and awkward in an id, and this only has to be unique
  // within the document.
  const bodyId = useId();

  const { data, isPending } = useGetPoem(poem.slug, { query: { enabled: expanded } });
  const body = expanded && data ? payload(data).body : poem.teaser;

  // The fade belongs to the collapsed teaser and to nothing else. `truncated`
  // comes from the server because it cannot be worked out here — a poem of
  // exactly TEASER_LINES lines and one of sixty both arrive with TEASER_LINES,
  // and fading a complete poem is the bug that flag exists to prevent.
  const faded = !expanded && poem.truncated;

  return (
    <article className="group border-primary/18 from-secondary/85 to-card/85 compact:px-14 compact:py-12 hover:border-primary/50 hover:shadow-halo relative overflow-hidden border bg-gradient-to-b px-6 py-8 transition-all duration-500 ease-in-out hover:-translate-y-[2px]">
      {/* The four heraldic corners (prototype/styles.css:530-542). Flat pixels,
          not `size-6`: they are a drawn frame at a fixed inset, and a corner
          that grew with the root font size would stop meeting its own inset. */}
      <span
        aria-hidden="true"
        className="border-primary pointer-events-none absolute top-[10px] left-[10px] size-[24px] border-t border-l"
      />
      <span
        aria-hidden="true"
        className="border-primary pointer-events-none absolute top-[10px] right-[10px] size-[24px] border-t border-r"
      />
      <span
        aria-hidden="true"
        className="border-primary pointer-events-none absolute bottom-[10px] left-[10px] size-[24px] border-b border-l"
      />
      <span
        aria-hidden="true"
        className="border-primary pointer-events-none absolute right-[10px] bottom-[10px] size-[24px] border-r border-b"
      />

      {/* `.poem::before` — light gathering at the top of the card under the
          pointer. Positioned, so it paints over the text at 8% exactly as the
          prototype's pseudo-element does; that wash is the effect, not a
          stacking mistake, which is the same note components/ui/button.tsx
          makes about its ember. */}
      <span
        aria-hidden="true"
        className="from-primary/8 pointer-events-none absolute inset-0 bg-radial-[ellipse_at_top] from-0% to-transparent to-70% opacity-0 transition-opacity duration-600 group-hover:opacity-100"
      />

      <header className="mb-[1.6rem] flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {/* Initials, not shadcn's `Avatar`: `avatarUrl` is null for everybody
              until Phase 6 gives images somewhere to live, so there is no image
              to fall back *from* and the disc is the prototype's own. */}
          <span
            aria-hidden="true"
            className="border-primary-deep from-primary-deep to-secondary font-display text-primary-bright grid size-[44px] shrink-0 place-items-center rounded-full border bg-radial-[circle_at_30%_30%] text-[0.95rem] tracking-[0.05em]"
          >
            {poem.author.initials}
          </span>

          <div>
            <p className="font-display text-foreground text-label tracking-credit uppercase">
              {poem.author.penName}
            </p>
            {/* The decorative title, never the permission — they are different
                columns and packages/shared/src/poem.ts keeps `role` out of what
                a reader receives at all. */}
            {poem.author.roleTitle && (
              <p className="font-caps text-parchment-faint text-micro tracking-credit mt-[2px] uppercase">
                {poem.author.roleTitle}
              </p>
            )}
          </div>
        </div>

        {poem.tags.length > 0 && (
          <ul className="flex flex-wrap items-center gap-3">
            {poem.tags.map((tag) => (
              <li key={tag.slug}>
                <Badge>
                  <Rune glyph="rune1" size={12} />
                  {tag.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* `h3`, the third level of the page's outline: the masthead is the `h1`
          and the feed's own heading is the `h2` (components/feed/index.tsx). It
          is a heading at all — rather than the large `p` it looks like — because
          moving between poems by heading is how somebody using a screen reader
          scrolls a feed. */}
      <h3 className="font-display text-foreground tracking-title mb-2 text-[clamp(1.6rem,3vw,2.2rem)] font-medium text-balance uppercase">
        {poem.title}
      </h3>

      {poem.subtitle && (
        <p className="text-muted-foreground mb-[1.8rem] text-[1.05rem] italic">{poem.subtitle}</p>
      )}

      {/* `whitespace-pre-line` is the contract, not a style choice: the API
          describes the body as plain text whose line breaks are content, so a
          client renders them and does not reflow them.

          The mask fades the type itself rather than laying a gradient over it,
          which is what makes it work on a card whose own ground is a gradient —
          there is no single colour to fade *to*. */}
      <Body
        id={bodyId}
        expanded={expanded}
        className={`text-foreground mb-8 text-xl leading-[1.75] whitespace-pre-line ${faded ? "mask-b-from-60%" : ""}`}
      >
        {body}
        {/* Kept under the teaser rather than replacing it: a reader who asked to
            open a poem should not have the lines they were already reading taken
            away while the rest is on its way. */}
        {expanded && isPending && (
          <span className="text-parchment-faint text-caption mt-4 block italic">
            {t("opening")}
          </span>
        )}
      </Body>

      <footer className="border-primary/15 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <span className="font-caps text-muted-foreground text-caption tracking-label inline-flex items-center gap-2">
          <Rune glyph="eye" className="text-primary drop-shadow-glow" size={16} />
          {t("reads", { count: poem.readCount })}
        </span>

        {/* Only when there is more to show. A poem shorter than the teaser is
            already whole on the card, and an affordance that opens onto the same
            six lines is a promise the card cannot keep. */}
        {poem.truncated && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            className="font-caps text-primary text-caption tracking-action hover:text-primary-bright hover:text-shadow-glow hover:tracking-brand focus-visible:ring-ring/50 inline-flex cursor-pointer items-center gap-[0.6rem] uppercase transition-all duration-300 outline-none focus-visible:ring-[3px]"
          >
            {expanded ? t("collapse") : t("expand")}
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </footer>
    </article>
  );
}

/**
 * The poem's text, with the illuminated initial on it only once the whole poem
 * is on screen.
 *
 * The prototype makes the same distinction (prototype/app.jsx:143) and it is a
 * typographic one, not a decorative preference: a drop cap is the opening of a
 * *piece*, and hanging one over six lines that stop mid-thought announces a
 * beginning to something the reader has not been given. It also floats three
 * lines deep into a block that is only six lines tall and then gets cut in half
 * by the fade.
 *
 * `id` lands on whichever element is rendered, because it is what the toggle's
 * `aria-controls` points at and that has to keep resolving through the swap.
 */
function Body({
  id,
  expanded,
  className,
  children,
}: {
  id: string;
  expanded: boolean;
  className: string;
  children: React.ReactNode;
}) {
  if (expanded) {
    return (
      <DropCap id={id} className={className}>
        {children}
      </DropCap>
    );
  }

  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
}
