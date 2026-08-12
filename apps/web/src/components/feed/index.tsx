"use client";

import { useTranslations } from "next-intl";

import { Divider } from "@/components/editorial/divider";
import { FlourishLeft, FlourishRight } from "@/components/editorial/ornaments";
import { Panel } from "@/components/editorial/panel";
import { PoemCard } from "@/components/editorial/poem-card";
import { Restoring } from "@/components/session/gate";
import { Button } from "@/components/ui/button";
import type { ApiRequestError } from "@/lib/api/error";
import type { ListPoemsParams } from "@/lib/api/generated/model";

import { FeedCardSkeleton } from "./card-skeleton";
import { FeedSentinel } from "./sentinel";
import { poemsOf, totalOf, useFeed } from "./use-feed";

/**
 * The feed — the site's front page, and the same page for everybody.
 *
 * A visitor and a signed-in member see identical markup here on purpose. There
 * is nothing on a published poem that depends on who is reading it: no private
 * fields, no per-reader state, and — until Phase 5 gives reactions a table —
 * nothing to record either. The only part of the home page that knows the reader
 * is the greeting above it, which is a different component for exactly that
 * reason. Keeping the split there means this one never has to branch on a
 * session, and the poems never wait on `/auth/refresh` to appear.
 *
 * The four states are the ones components/list/view.tsx already settled for
 * lists, in the same order and for the same reasons — a first load, a failure, a
 * genuinely empty archive, and rows. What differs is only how more rows arrive:
 * a table turns a page, a feed keeps going.
 */
export function Feed({ params }: { params?: Omit<ListPoemsParams, "page" | "perPage"> }) {
  const t = useTranslations("feed");

  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useFeed(params);

  const poems = poemsOf(data);
  const total = totalOf(data);

  return (
    <section id="feed" aria-labelledby="feed-heading" className="flex flex-col gap-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <p className="font-caps text-primary text-label tracking-eyebrow flex items-center gap-4 uppercase">
          <FlourishLeft className="text-primary-deep narrow:block hidden w-12" />
          {/* The eyebrow's 0.4em of tracking is also 0.4em of empty space after
              its last letter, which would push it off-centre between the two
              flourishes. Pulling the gap back by exactly that much squares it —
              the same correction app/[locale]/welcome.tsx makes. */}
          <span className="-mr-[0.4em]">{t("eyebrow")}</span>
          <FlourishRight className="text-primary-deep narrow:block hidden w-12" />
        </p>

        {/* `h2`, not `h1`: the page's own heading is the masthead above this —
            the wordmark for a stranger, the member's name for somebody the night
            recognised. The outline that gives a screen reader is masthead, then
            this section, then one poem per card. */}
        <h2
          id="feed-heading"
          className="font-display text-foreground tracking-display text-shadow-glow-soft text-[clamp(1.5rem,5.5vw,2.4rem)] leading-tight uppercase"
        >
          {t("title")}
        </h2>

        <p className="text-muted-foreground max-w-[35rem] text-lg text-balance italic">
          {t("line")}
        </p>
      </header>

      <Divider />

      {/* A failure only takes the page when there is no page yet. Once poems are
          on screen the same error is a *tail* failure — page four did not come —
          and replacing forty cards with an apology loses the reader's place over
          something that has not stopped them reading. So the panel is for a feed
          that never started; everything already fetched stays, and the retry
          moves down to the end where the missing page was. */}
      {error && poems.length === 0 ? (
        <Panel
          title={t("errorTitle")}
          line={t(`error.${failureOf(error)}`)}
          action={
            <Button variant="ghost" className="compact:px-8 px-5" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          }
        />
      ) : isPending ? (
        // Three and not twelve: the point is to show where the cards will be,
        // and a reader who has to scroll past a screenful of grey to find that
        // out has been shown the wait instead.
        <div className="flex flex-col gap-16">
          <FeedCardSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </div>
      ) : total === 0 ? (
        <Panel title={t("empty")} line={t("emptyLine")} />
      ) : (
        <>
          {/* 4rem between cards, from prototype/styles.css:493-497. Wide on
              purpose: each card is a separate poem and the gap is what stops two
              of them reading as one long one. */}
          <div className="flex flex-col gap-16">
            {poems.map((poem) => (
              <PoemCard key={poem.id} poem={poem} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-6">
            {/* `!error` matters as much as the other two. An observer that goes
                on watching after a page failed would ask for it again the instant
                react-query stopped fetching, and again, and again — the reader
                sitting still at the bottom of the feed while it hammers an API
                that is already down. A failure hands the next page back to them
                as a button. */}
            <FeedSentinel
              onReach={fetchNextPage}
              enabled={hasNextPage && !isFetchingNextPage && !error}
            />

            {isFetchingNextPage ? (
              <Restoring className="flex" label={t("loading")} />
            ) : error ? (
              <>
                {/* `--destructive` is `--blood`, which works as a border and a
                    wash and fails contrast outright as text — the same note
                    app/[locale]/sign-in/sign-in-form.tsx makes, and the reason
                    the copy here is `text-foreground`. */}
                <p
                  role="alert"
                  className="border-destructive/60 bg-destructive/10 text-foreground w-full max-w-[35rem] border-l-2 px-4 py-3 text-[0.95rem] italic"
                >
                  {t(`error.${failureOf(error)}`)}
                </p>

                <Button variant="ghost" onClick={() => void fetchNextPage()}>
                  {t("retry")}
                </Button>
              </>
            ) : hasNextPage ? (
              <Button variant="ghost" onClick={() => void fetchNextPage()}>
                {t("more")}
              </Button>
            ) : (
              // The end of the archive, marked rather than merely reached: a
              // feed that simply stops is indistinguishable from one that broke.
              <>
                <Divider />
                <p className="font-caps text-parchment-faint text-caption tracking-label uppercase">
                  {t("end")}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Why a page of poems did not arrive.
 *
 * Three cases where components/list/view.tsx has five, and the two that are gone
 * say something about this endpoint: `GET /poems` carries no guard at all (see
 * apps/api/src/poems/poems.controller.ts, where the public reads are a separate
 * class from the writes precisely so that stays true), so it cannot answer 401
 * or 403 and there is no expired session or wrong key to report. Naming only the
 * failures that can happen is what keeps the catalogue honest.
 */
function failureOf(error: ApiRequestError): "network" | "rejected" | "unexpected" {
  if (error.isUnreachable) {
    return "network";
  }

  // Should be unreachable: the only parameters this sends are a page number and
  // a page size the endpoint's own schema supplies the bounds for. Worth a
  // sentence rather than a blank, because "should be" is not "is" — the same
  // promise the list framework makes about its own 400.
  return error.status === 400 ? "rejected" : "unexpected";
}
