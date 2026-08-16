import type { ReactNode } from "react";

/**
 * The title of a page inside an area, over the hairline that separates it from
 * whatever the page is.
 *
 * Lifted out of ./placeholder.tsx the moment a second thing wore it — the users
 * table — rather than copied across, which is the rule from docs/ROADMAP.md: a
 * treatment worn by more than one component is a component, not an exported
 * class string.
 *
 * `line` is optional and is the section's own sentence from the catalogue. The
 * placeholder puts it inside its panel, where it is the whole content; a page
 * with real content puts it here, under the heading, where it is a lede. Same
 * sentence, and it stays true either way — which is why the catalogues did not
 * gain a second one when the panel went.
 *
 * `action` is the page's one standing gesture, and it arrived with the studio's
 * dashboard: replacing an `AreaPlaceholder` with a table takes away the button
 * that placeholder was carrying, and for `/studio/poems` that button is the only
 * path a signed-in author has to writing a poem. It sits at the end of the
 * header row from `compact:` up and drops under the lede on a phone, so it is
 * reachable at every width and never crowds a title that is already clamped
 * against one.
 *
 * Optional, and the two pages that came first pass nothing — a heading with no
 * action lays out exactly as it did before this parameter existed, which is what
 * makes adding it a safe thing to have done rather than a thing to check.
 */
export function AreaHeading({
  title,
  line,
  action,
}: {
  title: string;
  line?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-primary/15 compact:flex-row compact:items-end compact:gap-6 compact:pb-6 flex flex-col gap-3 border-b pb-5">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h1 className="font-display text-foreground tracking-display text-[clamp(1.4rem,5vw,2rem)] leading-tight uppercase">
          {title}
        </h1>

        {line && <p className="text-muted-foreground max-w-[44rem] text-balance italic">{line}</p>}
      </div>

      {/* `shrink-0` so a two-word label never wraps to keep a long lede on one
          line — the lede has `max-w-[44rem]` and room to give, and the action
          does not. */}
      {action && <div className="compact:shrink-0">{action}</div>}
    </header>
  );
}
