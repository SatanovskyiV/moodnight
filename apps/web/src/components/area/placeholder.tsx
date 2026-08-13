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
 *
 * `action` is passed straight through to that panel, which has taken one since
 * the feed needed a retry button. A section can be unbuilt and still have
 * somewhere to send the reader — `/studio/poems` has no dashboard yet and does
 * have a page that writes a poem — and offering it here is the difference between
 * a placeholder and a dead end. Optional, because most placeholders have nothing
 * to offer and a button to nowhere is worse than none.
 */
export function AreaPlaceholder({
  title,
  line,
  action,
}: {
  title: string;
  line: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-8">
      <AreaHeading title={title} />

      <Panel line={line} action={action} />
    </section>
  );
}
