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
