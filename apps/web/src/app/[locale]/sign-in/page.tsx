import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { AuthAlt, AuthCard } from "@/components/auth-card";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { SignInForm } from "./sign-in-form";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "signIn" });

  return { title: t("metaTitle") };
}

/**
 * The sign-in screen, one of the two modes of the prototype's auth card — see
 * the note on `AuthCard` for why the modes became routes.
 *
 * Still deliberately absent from the port: the "continue with Google" button.
 * Google is a later Passport strategy in docs/ROADMAP.md Phase 3, a button that
 * cannot sign anybody in is worse than no button, and it takes the `or` divider
 * above it with it.
 */
export default async function SignInPage(props: LocaleParams) {
  await resolveLocale(props);

  // Split out because `useTranslations` is a hook and this component has to be
  // async to await the params — the same pairing as the home page.
  return <SignInScreen />;
}

function SignInScreen() {
  const t = useTranslations("signIn");

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <SignInForm />
      <AuthAlt prompt={t("altPrompt")} href="/register" label={t("altLink")} />
    </AuthCard>
  );
}
