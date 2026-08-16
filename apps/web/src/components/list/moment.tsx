"use client";

import { useFormatter } from "next-intl";

/**
 * A date in a cell, or a dash where there is none.
 *
 * Lifted out of app/[locale]/admin/queue/queue-table.tsx the moment the studio's
 * dashboard wanted the same cell, which is the rule from docs/ROADMAP.md: a
 * treatment worn by more than one component is a component, not an exported
 * class string. The queue's copy had been waiting for this — its note said the
 * null branch was written for "the day this cell is reused for the studio's
 * dashboard, where drafts are most of the rows", and that is this file.
 *
 * **The null branch is now the ordinary one.** On the queue it was unreachable:
 * every row there is `PENDING_REVIEW` and the API stamps `submittedAt` on the
 * way in, so the dash never rendered. On an author's own shelf `publishedAt` is
 * null for every draft, everything waiting, and everything that came back — most
 * of the page, most of the time. The branch that looked like defensiveness in
 * one caller is the common case in the other, which is the argument against
 * having written a `!` there instead.
 *
 * At module scope and holding its own formatter, rather than nested in a table
 * and closing over one. A component declared inside another is a new component
 * type on every render, and these are rendered from inside a `useMemo` — the
 * columns would go on calling whichever copy the memo was built with.
 *
 * `useFormatter` and not an ICU message: these cells have no prose around their
 * dates, so a catalogue entry would be a placeholder and nothing else. The dash
 * is `aria-hidden` with no reading beside it on purpose — an empty cell in a
 * column headed "Published" already says what it means, and every row of a
 * column of drafts announcing "not published" is noise in a screen reader that
 * the sighted reader does not get. `timeZone: "Europe/Kyiv"` from
 * i18n/request.ts still applies, so the server and the browser agree on which
 * day this is.
 */
export function Moment({ at }: { at: string | null }) {
  const format = useFormatter();

  if (!at) {
    return (
      <span aria-hidden="true" className="text-parchment-faint">
        —
      </span>
    );
  }

  return (
    <time dateTime={at} className="text-parchment-faint whitespace-nowrap tabular-nums">
      {format.dateTime(new Date(at), { day: "numeric", month: "short", year: "numeric" })}
    </time>
  );
}
