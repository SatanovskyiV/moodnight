/**
 * An illuminated initial on the first letter of whatever it wraps, ported from
 * `.dropcap::first-letter` at prototype/styles.css:144-158.
 *
 * A component and not a class string, per the rule in docs/ROADMAP.md — but the
 * reason here is stronger than consistency. `::first-letter` only exists on a
 * block box, and it takes the *first letter of the block*, not of the component
 * you meant. Wrapping it makes that block explicit and unshared: whatever is
 * handed in is the paragraph the cap belongs to, and there is no way to get it
 * onto the wrong one by putting the class one level too high.
 *
 * `float: left` is what makes the following lines wrap around it rather than
 * clearing a giant line box, and it is also why the letter needs its own
 * `leading` — at 0.85 the cap's own box is shorter than its glyph, which is what
 * sets it down onto the baseline of the third line instead of hanging above the
 * first.
 *
 * The size and the three-layer glow are tokens (`--text-dropcap`,
 * `--text-shadow-illuminated` in globals.css) rather than arbitrary values,
 * because both are the same everywhere the treatment appears and the glow is
 * mixed over `--accent-gold`, so it follows a `[data-accent]` swap. The faint
 * radial behind the letter is spelled out as utilities in the same shape
 * components/ui/button.tsx paints its ember with — same gradient, same stops,
 * so the two read as one family rather than two guesses.
 */
export function DropCap({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`first-letter:font-display first-letter:text-primary first-letter:text-dropcap first-letter:text-shadow-illuminated first-letter:from-primary/6 first-letter:float-left first-letter:mr-[0.2rem] first-letter:bg-radial first-letter:from-0% first-letter:to-transparent first-letter:to-70% first-letter:pt-[0.4rem] first-letter:pr-[0.7rem] first-letter:pb-[0.1rem] first-letter:leading-[0.85] first-letter:font-semibold ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
