import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for `next/link` and `next/navigation`. Import these
 * instead of the Next.js originals anywhere a *route* is involved: a link
 * written as `/authors` resolves to `/uk/authors` or `/en/authors` on its own,
 * so no component has to know the active locale to build a href.
 *
 * Same-page anchors (`#feed`) are not routes — those stay plain `<a>` elements.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
