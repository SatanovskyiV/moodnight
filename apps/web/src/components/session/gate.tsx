"use client";

import { hasRole, type UserRole } from "@moodnight/shared";
import { useTranslations } from "next-intl";

import { Seal, Spark } from "@/components/editorial/ornaments";
import { useSession, useSessionHint } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * What a reader is shown in place of a page they may not see.
 *
 * **This is chrome, not security.** The refresh cookie is pathed `/api/auth`
 * (see refreshCookieOptions in apps/api), so a request for `/uk/studio` does not
 * carry it: neither src/proxy.ts nor any Server Component can tell who is
 * asking, and buying that knowledge would cost an API call per page view on a
 * site whose whole cost model is static delivery. So the browser decides what to
 * *show* and `RolesGuard` in apps/api decides what to *allow*.
 *
 * The consequence worth stating plainly: a gated page is still built at deploy
 * time, for everybody. Its markup does not reach the first HTML — the branch
 * below renders a panel instead — but it does travel in the route's payload,
 * which anyone may fetch. That is fine for chrome and must stay untrue of data:
 * anything private arrives over an authenticated call, never baked into a page.
 *
 * The states are `SessionState`'s, with one more question asked of the last one:
 *
 * | The session says | This renders |
 * |---|---|
 * | signed in, role high enough | `children` |
 * | signed in, role too low | the forbidden panel |
 * | restoring | the waiting panel |
 * | signed out | the door, with a link back here after signing in |
 *
 * `children` is whatever the server prerendered — the gate never builds it — so
 * putting one around a page costs the client bundle a reference and not the
 * page.
 *
 * The `unknown` hint is the fifth row and the awkward one, handled exactly as
 * the bar's auth control and the home page's welcome handle it: both panels are
 * emitted and CSS shows the one the pre-paint script chose, keyed off
 * `data-session` on `<html>`. A returning member never sees a shut door on the
 * way in. What cannot be pre-painted is the granted branch — no attribute can
 * carry a role — so a member sees the wait and then the page, which is the same
 * sequence the home page already gives them. The two `data-session` variants are
 * written out in full because Tailwind finds classes by scanning for whole
 * strings; see components/session/hint.ts, which points back at this file.
 */
export function RequireRole({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const hint = useSessionHint();
  const { state } = useSession();

  if (hint === "unknown") {
    return (
      <>
        <Door className="flex [[data-session=restoring]_&]:hidden" />
        <Restoring className="hidden [[data-session=restoring]_&]:flex" />
      </>
    );
  }

  if (state.status === "restoring") {
    return <Restoring className="flex" />;
  }

  if (state.status === "signedOut") {
    return <Door className="flex" />;
  }

  if (!hasRole(state.session.user.role, role)) {
    return <Forbidden />;
  }

  return children;
}

/**
 * The box all three panels are, so that swapping one for another — which is
 * what the pre-paint pair above does, in the frame before the first paint — does
 * not also move the page under the reader.
 *
 * The display class comes from the caller and is deliberately absent here: these
 * are rendered `hidden` in the pre-paint pass and `flex` after it, and a base
 * `flex` would leave two rules of the same property to be settled by the order
 * Tailwind happened to emit them in.
 */
function SessionPanel({
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { className?: string }) {
  return (
    <section
      className={`compact:min-h-[20rem] min-h-[16rem] flex-col items-center justify-center gap-6 px-4 text-center ${className ?? ""}`}
      {...props}
    >
      {children}
    </section>
  );
}

/**
 * The wait, dressed as a rite rather than a spinner: the seal turning once every
 * twelve seconds over a breathing pool of gold, and a line saying what is being
 * waited for.
 *
 * Shared with the home page's `Welcome`, which is the other place a reader waits
 * for `/auth/refresh` to say who they are. It lives here rather than there
 * because this is the file about not being through the door yet, and because two
 * copies of a rite are two rites.
 *
 * `label` is how a third place borrows it without becoming a fourth rite. The
 * default line — "Свічі пригадують тебе" — is about the *session*, and a table
 * waiting for its first page is waiting for something else; a list passes its own
 * sentence and gets the same seal turning above it. Everything else about the
 * wait is deliberately not configurable.
 */
export function Restoring({ className, label }: { className?: string; label?: string }) {
  const t = useTranslations("access");

  return (
    <SessionPanel
      // The wait is announced, the greeting and the refusals are not: a reader
      // who cannot see the seal turning still learns that something is
      // happening, and `polite` means it waits its turn rather than
      // interrupting.
      aria-live="polite"
      aria-busy="true"
      className={`gap-8 ${className ?? ""}`}
    >
      <span className="text-primary/60 drop-shadow-glow compact:size-20 relative grid size-16 place-items-center">
        <span
          aria-hidden="true"
          className="bg-primary/10 absolute inset-[-25%] rounded-full blur-2xl motion-safe:animate-pulse"
        />
        {/* Twelve seconds a turn. `animate-spin`'s own second would be a loading
            spinner; at this speed a heraldic seal is barely moving, which is the
            difference between waiting and being made to wait. */}
        <Seal className="relative size-full [animation-duration:12s] motion-safe:animate-spin" />
      </span>

      <p className="font-caps text-primary/70 text-label tracking-eyebrow flex flex-col items-center gap-5 uppercase">
        <span className="-mr-[0.4em]">{label ?? t("restoring")}</span>

        {/* The ellipsis, in the site's own alphabet — three sparks lighting in
            turn. `motion-safe:` covers the stagger too: without it they simply
            sit there, lit, which is a full stop and not a broken animation. */}
        <span aria-hidden="true" className="flex items-center gap-3">
          <Spark className="motion-safe:animate-pulse" />
          <Spark className="[animation-delay:400ms] motion-safe:animate-pulse" />
          <Spark className="[animation-delay:800ms] motion-safe:animate-pulse" />
        </span>
      </p>
    </SessionPanel>
  );
}

/**
 * For a reader who is not signed in.
 *
 * The alternative — bouncing them to `/sign-in` — would have to be a
 * `router.replace` after hydration, which flashes, throws away the URL they
 * asked for, and on a prerendered page happens later than this panel is already
 * on screen. Staying put and offering the door is calmer and keeps the address,
 * which is what `next` below then hands back.
 *
 * `usePathname` is next-intl's, so the path it gives has no locale prefix — the
 * same form the router will add one back to after signing in. Encoded because it
 * becomes a query value; validated on the other side, in the sign-in form, since
 * an address bar can put anything here.
 */
function Door({ className }: { className?: string }) {
  const t = useTranslations("access.door");
  const pathname = usePathname();

  return (
    <SessionPanel className={className}>
      <PanelSeal className="text-primary/60" />

      {/* An `h1` and not an `h2`: when this renders, the page's own heading is
          inside the `children` the gate did not render, so this panel *is* the
          page and the document would otherwise have no heading at all. */}
      <PanelHeading>{t("title")}</PanelHeading>
      <PanelLine>{t("line")}</PanelLine>

      <Button asChild className="compact:px-8 mt-2 px-5 whitespace-normal">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>{t("action")}</Link>
      </Button>
    </SessionPanel>
  );
}

/**
 * For a reader who is signed in and still not admitted — an author at
 * `/admin/users`, an editor at `/admin/settings`.
 *
 * It says so plainly rather than pretending the page is missing. The reasoning
 * is the API's, at roles.guard.ts: a 404 would buy nothing, since these paths are
 * in the nav of anyone who does have the key, and it would leave someone unable
 * to tell "you may not" from "you typed it wrong".
 *
 * No pre-paint variant and no `className`, because this state cannot be reached
 * before the session is known — a role is not something an attribute on `<html>`
 * can carry.
 */
function Forbidden() {
  const t = useTranslations("access.forbidden");

  return (
    <SessionPanel className="flex">
      <PanelSeal className="text-primary-deep" />

      <PanelHeading>{t("title")}</PanelHeading>
      <PanelLine>{t("line")}</PanelLine>

      <Button asChild variant="ghost" className="compact:px-8 mt-2 px-5 whitespace-normal">
        <Link href="/">{t("action")}</Link>
      </Button>
    </SessionPanel>
  );
}

/**
 * The glyph above each refusal — the same one that sits above the auth card's
 * form, so a shut door is recognisably the same house as the way in.
 */
function PanelSeal({ className }: { className?: string }) {
  return (
    <span className={`compact:size-16 grid size-14 place-items-center ${className}`}>
      <Seal className="size-full" />
    </span>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-foreground tracking-display text-[clamp(1.3rem,5vw,1.8rem)] leading-tight uppercase">
      {children}
    </h1>
  );
}

function PanelLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground max-w-[32rem] text-lg text-balance italic">{children}</p>
  );
}
