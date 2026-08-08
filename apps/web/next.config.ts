import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Where the NestJS API actually runs.
 *
 * Read here rather than in the browser bundle on purpose: since the refresh
 * cookie forced the API behind this app's own origin (see the rewrite below),
 * this address is something only the proxy needs to know, and a server-only
 * variable is one fewer thing baked into every visitor's download.
 *
 * The fallback is scoped to development for the same reason the old
 * `NEXT_PUBLIC_API_URL` guard was: a production build with this unset would
 * deploy a `/api` proxy pointing at the build machine's own localhost — green
 * build, entirely broken site. Failing the build is the cheaper failure.
 */
const API_ORIGIN = (() => {
  const configured = process.env.API_ORIGIN;

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("API_ORIGIN is not set — the /api proxy has nothing to forward to.");
    }

    return "http://localhost:3001";
  }

  // A configured value ending in `/` would otherwise produce `//auth/login`,
  // which some hosts answer and some 404.
  return configured.replace(/\/+$/, "");
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The workspace package ships compiled CJS; Next bundles it from source-adjacent
  // dist without extra config, but transpiling keeps it treeshakeable.
  transpilePackages: ["@moodnight/shared"],

  /**
   * The API, served from this app's own origin.
   *
   * **This exists because of one cookie.** The two Vercel projects are different
   * subdomains of `vercel.app`, which the Public Suffix List makes *cross-site*
   * — so a refresh cookie set by the api project is, to a browser, a
   * third-party cookie. Safari has blocked those outright since 13.1, as do
   * Chrome's incognito windows and Brave: sign-in appears to work, because the
   * session comes back in the response body, and then the cookie is silently
   * dropped and the very next reload shows "sign in" again. Chrome's normal
   * windows still allow them, which is exactly why this survives local testing.
   *
   * Proxying makes the browser talk only to this origin, so the cookie is
   * first-party and no third-party policy applies to it. That is also what lets
   * the cookie go back to `SameSite=Lax` and behave identically in development
   * and production — see refreshCookieOptions in apps/api, which is where the
   * matching path lives.
   *
   * `/api` is the prefix because src/proxy.ts's matcher already excludes it, so
   * the locale middleware does not try to redirect these to `/uk/api/...`. The
   * prefix is stripped on the way out: the API is mounted at the root and knows
   * nothing about this.
   *
   * Returned as a plain array, which is `afterFiles` — a real route handler
   * added under `app/api` later would win over the proxy rather than be
   * shadowed by it.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default withNextIntl(nextConfig);
