"use client";

import { useTranslations } from "next-intl";

import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The one control in the bar that depends on who is reading: a link to
 * `/sign-in` for a stranger, a button that ends the session for a member.
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
 */
export function AuthAction() {
  const t = useTranslations("nav");
  const { state, signOut, isSigningOut } = useSession();

  if (state.status === "signedOut") {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href="/sign-in">{t("signIn")}</Link>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut()}
      disabled={isSigningOut}
      aria-busy={isSigningOut}
    >
      {isSigningOut ? t("signingOut") : t("signOut")}
    </Button>
  );
}
