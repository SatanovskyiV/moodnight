import type { PoemReview } from "@moodnight/shared";

/**
 * What a decision wears, by what was decided.
 *
 * A literal lookup and never a template, for the reason components/list/columns.ts
 * spells out at `REVEAL`: Tailwind finds classes by scanning source for whole
 * strings, so a class assembled at runtime is a class that does not exist in the
 * stylesheet.
 *
 * Two tones because the two facts are different and an editor is scanning for
 * one of them. A poem that was sent back and has come again is the row to read
 * first — it is somebody answering a note — and ember is the colour this site
 * already keeps for a thing that went out. A poem that was published and has
 * been resubmitted is an edit to something already on the fires, which is
 * ordinary, and wears the same dim frame the names give a role.
 */
const DECIDED = {
  REJECT: "border-ember/30 text-ember",
  APPROVE: "border-primary/20 text-parchment-faint",
} as const satisfies Record<PoemReview["action"], string>;

/**
 * The verdict on a poem, as a word inside a hairline.
 *
 * Lifted out of ./queue-table.tsx the moment the review page wanted the same
 * mark for the decision that sent a poem back — which is the rule from
 * docs/ROADMAP.md: a treatment worn by more than one component is a component,
 * not an exported class string. It stays beside the two files that wear it
 * rather than moving to components/, because nothing outside the queue has a
 * decision to render.
 *
 * `label` is passed in rather than looked up here. The two callers say different
 * things with the same badge — the table's column is "has this been back
 * before", the review page's is "here is what was decided" — so the word belongs
 * to whoever is asking and only the tone is shared.
 */
export function Decided({ action, label }: { action: PoemReview["action"]; label: string }) {
  return (
    <span
      className={`font-caps text-micro tracking-label inline-block border px-3 py-1 uppercase ${DECIDED[action]}`}
    >
      {label}
    </span>
  );
}
