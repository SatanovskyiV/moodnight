"use client";

import { useTranslations } from "next-intl";

import { useSession, useSessionHint } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { UserMenu, UserMenuStandIn } from "./user-menu";

/**
 * The one control in the bar that depends on who is reading: a link to
 * `/sign-in` for a stranger, and for a member their own menu — name, standing,
 * the way into their areas, and the way out.
 *
 * A client component because that is the only place the answer exists — see the
 * note on `SessionProvider`. It is also why this is split out of `TopNav` rather
 * than turning the whole bar into one: the wordmark, the section links and every
 * message lookup behind them stay on the server, and the client bundle gets the
 * two labels this file needs.
 *
 * `restoring` counts as signed in. The hint it is acting on has already been
 * read from this origin's storage, so the odds strongly favour a real session,
 * and being right immediately for the common case is worth more than withholding
 * the control until the network confirms what storage already said. If it turns
 * out to be wrong the state settles to `signedOut` and this becomes a sign-in
 * link — the same correction, a moment later.
 *
 * An `unknown` hint is the one case that renders both, because it is the one
 * case where this file is not the thing deciding. The HTML is built once, at
 * deploy time, for every reader; the storage that tells them apart cannot be
 * read until the bundle runs. So both controls are emitted and CSS shows the one
 * the pre-paint script in the root layout chose, keyed off `data-session` on
 * `<html>`. Without JavaScript no script runs, no attribute is set, and the
 * sign-in link — the only control that works there anyway — is what remains.
 * Hydration then replaces the pair with a single control and the attribute stops
 * being consulted.
 *
 * That comes from `useSessionHint` and not from `state`, because it describes
 * this render rather than the reader: `SessionState` stays three states so no
 * page added later inherits a case only the bar ever had a use for. The two
 * `data-session` variants below are spelled out in full for a duller reason —
 * Tailwind finds classes by scanning for whole strings, so they cannot be built
 * from the names in session/hint.ts, which is why that file points back here.
 *
 * `restoring` gets a branch of its own now that the member's control carries
 * their name, which is the one thing a restoring session does not yet have. It
 * is the same shape and the same square, holding the place — see
 * `UserMenuStandIn`.
 */
export function AuthAction() {
  const hint = useSessionHint();
  const { state, signOut, isSigningOut } = useSession();

  if (hint === "unknown") {
    return (
      <>
        <SignInLink className="[[data-session=restoring]_&]:hidden" />
        <UserMenuStandIn className="hidden [[data-session=restoring]_&]:flex" />
      </>
    );
  }

  if (state.status === "signedOut") {
    return <SignInLink />;
  }

  if (state.status === "restoring") {
    return <UserMenuStandIn className="flex" />;
  }

  return <UserMenu user={state.session.user} onSignOut={signOut} isSigningOut={isSigningOut} />;
}

function SignInLink({ className }: { className?: string }) {
  const t = useTranslations("nav");

  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link href="/sign-in">{t("signIn")}</Link>
    </Button>
  );
}
