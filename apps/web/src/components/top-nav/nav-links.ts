/**
 * The nav's link set, in order. `key` indexes the `nav` message namespace, so a
 * label change is a catalogue edit and never a component edit — and a key that
 * does not exist fails typecheck where `t(key)` is called.
 *
 * The hrefs are same-page anchors while the site is still one page, which is why
 * they render as plain `<a>` and not as routes. Phase 2 turns them into real
 * routes (`/feed`, `/authors`, …); at that point they move to `Link` from
 * `@/i18n/navigation`, which resolves them against the active locale on its own.
 */
export const NAV_LINKS = [
  { key: "feed", href: "#feed" },
  { key: "authors", href: "#authors" },
  { key: "collections", href: "#collections" },
  { key: "about", href: "#about" },
] as const;
