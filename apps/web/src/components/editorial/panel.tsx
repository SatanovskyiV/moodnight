import { Seal } from "./ornaments";

/**
 * A pool of lifted ink inside a gold hairline, with the seal above whatever it
 * has to say — what the site shows in the place of content that is not there.
 *
 * Three screens wear it now and each means something different by it: a section
 * that has its place but not yet its contents (components/area/placeholder.tsx),
 * a list whose filters matched nothing (components/list/view.tsx), and a feed
 * that has not been written into yet. That is why it takes a `title`, a `line`
 * and an optional `action` rather than knowing any of them — the shape is the
 * shared thing, and the sentence never is.
 *
 * `title` is optional because the placeholder has a heading of its own directly
 * above the panel, and repeating it inside would be the same words twice.
 *
 * Lifted out of the first two the moment the third arrived, which is the rule
 * from docs/ROADMAP.md: a treatment worn by more than one component is a
 * component, not an exported class string.
 */
export function Panel({
  title,
  line,
  action,
  className,
}: {
  title?: string;
  line: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-primary/20 from-secondary/70 to-background/60 compact:px-10 compact:py-14 flex flex-col items-center gap-5 border bg-gradient-to-b px-6 py-10 text-center ${className ?? ""}`}
    >
      <span className="text-primary-deep grid size-12 place-items-center">
        <Seal className="size-full" />
      </span>

      {title && (
        <p className="font-display text-foreground tracking-display text-label uppercase">
          {title}
        </p>
      )}

      <p className="text-muted-foreground max-w-[38rem] text-lg text-balance italic">{line}</p>

      {action}
    </div>
  );
}
