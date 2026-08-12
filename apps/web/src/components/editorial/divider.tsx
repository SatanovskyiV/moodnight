import { Quatrefoil } from "./ornaments";

/**
 * The rule that separates one part of a page from the next — a hairline running
 * in from each side, a glyph between them. Ported from prototype/styles.css:94-117.
 *
 * The line is a gradient rather than a border because it has to *arrive*: at
 * full strength under the glyph and gone by the time it reaches the margin, so
 * it reads as a drawn ornament and not as the edge of a box. There is no border
 * utility for that, which is why both halves are `bg-linear-to-*` on a 1px span.
 *
 * Two spans rather than one gradient behind the glyph, because the glyph is a
 * flex child with real width and a single background would run underneath it.
 *
 * Decorative throughout: `<hr>` would announce a thematic break to a screen
 * reader on every card boundary, and these are punctuation, not structure.
 */
export function Divider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`text-primary mx-auto flex w-full max-w-[600px] items-center justify-center gap-6 opacity-70 ${className ?? ""}`}
    >
      <span className="from-primary-deep/0 via-primary to-primary-deep/0 h-px flex-1 bg-gradient-to-r" />
      <Quatrefoil className="drop-shadow-glow shrink-0" />
      <span className="from-primary-deep/0 via-primary to-primary-deep/0 h-px flex-1 bg-gradient-to-r" />
    </div>
  );
}
