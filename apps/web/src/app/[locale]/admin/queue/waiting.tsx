"use client";

import { useTranslations } from "next-intl";

import { useWaiting } from "@/components/queue/use-waiting";

/**
 * How many poems are waiting, as a mark beside the queue's row in the rail.
 *
 * The counting is `useWaiting`, shared with the bead on the reader's seal in the
 * top bar — see components/queue/use-waiting.ts for why one query serves both,
 * when it says nothing at all, and how a decision keeps it honest. What is left
 * here is the drawing: a hairline frame in the rail's own small caps, which is
 * the treatment ./decided.tsx already gives a fact stated in a word beside a
 * poem.
 *
 * `null` from the hook means *draw nothing*, and this component makes no
 * judgement of its own about when that is.
 */
export function Waiting() {
  const t = useTranslations("admin.sections.queue");
  const waiting = useWaiting();

  if (waiting === null) {
    return null;
  }

  return (
    <span className="font-caps text-micro border-primary/25 text-primary/80 inline-flex min-w-[1.6rem] items-center justify-center border px-1.5 py-0.5 tabular-nums">
      {/* The digit is for the eye and the sentence is for the ear. A screen
          reader that met the number alone would announce "Черга 3", which is a
          link with a number after it rather than three poems waiting — so the
          bare figure is hidden and the counted phrase read instead. */}
      <span aria-hidden="true">{waiting}</span>
      <span className="sr-only">{t("waiting", { count: waiting })}</span>
    </span>
  );
}
