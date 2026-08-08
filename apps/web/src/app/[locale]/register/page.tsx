import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { AuthAlt, AuthCard } from "@/components/auth-card";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

import { RegisterForm } from "./register-form";

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "register" });

  return { title: t("metaTitle") };
}

/**
 * The registration screen — the prototype's auth card in its `signup` mode
 * (prototype/app.jsx:226-250), now a route of its own beside `/sign-in`.
 *
 * Public, unguarded and role-less by construction: `POST /auth/register` takes
 * no role and every account it makes is an AUTHOR, so this page cannot ask for
 * anything more than the four fields the form shows. Minting an editor stays
 * `POST /users`, which is guarded.
 */
export default async function RegisterPage(props: LocaleParams) {
  await resolveLocale(props);

  // Split out because `useTranslations` is a hook and this component has to be
  // async to await the params — the same pairing as the sign-in page.
  return <RegisterScreen />;
}

function RegisterScreen() {
  const t = useTranslations("register");

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <RegisterForm />
      <AuthAlt prompt={t("altPrompt")} href="/sign-in" label={t("altLink")} />
    </AuthCard>
  );
}
