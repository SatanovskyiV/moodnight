/**
 * Original heraldic glyphs, ported from prototype/ornaments.jsx — typed, and
 * without the `window.*` exports the browser-Babel prototype needed to share
 * them across script tags.
 *
 * Only the glyphs a shipped screen actually renders live here; the rest of the
 * set arrives with the screens that need them (docs/ROADMAP.md, "Design system").
 *
 * Every glyph draws in `currentColor`, so colour comes from the parent's text
 * colour rather than a prop, and all are decorative — the label belongs to the
 * element that wraps them.
 */
type OrnamentProps = {
  size?: number;
  className?: string;
};

/**
 * The two halves of a rule that runs into a curl and ends in a bead, ported from
 * prototype/ornaments.jsx:20-36. They frame a line of type — one on each side —
 * and are a mirrored pair rather than one glyph flipped in CSS because that is
 * how the prototype draws them, and a `scale-x-[-1]` would also flip the stroke
 * ends of anything a caller nests inside.
 *
 * Wider than they are tall by design, so they are sized by width alone: give the
 * caller's class a `w-*` and the `viewBox` scales the height with it.
 */
type FlourishProps = {
  width?: number;
  height?: number;
  className?: string;
};

export function Sigil({ size = 28, className }: OrnamentProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="13" />
      <path d="M16 3 L16 29 M3 16 L29 16" strokeWidth="0.6" opacity="0.6" />
      <path d="M16 8 L20 16 L16 24 L12 16 Z" fill="currentColor" opacity="0.85" />
      {/* Punches the centre back out to the page colour. The prototype hardcodes
          #0a0805 here; the token says the same thing and survives a re-theme. */}
      <circle cx="16" cy="16" r="2" fill="var(--ink)" />
    </svg>
  );
}

/**
 * The wax seal above the auth card's heading — the {@link Sigil}'s ceremonial
 * cousin: two rings, four compass ticks, and a nested double lozenge.
 *
 * Ported from prototype/ornaments.jsx:48-58, with the same substitution the
 * sigil makes — the prototype's literal `#0a0805` centre becomes `var(--ink)`,
 * so the punched-out middle follows the page rather than staying that one brown
 * if the theme ever moves.
 */
export function Seal({ size = 64, className }: OrnamentProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="28" />
      <circle cx="32" cy="32" r="22" strokeWidth="0.6" opacity="0.5" />
      <path
        d="M32 6 L32 14 M32 50 L32 58 M6 32 L14 32 M50 32 L58 32"
        strokeWidth="0.6"
        opacity="0.5"
      />
      <path d="M32 16 L40 32 L32 48 L24 32 Z" fill="currentColor" opacity="0.4" />
      <path d="M32 22 L36 32 L32 42 L28 32 Z" fill="currentColor" />
      <circle cx="32" cy="32" r="2.5" fill="var(--ink)" />
    </svg>
  );
}

export function FlourishLeft({ width = 80, height = 14, className }: FlourishProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 7 L60 7" />
      <path d="M55 7 C 60 7, 62 4, 66 4 C 70 4, 72 7, 72 7" />
      <path d="M55 7 C 60 7, 62 10, 66 10 C 70 10, 72 7, 72 7" />
      <circle cx="74" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function FlourishRight({ width = 80, height = 14, className }: FlourishProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 80 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M80 7 L20 7" />
      <path d="M25 7 C 20 7, 18 4, 14 4 C 10 4, 8 7, 8 7" />
      <path d="M25 7 C 20 7, 18 10, 14 10 C 10 10, 8 7, 8 7" />
      <circle cx="6" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}
