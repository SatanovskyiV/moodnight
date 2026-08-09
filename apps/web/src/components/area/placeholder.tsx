import { AreaHeading } from "@/components/area/heading";
import { Seal } from "@/components/editorial/ornaments";

/**
 * A section that has its place but not yet its contents.
 *
 * A Server Component, and the reason every stub page under `/studio` and
 * `/admin` is eight lines: the shells went in first so that the shape of the
 * site — where a thing lives, who may see it, how you get back — could be
 * settled before anything had to be built inside it. What replaces each of these
 * is one page's worth of work that changes nothing around it.
 *
 * The line it shows is a catalogue string in the site's own voice rather than
 * "coming soon", because a reader who arrives here is being told what this place
 * is for, and that sentence stays true when the panel goes.
 */
export function AreaPlaceholder({ title, line }: { title: string; line: string }) {
  return (
    <section className="flex flex-col gap-8">
      <AreaHeading title={title} />

      {/* The prototype's auth pool, in miniature: lifted ink inside a gold
          hairline. It marks the block as scaffolding without making a spectacle
          of it — nothing here is broken, it is simply not written yet. */}
      <div className="border-primary/20 from-secondary/70 to-background/60 compact:px-10 compact:py-14 flex flex-col items-center gap-6 border bg-gradient-to-b px-6 py-10 text-center">
        <span className="text-primary-deep grid size-12 place-items-center">
          <Seal className="size-full" />
        </span>

        <p className="text-muted-foreground max-w-[38rem] text-lg text-balance italic">{line}</p>
      </div>
    </section>
  );
}
