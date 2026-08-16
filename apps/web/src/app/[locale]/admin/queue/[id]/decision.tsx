"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  approvePoemSchema,
  rejectPoemSchema,
  REVIEW_NOTE_MAX,
  type ReviewAction,
  type StudioPoem,
} from "@moodnight/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Panel } from "@/components/editorial/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { getGetStudioPoemQueryKey, useApprovePoem, useRejectPoem } from "@/lib/api/generated/poems";

import { QUEUE_QUERY_KEY } from "../queue-key";

/**
 * Each decision resolved against the contract the endpoint behind it enforces.
 *
 * A literal lookup for the reason every lookup on this site is one, and the
 * whole reason `packages/shared` keeps these as two schemas rather than one with
 * an `action` field: the note is optional on an approval and required on a
 * rejection, and that difference *is* the pair. Picking the schema by the action
 * means the required-note rule arrives from the same object the API validates
 * with, and is never written down a second time here.
 */
const SCHEMA = {
  APPROVE: approvePoemSchema,
  REJECT: rejectPoemSchema,
} as const satisfies Record<ReviewAction, unknown>;

/**
 * Why the decision failed. `decided` is the one worth wording carefully.
 *
 * A 409 from either endpoint means the poem is no longer `PENDING_REVIEW`, and
 * on a site with more than one editor that almost always means somebody
 * answered it a moment ago — the update's `where` carries the status, so a lost
 * race and a stale tab come back the same way
 * (apps/api/src/poems/poem-queue.service.ts). It is the one failure here that
 * retrying can never fix, so its message sends the reader back to the queue
 * instead of asking them to try again.
 *
 * `gone` is the 404: the poem was deleted while it was being read.
 *
 * 400 and 403 fall through to `unexpected`, for the reason the edit form gives.
 */
type Failure = "signedOut" | "gone" | "decided" | "network" | "unexpected";

/** What the note field holds. Both schemas above infer to exactly this. */
type Note = { note?: string };

/**
 * Answering a poem: yes, or no and why.
 *
 * Two buttons and one panel rather than a dialog. A modal would put a layer over
 * the poem at the moment the editor is deciding about it — and the note they are
 * writing is usually about a line they want to keep re-reading. Nothing here
 * needs focus trapped; the decision is one field and two buttons at the bottom
 * of the page it belongs to.
 *
 * `asking` is the whole state: null shows the two buttons, and either value
 * opens the note under them with that action's button now confirming. One value
 * rather than a boolean and an action, because "open, but for nothing" is a
 * state that should not be representable.
 */
export function Decision({ poem }: { poem: StudioPoem }) {
  const t = useTranslations("admin.sections.queue.review");
  const queryClient = useQueryClient();

  const [asking, setAsking] = useState<ReviewAction | null>(null);

  const {
    register: field,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Note>({
    // Re-resolved on every render against whichever decision is open, so opening
    // the other one changes what the same field is allowed to be.
    resolver: zodResolver(asking ? SCHEMA[asking] : approvePoemSchema),
    defaultValues: { note: "" },
  });

  /**
   * Both decisions land in the same two places, so the options are built once.
   *
   * The poem is invalidated because it comes back with a new `status`, a
   * `review` and possibly a `publishedAt` — and this component is about to show
   * a panel over it, so the read view behind must not still say PENDING_REVIEW
   * if the editor navigates back to it. The queue is invalidated because the
   * poem has just left it and a list still offering the row would be a lie.
   */
  const settle = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetStudioPoemQueryKey(poem.id) });
      queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
    },
  };

  const approve = useApprovePoem<ApiRequestError>({ mutation: settle });
  const reject = useRejectPoem<ApiRequestError>({ mutation: settle });

  // Whichever one answered. Both mutations are held because the panel can be
  // opened, cancelled and opened the other way without this component
  // remounting — but a poem leaves the queue on the first decision that lands,
  // so at most one of them can ever carry data.
  const decided = approve.data ? payload(approve.data) : reject.data ? payload(reject.data) : null;

  if (decided) {
    // What happened is read off the row that was written rather than remembered
    // from which button was pressed — the same reading the compose form makes of
    // its own response.
    const published = decided.status === "PUBLISHED";

    return (
      <Panel
        title={t(published ? "done.approved" : "done.rejected")}
        line={t(published ? "done.approvedLine" : "done.rejectedLine", { title: decided.title })}
        action={
          <Button asChild className="compact:px-8 px-5 whitespace-normal">
            <Link href="/admin/queue">{t("done.back")}</Link>
          </Button>
        }
      />
    );
  }

  /**
   * A poem that is not waiting cannot be answered, and this is checked *after*
   * the decision above rather than before it.
   *
   * `GET /studio/poems/{id}` answers for a poem in any state, so this page opens
   * on one that has already left the queue — a bookmark, a second tab, another
   * editor a minute earlier. The reading still stands; only the answering is
   * over, and saying so is better than two live buttons that would 409 on every
   * press.
   *
   * The order matters because a decision invalidates the poem: settle it and the
   * refetch comes back PUBLISHED, which is this branch. Checked first, an editor
   * would watch their own approval turn into "somebody got here before you".
   */
  if (poem.status !== "PENDING_REVIEW") {
    return (
      <Panel
        title={t("left.title")}
        line={t("left.line")}
        action={
          <Button asChild variant="ghost" className="compact:px-8 px-5 whitespace-normal">
            <Link href="/admin/queue">{t("back")}</Link>
          </Button>
        }
      />
    );
  }

  const isPending = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;

  const failure: Failure | null = !error
    ? null
    : error.isUnreachable
      ? "network"
      : error.status === 401
        ? "signedOut"
        : error.status === 404
          ? "gone"
          : error.status === 409
            ? "decided"
            : "unexpected";

  const open = (action: ReviewAction) => () => {
    // The note starts empty each time the panel opens, and the previous
    // decision's complaint about it goes with it: a word written for a rejection
    // is not the word that belongs on an approval.
    reset({ note: "" });

    // Both mutations, not just the one being opened. `failure` above reads
    // whichever error is set, so an approval that came back 409 would go on
    // reporting itself over a rejection that has not been sent yet — the one
    // place two mutations behind one panel can lie.
    approve.reset();
    reject.reset();

    setAsking(action);
  };

  const send = handleSubmit(({ note }) => {
    if (asking === "REJECT") {
      // `note` is a string here and not `string | undefined`, because
      // `rejectPoemSchema` is what just passed — but the type is the union of
      // both schemas' outputs, so the guard is what narrows it rather than a `!`.
      if (note) {
        reject.mutate({ id: poem.id, data: { note } });
      }

      return;
    }

    // `{}` is a valid body on an approval and is what an empty note becomes: the
    // API says so in as many words, so a client with nothing to add sends
    // nothing rather than omitting the body.
    approve.mutate({ id: poem.id, data: note ? { note } : {} });
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="narrow:flex-row flex flex-col items-stretch gap-3">
        <Button
          type="button"
          className="compact:px-8 px-5 whitespace-normal"
          disabled={isPending}
          aria-busy={approve.isPending}
          aria-expanded={asking === "APPROVE"}
          onClick={asking === "APPROVE" ? send : open("APPROVE")}
        >
          {approve.isPending
            ? t("decide.approving")
            : asking === "APPROVE"
              ? t("decide.confirmApprove")
              : t("decide.approve")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="compact:px-8 px-5 whitespace-normal"
          disabled={isPending}
          aria-busy={reject.isPending}
          aria-expanded={asking === "REJECT"}
          onClick={asking === "REJECT" ? send : open("REJECT")}
        >
          {reject.isPending
            ? t("decide.rejecting")
            : asking === "REJECT"
              ? t("decide.confirmReject")
              : t("decide.reject")}
        </Button>

        {asking && (
          <Button
            type="button"
            variant="ghost"
            className="compact:px-8 px-5 whitespace-normal"
            disabled={isPending}
            onClick={() => setAsking(null)}
          >
            {t("decide.cancel")}
          </Button>
        )}
      </div>

      {asking && (
        <div className="border-primary/15 flex flex-col gap-2 border-l-2 pl-5">
          <Label htmlFor="note" className="flex flex-wrap items-baseline gap-2">
            {t("decide.note")}

            {/* The rule said before it is broken rather than after. Which of the
                two shows follows from the schema that is currently resolving the
                field, so the label and the validation cannot disagree. */}
            <span className="tracking-normal normal-case italic opacity-70">
              {t(asking === "REJECT" ? "decide.required" : "decide.optional")}
            </span>
          </Label>

          <Textarea
            id="note"
            // Autofocused because the click that opened this panel was a request
            // to write in it.
            autoFocus
            maxLength={REVIEW_NOTE_MAX}
            placeholder={t("decide.notePlaceholder")}
            className="compact:min-h-[10rem] min-h-[8rem]"
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? "note-error" : undefined}
            {...field("note", {
              /**
               * An empty textarea holds `""`, and `""` is not what either schema
               * means by "no note" — `reviewNoteSchema` refuses it outright,
               * because a note that is empty is not a note.
               *
               * react-hook-form applies this before the resolver runs, so a
               * blank field arrives as an *absence*: `approvePoemSchema` accepts
               * it and `rejectPoemSchema` refuses it, which is the whole
               * required-vs-optional rule arriving from the contract instead of
               * from a check written here.
               */
              setValueAs: (value: string) => (value.trim() ? value : undefined),
            })}
          />

          {errors.note && (
            <p id="note-error" className="font-caps text-micro tracking-label text-ember uppercase">
              {t("decide.error.note")}
            </p>
          )}
        </div>
      )}

      {failure && (
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground flex flex-col items-start gap-3 border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`decide.error.${failure}`)}

          {/* Only on the one failure that trying again can never fix. */}
          {failure === "decided" && (
            <Link
              href="/admin/queue"
              className="font-caps text-primary hover:text-primary-bright focus-visible:outline-ring text-micro tracking-label uppercase not-italic transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t("back")}
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
