import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Cinzel,
  Cormorant_Garamond,
  IM_Fell_English_SC,
  UnifrakturMaguntia,
} from "next/font/google";

import { TopNav } from "@/components/top-nav";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";
import { routing } from "@/i18n/routing";

import "../globals.css";

/**
 * Replaces the render-blocking Google Fonts <link> in the prototype's
 * prototype/MoodNight.html:10. Only Cormorant Garamond — the body face, and the one
 * that actually sets Ukrainian text — ships a Cyrillic subset upstream; the
 * three display faces are Latin-only at the source.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-cormorant",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const imFell = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-im-fell",
  display: "swap",
});

const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-unifraktur",
  display: "swap",
});

/**
 * Prerenders one tree per language at build time. Together with the
 * `setRequestLocale` inside `resolveLocale`, this is what keeps the read path
 * static — the ISR assumption the whole cost model in docs/ROADMAP.md rests on.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(props);
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0805",
  colorScheme: "dark",
};

/**
 * The app's only root layout: every route lives under `[locale]`, so this is
 * where <html> and <body> belong and there is no unprefixed tree to serve.
 */
export default async function LocaleLayout({
  children,
  ...props
}: LocaleParams & { children: React.ReactNode }) {
  const locale = await resolveLocale(props);

  return (
    <html
      lang={locale}
      data-accent="gold"
      className={`${cormorant.variable} ${cinzel.variable} ${imFell.variable} ${unifraktur.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <TopNav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
