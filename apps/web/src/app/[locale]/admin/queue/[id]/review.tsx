"use client";

import type { StudioPoem } from "@moodnight/shared";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Rune } from "@/components/editorial/ornaments";
import { Restoring } from "@/components/session/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useGetStudioPoem, type getStudioPoemResponse } from "@/lib/api/generated/poems";

import { Decided } from "../decided";
import { Decision } from "./decision";
import { EditForm } from "./edit-form";

/**
 * Why the poem could not be fetched — the read half of the split every form on
 * this site makes, with the statuses `GET /studio/poems/{id}` documents.
 *
 * `gone` is the 404 and is a real case rather than defensive padding: this is
 * the first address on the site worth bookmarking, and a poem its author deleted
 * while it sat in the queue answers exactly this way. It is worded as an absence
 * rather than as a failure, because nothing went wrong.
 *
 * 403 falls through to `unexpected`. `assertMayReach` passes for any moderator
 * and the shell above has already refused anybody below one, so a 403 here would
 * mean the two ladders disagree — a bug, not something to word a message for.
 */
type Failure = "gone" | "signedOut" | "network" | "unexpected";

/**
 * One poem out of the queue: read in full, edited if a line needs it, and
 * answered.
 *
 * The client boundary starts here rather than at the page, which is the
 * arrangement every screen with data on it uses — and here it is not a
 * preference. docs/ROADMAP.md: "a gated page is built at deploy time for
 * everybody and its payload is fetchable by anybody, so data must always arrive
 * over an authenticated call and never be baked into a page."
 *
 * Reading and editing are one component holding a boolean rather than two
 * routes, because they are one screen in two states: an editor who fixes a line
 * is in the middle of deciding, and sending them to `/edit` and back would lose
 * the decision panel's own state on the way. The poem is fetched once and both
 * states render from it.
 */
export function Review({ id }: { id: string }) {
  const t = useTranslations("admin.sections.queue.review");

  const { data, error, isPending, refetch } = useGetStudioPoem<
    getStudioPoemResponse,
    // `<ApiRequestError>` because orval types `TError` from the statuses the
    // document lists, which is `void` — it cannot know what the mutator throws,
    // and `request` throws exactly one thing.
    ApiRequestError
  >(id);

  const [editing, setEditing] = useState(false);

  if (isPending) {
    return <Restoring className="flex" label={t("loading")} />;
  }

  if (error) {
    const failure: Failure = error.isUnreachable
      ? "network"
      : error.status === 404
        ? "gone"
        : error.status === 401
          ? "signedOut"
          : "unexpected";

    return (
      <div className="flex flex-col items-start gap-4">
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground w-full border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`error.${failure}`)}
        </p>

        {/* No retry on a 404: the poem is not coming back, and a button that
            cannot work is worse than none. */}
        {failure !== "gone" && (
          <Button variant="ghost" size="sm" className="px-4" onClick={() => refetch()}>
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }

  const poem = payload(data);

  if (editing) {
    return <EditForm poem={poem} onDone={() => setEditing(false)} />;
  }

  return (
    <article className="flex flex-col gap-8">
      <Masthead poem={poem} onEdit={() => setEditing(true)} />

      {poem.review && <Previously review={poem.review} />}

      {/* `whitespace-pre-line` is the contract, not a style choice: the API
          describes the body as plain text whose line breaks are content
          (packages/shared/src/poem.ts), so a client renders them and does not
          reflow them. The type scale is the card's, because the question this
          page asks is how the poem reads.

          No drop cap and no corner frames, and the omission is deliberate rather
          than unfinished: those are what publication looks like
          (components/editorial/poem-card.tsx), and this is the room before it. A
          poem wearing the card here would say it was already on the fires. */}
      <p className="text-foreground text-xl leading-[1.75] whitespace-pre-line">{poem.body}</p>

      {poem.tags.length > 0 && (
        <ul className="flex flex-wrap items-center gap-3">
          {poem.tags.map((tag) => (
            <li key={tag.slug}>
              <Badge>
                <Rune glyph="rune1" size={12} />
                {tag.name}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="border-primary/15 border-t pt-8">
        {/* Rendered whatever the poem's status is, and `Decision` decides for
            itself what it has to offer. The status branch cannot live here: a
            decision invalidates this very query, so the poem would come back
            PUBLISHED a moment later and this ternary would swap the panel
            saying what the editor just did for one saying somebody had beaten
            them to it. What a mutation in flight knows outranks what its own
            refetch reports, and only the component holding that mutation can
            say so. */}
        <Decision poem={poem} />
      </div>
    </article>
  );
}

/**
 * The poem's title, its second line, and everything around it that is not the
 * poem: whose voice it is, how long it has waited, and whose hand was last on
 * the text.
 */
function Masthead({ poem, onEdit }: { poem: StudioPoem; onEdit: () => void }) {
  const t = useTranslations("admin.sections.queue.review");
  const format = useFormatter();

  // `useFormatter` and not an ICU date argument, as on the queue's own columns:
  // `timeZone: "Europe/Kyiv"` from i18n/request.ts still applies, so the server
  // and the browser agree on which day this is.
  const day = (at: string) =>
    format.dateTime(new Date(at), { day: "numeric", month: "short", year: "numeric" });

  return (
    <header className="flex flex-col gap-4">
      <div className="compact:flex-row compact:items-start flex flex-col justify-between gap-4">
        <div className="flex flex-col gap-2">
          {/* The page's own `h1`. The area shell's title is a label on a rail,
              not a heading, so this is the top of the outline — and it is the
              poem, which is what the page is about. */}
          <h1 className="font-display text-foreground tracking-title text-[clamp(1.6rem,3vw,2.2rem)] font-medium text-balance uppercase">
            {poem.title}
          </h1>

          {poem.subtitle && (
            <p className="text-muted-foreground text-[1.05rem] italic">{poem.subtitle}</p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onEdit}
          // The poem's title, so a screen reader hears which poem is being
          // edited rather than the same word on every page.
          aria-label={t("edit.startFor", { title: poem.title })}
        >
          {t("edit.start")}
        </Button>
      </div>

      <p className="font-caps text-parchment-faint text-micro tracking-credit flex flex-wrap items-center gap-x-3 gap-y-1 uppercase">
        <span className="text-muted-foreground">{poem.author.penName}</span>

        {/* `submittedAt` is nullable on the shared type and cannot be null on a
            poem that reached the queue — the API stamps it on the way in — but a
            poem decided long ago and opened from a bookmark is reachable here in
            any state, so the branch is real rather than defensive. */}
        {poem.submittedAt && <span>{t("waitingSince", { date: day(poem.submittedAt) })}</span>}

        <span>{t("written", { date: day(poem.createdAt) })}</span>
      </p>

      {/* Never null for an editor — `maySeeEdits` in apps/api/src/poems/poem-access.ts
          sends the whole object or none of it, and the floor on this page is the
          floor on that rule — so the branch is the contract's honesty about
          authors rather than a case that happens here.

          Two catalogue keys chosen by the number, not one sentence with a
          version in it: "as its author wrote it" and "last saved by —" are
          different facts, and version 1 is the one an editor can stop reading
          at. */}
      {poem.lastEdit && (
        <p className="font-caps text-parchment-faint text-micro tracking-credit uppercase">
          {poem.lastEdit.version === 1
            ? t("original")
            : t("edited", {
                version: poem.lastEdit.version,
                name: poem.lastEdit.editor.penName,
                date: day(poem.lastEdit.editedAt),
              })}
        </p>
      )}
    </header>
  );
}

/**
 * What was decided the last time this poem was here — the block an editor most
 * needs when a poem comes round a second time, because the note is what the
 * author was answering.
 *
 * `reviewer` is nullable on the shared type and is the caller's own permission
 * speaking: it is null for anybody below an editor, and never for anybody who
 * can reach this page. The branch is written anyway rather than asserted, for
 * the reason the queue's `Moment` gives — an assertion would become a lie the
 * day this block is reused on the author's side of the site.
 */
function Previously({ review }: { review: NonNullable<StudioPoem["review"]> }) {
  const t = useTranslations("admin.sections.queue.review");
  const format = useFormatter();

  const date = format.dateTime(new Date(review.decidedAt), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <section
      aria-label={t("previous.title")}
      className="border-primary/20 flex flex-col items-start gap-3 border-l-2 py-1 pl-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Decided action={review.action} label={t(`previous.${review.action}`)} />

        <span className="font-caps text-parchment-faint text-micro tracking-credit uppercase">
          {review.reviewer ? t("previous.by", { name: review.reviewer.penName, date }) : date}
        </span>
      </div>

      {/* Null on an approval that said nothing, never on a rejection — the API
          refuses one without a reason. */}
      {review.note && (
        <p className="text-muted-foreground text-[1.05rem] italic">
          {t("previous.note", { note: review.note })}
        </p>
      )}
    </section>
  );
}
