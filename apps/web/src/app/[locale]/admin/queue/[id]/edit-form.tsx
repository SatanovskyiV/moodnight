"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  POEM_BODY_MAX,
  updatePoemSchema,
  type StudioPoem,
  type UpdatePoemInput,
} from "@moodnight/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm, useWatch, type Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiRequestError } from "@/lib/api/error";
import { getGetStudioPoemQueryKey, useUpdatePoem } from "@/lib/api/generated/poems";

import { QUEUE_QUERY_KEY } from "../queue-key";

/**
 * Why the save failed, as opposed to why one field is not valid — the same split
 * app/[locale]/studio/poems/new/compose-form.tsx makes, with the statuses
 * `PATCH /poems/{id}` documents.
 *
 * `raced` is the 409 and means something specific here that it does not mean on
 * the compose form: `@@unique([poemId, version])` on `PoemRevision` turns two
 * editors saving the same poem at once into a conflict rather than letting one
 * silently overwrite the other (apps/api/src/poems/poem-writes.service.ts). So
 * the message says somebody else was in the poem, and trying again genuinely
 * works — after reading what they wrote.
 *
 * `gone` is the 404: the poem's author deleted it while it sat here.
 *
 * 400 and 403 fall through to `unexpected`. This form resolves the schema the
 * API's `ZodValidationPipe` enforces and never sends `tags`, `status` or
 * `featured`, and the shell above has already refused anybody below an editor —
 * so either arriving means the two copies of the contract have drifted, which is
 * a bug and not something to word a message for.
 */
type Failure = "signedOut" | "gone" | "raced" | "network" | "unexpected";

/**
 * Fixing a line in somebody else's poem, which is a thing an editor has always
 * been allowed to do — `assertMayReach` passes for any moderator — and which
 * until now had no screen.
 *
 * The fields are app/[locale]/studio/poems/new/compose-form.tsx's, deliberately
 * and down to the hint under the body: an editor changing a line and an author
 * writing one are doing the same thing to the same three columns, and a second
 * arrangement of them would only be a second thing to keep in step.
 *
 * No `tags` field, and the omission is the API's rather than an oversight, for
 * the reason the compose form gives: `updatePoemSchema.tags` takes slugs of
 * themes that *already exist* and 400s on an unknown one, and there is no
 * endpoint yet that says which those are.
 *
 * No `status` and no `featured` either, and those are a different omission —
 * both are writable here and both belong to a decision rather than to the text.
 * Publishing is `POST /poems/{id}/approve` next door, which writes the `Review`
 * row that a bare `status: PUBLISHED` would not.
 */
export function EditForm({ poem, onDone }: { poem: StudioPoem; onDone: () => void }) {
  const t = useTranslations("admin.sections.queue.review");
  const queryClient = useQueryClient();

  // `register` renamed as the compose form renames it: beside `updatePoemSchema`
  // and `useUpdatePoem` it would read as the API call rather than as
  // react-hook-form binding a field.
  const {
    register: field,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UpdatePoemInput>({
    resolver: zodResolver(updatePoemSchema),
    // The poem as it stands, which is what makes this an edit and not a rewrite.
    // A null subtitle becomes `""` because that is what an empty `<Input>` holds;
    // the submit handler turns it back into an absence.
    defaultValues: { title: poem.title, subtitle: poem.subtitle ?? "", body: poem.body },
  });

  const {
    mutate: save,
    isPending,
    error,
  } = useUpdatePoem<ApiRequestError>({
    mutation: {
      /**
       * The first `invalidateQueries` in this repo, and both keys earn their
       * place.
       *
       * The poem itself is awaited, so the mutation stays pending until the
       * fresh row is in the cache and the read view behind this form never
       * paints the old text for a frame. The queue is not awaited — nothing on
       * screen is about to show it, and the row's title and teaser have moved,
       * so it only has to be stale by the time somebody goes back.
       *
       * `QUEUE_QUERY_KEY` is the bare prefix of `getListPoemQueueQueryKey`,
       * which matches every page, sort and search of the queue at once — see
       * ./queue-key.ts.
       *
       * Invalidating rather than writing the response straight into the cache,
       * even though `PATCH` answers with the whole updated poem: the two
       * endpoints' generated response unions differ in their error members, so
       * handing one to the other's cache would need a cast asserting something
       * the types do not say. One extra GET on an edit an editor makes rarely is
       * the cheaper side of that trade.
       */
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetStudioPoemQueryKey(poem.id) });
        queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });

        onDone();
      },
    },
  });

  const failure: Failure | null = !error
    ? null
    : error.isUnreachable
      ? "network"
      : error.status === 401
        ? "signedOut"
        : error.status === 404
          ? "gone"
          : error.status === 409
            ? "raced"
            : "unexpected";

  /**
   * All three fields on every save, unchanged ones included.
   *
   * `poem-writes.service.ts` appends a `PoemRevision` only when title, subtitle
   * or body has actually moved, so a field sent back identical costs nothing —
   * no version, no trail row, and `updatedAt` is the only thing that stirs.
   * Diffing against the poem here would be a second copy of that rule, kept in
   * step by hand.
   *
   * A blank subtitle becomes `null` and not `""`, and the `trim` only *decides*
   * that — it does not clean what is sent. Nothing on this site normalises what
   * somebody typed, and a poetry site should be the last place to start.
   */
  const submit = handleSubmit((input) =>
    save({
      id: poem.id,
      data: {
        title: input.title,
        subtitle: input.subtitle?.trim() ? input.subtitle : null,
        body: input.body,
      },
    }),
  );

  return (
    // `noValidate` for the reason the auth forms give: a browser's own bubbles
    // arrive in the browser's language, not the reader's.
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t("edit.poemTitle")}</Label>
        <Input
          id="title"
          maxLength={200}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          {...field("title")}
        />
        {errors.title && <FieldError id="title-error">{t("edit.error.title")}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="subtitle" className="flex flex-wrap items-baseline gap-2">
          {t("edit.subtitle")}
          <span className="tracking-normal normal-case italic opacity-70">
            {t("edit.subtitleOptional")}
          </span>
        </Label>
        <Input id="subtitle" maxLength={200} {...field("subtitle")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="body">{t("edit.body")}</Label>
        <Textarea
          id="body"
          maxLength={POEM_BODY_MAX}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? "body-error body-hint" : "body-hint"}
          {...field("body")}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          {/* The same promise the compose form makes, and it matters more here
              than there: an editor reflowing somebody else's stanza is the one
              edit this site must not make on their behalf. */}
          <p id="body-hint" className="text-parchment-faint text-[0.95rem] italic">
            {t("edit.bodyHint")}
          </p>

          <BodyCount control={control} />
        </div>

        {errors.body && <FieldError id="body-error">{t("edit.error.body")}</FieldError>}
      </div>

      {failure && (
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`edit.error.${failure}`)}
        </p>
      )}

      <div className="narrow:flex-row mt-2 flex flex-col items-stretch gap-3">
        <Button
          type="submit"
          className="compact:px-8 px-5 whitespace-normal"
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? t("edit.saving") : t("edit.save")}
        </Button>

        {/* Discards, and nothing is autosaved — which is why it is the quiet
            button and the save is the gold one. */}
        <Button
          type="button"
          variant="ghost"
          className="compact:px-8 px-5 whitespace-normal"
          disabled={isPending}
          onClick={onDone}
        >
          {t("edit.cancel")}
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
 */
function BodyCount({ control }: { control: Control<UpdatePoemInput> }) {
  const t = useTranslations("admin.sections.queue.review");
  const body = useWatch({ control, name: "body" });

  return (
    <p className="font-caps text-parchment-faint text-micro tracking-label ml-auto uppercase tabular-nums">
      {t("edit.count", { count: body?.length ?? 0, max: POEM_BODY_MAX })}
    </p>
  );
}

/**
 * A field's rejection notice — the same ember small caps the rest of the site
 * uses, for the reason given there: `destructive` is `--blood`, which works as a
 * border and a wash and fails contrast outright as text on ink.
 */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="font-caps text-micro tracking-label text-ember uppercase">
      {children}
    </p>
  );
}
