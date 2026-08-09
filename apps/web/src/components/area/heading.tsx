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
 */
export function AreaHeading({ title, line }: { title: string; line?: string }) {
  return (
    <header className="border-primary/15 compact:pb-6 flex flex-col gap-3 border-b pb-5">
      <h1 className="font-display text-foreground tracking-display text-[clamp(1.4rem,5vw,2rem)] leading-tight uppercase">
        {title}
      </h1>

      {line && <p className="text-muted-foreground max-w-[44rem] text-balance italic">{line}</p>}
    </header>
  );
}
