import type { PoemStatus } from "@moodnight/shared";

/**
 * What a poem wears, by where it is on its journey.
 *
 * A literal lookup and never a template, for the reason components/list/columns.ts
 * spells out at `REVEAL`: Tailwind finds classes by scanning source for whole
 * strings, so a class assembled at runtime is a class that does not exist in the
 * stylesheet.
 *
 * The four tones read as one gradient rather than four decisions, because that
 * is what the four states are — a poem walks `DRAFT → PENDING_REVIEW →
 * PUBLISHED`, and `REJECTED` is the one branch off it:
 *
 * - **DRAFT** — the dim frame the names give a role. Nothing has happened to it
 *   and nobody but its author can see it; a lit chip on the row an author has
 *   the most of would make the whole page shout.
 * - **PENDING_REVIEW** — a shade brighter. The difference between this and a
 *   draft is that it is out of the author's hands, which is worth a glance and
 *   not an alarm.
 * - **PUBLISHED** — gold, the only lit chip on the page. This is the state the
 *   whole studio is walking towards and the one an author scans for.
 * - **REJECTED** — ember, the colour this site already keeps for a thing that
 *   went out, and the same tone ../../admin/queue/decided.tsx gives the decision
 *   that sent the poem back. The two chips are about the same event seen from
 *   the two ends of it, so they agree on their colour deliberately.
 *
 * `satisfies Record<PoemStatus, string>` and not a partial: a fifth state added
 * to `poemStatusSchema` fails typecheck here rather than rendering an unstyled
 * chip in a table nobody rereads.
 */
const TONE = {
  DRAFT: "border-primary/20 text-parchment-faint",
  PENDING_REVIEW: "border-primary/30 text-parchment-dim",
  PUBLISHED: "border-primary/60 text-primary",
  REJECTED: "border-ember/30 text-ember",
} as const satisfies Record<PoemStatus, string>;

/**
 * Where a poem stands, as a word inside a hairline.
 *
 * The four-state sibling of ../../admin/queue/decided.tsx and modelled on it,
 * down to `label` arriving from the caller rather than being looked up here —
 * the same badge says "this is a draft" in a table and would say "this poem is
 * still a draft" under a heading, so the word belongs to whoever is asking and
 * only the tone is shared.
 *
 * Page-local, for the reason `Decided` is: nothing outside the studio renders a
 * poem's own status yet. It moves to components/ the day a second area wants it,
 * and not before — docs/ROADMAP.md, "nothing is added ahead of need".
 */
export function PoemStatusChip({ status, label }: { status: PoemStatus; label: string }) {
  return (
    <span
      className={`font-caps text-micro tracking-label inline-block border px-3 py-1 uppercase ${TONE[status]}`}
    >
      {label}
    </span>
  );
}
