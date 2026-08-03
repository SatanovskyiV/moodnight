/**
 * Placeholder. The prototype port (hero, poem cards, dividers, embers, nav,
 * footer, auth card) replaces this — see docs/ROADMAP.md, Phase 1 step 2.
 * It exists now only so the theme, fonts and token mapping are visible.
 */
export default function Home() {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-24">
      <p className="font-caps text-primary text-sm tracking-[0.35em] uppercase">Phase 1</p>

      <h1 className="font-display text-foreground text-5xl leading-tight tracking-[0.08em] uppercase">
        MoodNight
      </h1>

      <p className="text-muted-foreground text-xl">
        Каркас зібрано. Тема, шрифти й токени на місці — поезія попереду.
      </p>

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
            <span className="text-parchment-faint text-xs tracking-widest uppercase">{label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
