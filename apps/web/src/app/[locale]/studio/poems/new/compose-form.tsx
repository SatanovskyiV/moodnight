"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPoemSchema,
  POEM_BODY_MAX,
  type CreatePoemInput,
  type WritablePoemStatus,
} from "@moodnight/shared";
import { useTranslations } from "next-intl";
import { useForm, useWatch, type Control } from "react-hook-form";

import { Panel } from "@/components/editorial/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useCreatePoem } from "@/lib/api/generated/poems";

/**
 * The two things an author may do with a finished poem, which is the whole
 * reason this form has two buttons rather than a status `select`.
 *
 * PUBLISHED is excluded in the type and not merely left unsent: `assertMaySetStatus`
 * in the API refuses it from anyone below EDITOR, so a control offering it here
 * would be a control that 403s for every reader who can see it. Putting the
 * poem on the front page is the queue's decision, and Phase 4's own endpoint.
 */
type Intent = Exclude<WritablePoemStatus, "PUBLISHED">;

/**
 * Why the whole submission failed, as opposed to why one field is not valid —
 * the same split the auth forms make, with the statuses this endpoint documents.
 *
 * `signedOut` is the case the auth forms have no equivalent of, and it is a real
 * one here rather than defensive padding: the access token lives in memory with a
 * short life (see components/session), and writing a poem is the one thing on
 * this site that plausibly takes longer than one. So the message says the writing
 * is still on screen, because it is — nothing below clears the form on a failure.
 *
 * `raced` is the 409, which the API documents as two requests reaching for the
 * same slug with nothing created. It is the one failure worth answering with
 * "try again", because trying again genuinely works.
 *
 * 400 and 403 deliberately fall through to `unexpected`. This form resolves the
 * schema the API's `ZodValidationPipe` enforces, and it never sends `tags` or
 * `status: PUBLISHED` — so either of those arriving means the two copies of the
 * contract have drifted, which is a bug and not something to word a message for.
 */
type Failure = "signedOut" | "raced" | "network" | "unexpected";

/**
 * Writing a poem.
 *
 * The client boundary starts here rather than at the page, which is the
 * arrangement every form on the site uses: the heading, the shell and the message
 * lookups behind them stay on the server, and this bundle carries the fields.
 *
 * There is no gate in this file and none in the page above it. `minimumRole` in
 * components/area/links.ts matches the longest `href` prefix, so `/studio/poems/new`
 * inherits `/studio/poems`' `AUTHOR` floor and `AreaShell` has already put a
 * `RequireRole` around this — one declaration for a section and everything nested
 * under it. What the browser shows is chrome either way; `RolesGuard` on
 * `PoemWritesController` is what decides.
 *
 * No `tags` field, and the omission is the API's rather than an oversight:
 * `createPoemSchema.tags` takes slugs of themes that *already exist* and 400s on
 * an unknown one, and there is no endpoint yet that says which those are. Filing
 * by theme arrives with the endpoint to learn them from.
 */
export function ComposeForm() {
  const t = useTranslations("studio.sections.poems.compose");

  // `register` renamed for the reason the registration form renames it: beside
  // `createPoemSchema` and `useCreatePoem` it would read as the API call rather
  // than as react-hook-form binding a field.
  const {
    register: field,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreatePoemInput>({
    resolver: zodResolver(createPoemSchema),
    defaultValues: { title: "", subtitle: "", body: "" },
  });

  // `<ApiRequestError>` because orval types `TError` from the statuses the
  // document lists, which is `void` — it cannot know what the mutator throws,
  // and `request` throws exactly one thing.
  const {
    mutate: submit,
    isPending,
    data,
    variables,
    error,
    reset: forget,
  } = useCreatePoem<ApiRequestError>();

  /**
   * One submit handler per button, rather than one handler reading an "intent"
   * some click handler set.
   *
   * That alternative is a bug waiting to happen: a click on a submit button
   * fires `click` and then `submit` inside a single dispatch, React batches state
   * updates across both, and the submit handler would read the *previous*
   * intent — publishing a draft or drafting a submission, silently and only
   * sometimes. A closure over the argument cannot be stale.
   *
   * A blank subtitle becomes `null` and not `""`: the column is nullable, and a
   * poem with no second line has the absence of one rather than an empty one.
   * The schema is `.strict()` but `subtitle` is `.nullable()`, so `null` is the
   * shape it wants.
   *
   * The `trim` only *decides* that, and deliberately does not clean what is
   * sent. Nothing else on this site normalises what somebody typed — neither
   * these schemas nor `registerSchema` trims a name — and a poetry site should
   * be the last place to start silently editing people's words. So whitespace
   * that is the whole field is nothing, and whitespace around something is
   * theirs. `title` and `body` go through untouched for the same reason.
   */
  const save = (status: Intent) =>
    handleSubmit((input) =>
      submit({
        data: { ...input, subtitle: input.subtitle?.trim() ? input.subtitle : null, status },
      }),
    );

  // Which button is working, taken from the mutation's own `variables` rather
  // than from state of ours. TanStack already holds what is in flight, and a
  // second copy of it is a second thing that can be wrong. Left as the generated
  // status rather than narrowed to `Intent`: the two comparisons below are all
  // this is for, and both are sound without a cast asserting what `save` already
  // guarantees.
  const working = isPending ? variables?.data.status : undefined;

  // The response carries `status` and `title`, so what happened to the poem is
  // read off the row that was written rather than remembered from what was sent.
  const created = data ? payload(data) : null;

  if (created) {
    const kept = created.status === "DRAFT";

    return (
      <Panel
        title={kept ? t("saved.draft") : t("saved.queued")}
        line={t(kept ? "saved.draftLine" : "saved.queuedLine", { title: created.title })}
        action={
          <div className="narrow:flex-row flex flex-col items-stretch gap-3">
            {/* Clearing both is what makes this a blank page again: `reset`
                empties the fields, `forget` drops the mutation's result — and
                without the second one this branch would go on rendering over
                the form it just cleared. */}
            <Button
              className="compact:px-8 px-5 whitespace-normal"
              onClick={() => {
                reset();
                forget();
              }}
            >
              {t("saved.again")}
            </Button>

            <Button asChild variant="ghost" className="compact:px-8 px-5 whitespace-normal">
              <Link href="/studio/poems">{t("saved.back")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const failure: Failure | null = !error
    ? null
    : error.isUnreachable
      ? "network"
      : error.status === 401
        ? "signedOut"
        : error.status === 409
          ? "raced"
          : "unexpected";

  return (
    // `noValidate` for the reason the auth forms give: a browser's own bubbles
    // arrive in the browser's language, not the reader's.
    //
    // The form's own submit — the Enter key in the title field — is the *draft*,
    // deliberately. Enter reaches the first submit button in tree order, which is
    // the draft below; an accidental keystroke should put a poem away, never send
    // an unfinished one to the editors.
    <form noValidate onSubmit={save("DRAFT")} className="flex flex-col gap-6">
      {/* Each `maxLength` is its own schema's maximum, which is what keeps one
          message per field honest — the upper bound cannot be reached by typing
          or pasting, so the only way title or body can be wrong is by being
          empty. zod still enforces both bounds. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t("poemTitle")}</Label>
        <Input
          id="title"
          maxLength={200}
          // The first field of a page whose only purpose is this form.
          autoFocus
          placeholder={t("poemTitlePlaceholder")}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          {...field("title")}
        />
        {errors.title && <FieldError id="title-error">{t("error.title")}</FieldError>}
      </div>

      {/* The only optional field on the site, and it says so on its label rather
          than by leaving the reader to find out by submitting. No error branch
          because there is nothing it can get wrong: absent is valid, and its
          maximum is unreachable. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="subtitle" className="flex flex-wrap items-baseline gap-2">
          {t("subtitle")}
          <span className="tracking-normal normal-case italic opacity-70">
            {t("subtitleOptional")}
          </span>
        </Label>
        <Input
          id="subtitle"
          maxLength={200}
          placeholder={t("subtitlePlaceholder")}
          {...field("subtitle")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="body">{t("body")}</Label>
        <Textarea
          id="body"
          maxLength={POEM_BODY_MAX}
          placeholder={t("bodyPlaceholder")}
          aria-invalid={errors.body ? true : undefined}
          // The hint stays described while the error shows, as the registration
          // form's password hint does: they say different things, and dropping
          // it would leave somebody fixing the field without the rule.
          aria-describedby={errors.body ? "body-error body-hint" : "body-hint"}
          {...field("body")}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          {/* Worth saying out loud, because it is the one promise this editor
              makes that a word processor does not: the API's contract is that
              the line breaks are content (packages/shared/src/poem.ts), and the
              card renders them with `whitespace-pre-line`. */}
          <p id="body-hint" className="text-parchment-faint text-[0.95rem] italic">
            {t("bodyHint")}
          </p>

          <BodyCount control={control} />
        </div>

        {errors.body && <FieldError id="body-error">{t("error.body")}</FieldError>}
      </div>

      {failure && (
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`error.${failure}`)}
        </p>
      )}

      {/* Draft first in the DOM, which is what makes it the Enter key's target;
          the queue is the gold one because it is the act the page is for. Both
          are disabled while either is working — two requests for one poem is
          exactly the race the 409 above reports. */}
      <div className="narrow:flex-row mt-2 flex flex-col items-stretch gap-3">
        <Button
          type="submit"
          variant="ghost"
          className="compact:px-8 px-5 whitespace-normal"
          disabled={isPending}
          aria-busy={working === "DRAFT"}
        >
          {working === "DRAFT" ? t("draftSubmitting") : t("draft")}
        </Button>

        {/* `type="button"` with its own handler rather than a second submit
            button: two submit buttons would both answer the Enter key, and which
            one won would be tree order rather than a decision. */}
        <Button
          type="button"
          className="compact:px-8 px-5 whitespace-normal"
          onClick={save("PENDING_REVIEW")}
          disabled={isPending}
          aria-busy={working === "PENDING_REVIEW"}
        >
          {working === "PENDING_REVIEW" ? t("queueSubmitting") : t("queue")}
        </Button>
      </div>
    </form>
  );
}

/**
 * How much of the body's allowance is spent.
 *
 * Its own component so that a keystroke re-renders this line and not the form:
 * `useWatch` subscribes here, where `watch()` in the parent would subscribe the
 * whole tree of fields to every character typed into a poem.
 *
 * `POEM_BODY_MAX` is exported from @moodnight/shared for exactly this, and the
 * count agrees with the server by construction — `String.length` is what zod's
 * `.max()` measures too. The numbers are formatted by the catalogue's ICU
 * placeholders, so the thousands separator belongs to the locale rather than
 * to this file.
 */
function BodyCount({ control }: { control: Control<CreatePoemInput> }) {
  const t = useTranslations("studio.sections.poems.compose");
  const body = useWatch({ control, name: "body" });

  return (
    <p
      // `tabular-nums` so the line does not twitch sideways as the count climbs.
      className="font-caps text-parchment-faint text-micro tracking-label ml-auto uppercase tabular-nums"
    >
      {t("count", { count: body?.length ?? 0, max: POEM_BODY_MAX })}
    </p>
  );
}

/**
 * A field's rejection notice — the same ember small caps the auth forms use, for
 * the reason given there: `destructive` is `--blood`, which works as a border and
 * a wash and fails contrast outright as text on ink.
 */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="font-caps text-micro tracking-label text-ember uppercase">
      {children}
    </p>
  );
}
