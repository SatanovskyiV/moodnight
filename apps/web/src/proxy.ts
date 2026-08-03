import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Negotiates the locale for prefix-less requests (`/` → `/uk`) and emits the
 * `Link` alternate-language headers search engines use to pair the two versions.
 *
 * Lives in `proxy.ts`, not `middleware.ts`: Next.js 16.2 deprecated the older
 * filename. The contract is unchanged, so next-intl's `createMiddleware` is
 * still exactly the right handler to export.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except Next.js internals and anything with a file extension —
  // static assets must not be redirected into a locale prefix.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
