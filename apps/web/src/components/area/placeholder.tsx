import { AreaHeading } from "@/components/area/heading";
import { Panel } from "@/components/editorial/panel";

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
 *
 * The panel itself is components/editorial/panel.tsx — this was where it was
 * first drawn, and it moved out when the feed became its third wearer. No
 * `title` on it: the heading above already says where you are, and the panel
 * repeating it would be the same words twice.
 */
export function AreaPlaceholder({ title, line }: { title: string; line: string }) {
  return (
    <section className="flex flex-col gap-8">
      <AreaHeading title={title} />

      <Panel line={line} />
    </section>
  );
}
