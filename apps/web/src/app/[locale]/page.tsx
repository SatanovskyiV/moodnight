import { useTranslations } from "next-intl";

import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

/**
 * Placeholder. The prototype port (hero, poem cards, dividers, embers, footer,
 * auth card) replaces this — see docs/ROADMAP.md, Phase 1 step 2. The top bar is
 * already real and lives in the layout.
 */
export default async function Home(props: LocaleParams) {
  await resolveLocale(props);

  // The content is split out because `useTranslations` is a hook and this
  // component has to be async to await the params.
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");

  return (
    <main className="max-w-reading relative z-10 mx-auto flex min-h-screen flex-col justify-center gap-8 px-8 py-24">
      <p className="font-caps text-primary text-label tracking-eyebrow uppercase">{t("phase")}</p>

      <h1 className="font-display text-foreground tracking-display text-5xl leading-tight uppercase">
        {t("title")}
      </h1>

      <p className="text-muted-foreground text-xl">{t("tagline")}</p>

      <div className="border-border flex flex-wrap gap-3 border-t pt-8">
        {(
          [
            ["bg-background", "background"],
            ["bg-card", "card"],
            ["bg-secondary", "secondary"],
            ["bg-primary", "primary"],
            ["bg-ember", "ember"],
            ["bg-destructive", "destructive"],
          ] as const
        ).map(([className, label]) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className={`border-border size-12 border ${className}`} />
            {/* Token names, not prose — deliberately untranslated. */}
            <span className="text-parchment-faint text-micro tracking-widest uppercase">
              {label}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
