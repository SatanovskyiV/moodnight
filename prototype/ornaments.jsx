// SVG ornament library — original heraldic glyphs

const Sigil = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2">
    <circle cx="16" cy="16" r="13" />
    <path d="M16 3 L16 29 M3 16 L29 16" strokeWidth="0.6" opacity="0.6" />
    <path d="M16 8 L20 16 L16 24 L12 16 Z" fill="currentColor" opacity="0.85" />
    <circle cx="16" cy="16" r="2" fill="#0a0805" />
  </svg>
);

const Diamond = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor">
    <path d="M7 0 L14 7 L7 14 L0 7 Z" opacity="0.95" />
    <path d="M7 3 L11 7 L7 11 L3 7 Z" fill="#0a0805" />
    <path d="M7 5 L9 7 L7 9 L5 7 Z" fill="currentColor" />
  </svg>
);

const FlourishLeft = ({ width = 80, height = 14 }) => (
  <svg width={width} height={height} viewBox="0 0 80 14" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M0 7 L60 7" />
    <path d="M55 7 C 60 7, 62 4, 66 4 C 70 4, 72 7, 72 7" />
    <path d="M55 7 C 60 7, 62 10, 66 10 C 70 10, 72 7, 72 7" />
    <circle cx="74" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

const FlourishRight = ({ width = 80, height = 14 }) => (
  <svg width={width} height={height} viewBox="0 0 80 14" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M80 7 L20 7" />
    <path d="M25 7 C 20 7, 18 4, 14 4 C 10 4, 8 7, 8 7" />
    <path d="M25 7 C 20 7, 18 10, 14 10 C 10 10, 8 7, 8 7" />
    <circle cx="6" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

const Quatrefoil = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1">
    <path d="M10 2 C 6 2, 6 6, 10 6 C 14 6, 14 2, 10 2 Z" fill="currentColor" opacity="0.6" />
    <path d="M18 10 C 18 6, 14 6, 14 10 C 14 14, 18 14, 18 10 Z" fill="currentColor" opacity="0.6" />
    <path d="M10 18 C 14 18, 14 14, 10 14 C 6 14, 6 18, 10 18 Z" fill="currentColor" opacity="0.6" />
    <path d="M2 10 C 2 14, 6 14, 6 10 C 6 6, 2 6, 2 10 Z" fill="currentColor" opacity="0.6" />
    <circle cx="10" cy="10" r="1.6" fill="currentColor" />
  </svg>
);

const Seal = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1">
    <circle cx="32" cy="32" r="28" />
    <circle cx="32" cy="32" r="22" strokeWidth="0.6" opacity="0.5" />
    <path d="M32 6 L32 14 M32 50 L32 58 M6 32 L14 32 M50 32 L58 32" strokeWidth="0.6" opacity="0.5" />
    <path d="M32 16 L40 32 L32 48 L24 32 Z" fill="currentColor" opacity="0.4" />
    <path d="M32 22 L36 32 L32 42 L28 32 Z" fill="currentColor" />
    <circle cx="32" cy="32" r="2.5" fill="#0a0805" />
  </svg>
);

const Rune = ({ size = 18, glyph = "rune1" }) => {
  const paths = {
    rune1: <path d="M4 3 L4 17 M4 10 L14 3 M4 10 L14 17" />,
    rune2: <path d="M4 3 L14 3 L14 17 L4 17 M4 10 L14 10" />,
    rune3: <path d="M9 3 L9 17 M3 7 L15 7 M3 13 L15 13" />,
    kindle: <><path d="M9 3 C 6 8, 12 11, 9 17 M9 17 C 6 14, 6 11, 9 8" /><circle cx="9" cy="17" r="1" fill="currentColor"/></>,
    lament: <path d="M3 3 L9 14 L15 3 M9 14 L9 17" />,
    eye: <><path d="M2 9 C 5 4, 13 4, 16 9 C 13 14, 5 14, 2 9 Z" /><circle cx="9" cy="9" r="2" fill="currentColor"/></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      {paths[glyph] || paths.rune1}
    </svg>
  );
};

// Atmospheric placeholder — distant arches/silhouette
const HeroSilhouette = () => (
  <svg className="hero-silhouette" viewBox="0 0 1400 600" preserveAspectRatio="xMidYEnd meet">
    <defs>
      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0a0805" stopOpacity="0" />
        <stop offset="40%" stopColor="#0a0805" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#0a0805" stopOpacity="1" />
      </linearGradient>
      <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1a120a" stopOpacity="0" />
        <stop offset="100%" stopColor="#1a120a" stopOpacity="0.95" />
      </linearGradient>
    </defs>
    {/* Distant mountain ridge */}
    <path d="M0 480 L120 380 L260 420 L380 340 L520 400 L660 320 L800 380 L940 300 L1100 360 L1240 320 L1400 400 L1400 600 L0 600 Z"
          fill="url(#sg2)" opacity="0.55"/>
    {/* Cathedral spires silhouette */}
    <g fill="url(#sg)" opacity="0.85">
      <path d="M180 600 L180 420 L195 380 L210 360 L225 380 L240 420 L240 600 Z" />
      <path d="M280 600 L280 460 L290 440 L300 460 L300 600 Z" />
      <path d="M540 600 L540 380 L560 320 L580 280 L600 240 L620 280 L640 320 L660 380 L660 600 Z" />
      <path d="M700 600 L700 440 L715 410 L730 440 L730 600 Z" />
      <path d="M1000 600 L1000 400 L1020 360 L1040 320 L1060 360 L1080 400 L1080 600 Z" />
      <path d="M1180 600 L1180 460 L1195 430 L1210 460 L1210 600 Z" />
    </g>
    {/* Foreground */}
    <path d="M0 540 L1400 540 L1400 600 L0 600 Z" fill="#0a0805" />
  </svg>
);

window.Sigil = Sigil;
window.Diamond = Diamond;
window.FlourishLeft = FlourishLeft;
window.FlourishRight = FlourishRight;
window.Quatrefoil = Quatrefoil;
window.Seal = Seal;
window.Rune = Rune;
window.HeroSilhouette = HeroSilhouette;
