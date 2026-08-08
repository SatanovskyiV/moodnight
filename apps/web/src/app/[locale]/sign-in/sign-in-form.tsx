"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@moodnight/shared";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useLogin } from "@/lib/api/generated/auth";

/**
 * Why the whole submission failed, as opposed to why one field is not valid.
 *
 * A discriminant rather than a rendered string, so the message stays a
 * catalogue lookup at render time and the set of things that can go wrong is a
 * closed union `tsc` can check the mapping against.
 */
type Failure = "credentials" | "network" | "unexpected";

/**
 * The credentials form.
 *
 * This is the client boundary the rest of the screen deliberately stays outside
 * of: the card, the seal and the headings are rendered on the server by
 * ./page.tsx, and only the part that has to hold state and call `fetch` ships as
 * JavaScript.
 *
 * It resolves against `loginSchema` from @moodnight/shared — **the same schema
 * the API's `ZodValidationPipe` enforces on the body it receives.** That is the
 * one-schema-two-sides promise in docs/ROADMAP.md Phase 3, and its practical
 * effect is that the 400 branch below is nearly unreachable: a body this form
 * agreed to send is a body the server has already agreed to parse.
 */
export function SignInForm() {
  const t = useTranslations("signIn");
  const router = useRouter();
  const { signIn } = useSession();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // The generated hook, with the error type it is actually called with: orval
  // types `TError` from the statuses the document lists, which is `void` here,
  // because it cannot know what the mutator throws. `request` throws exactly one
  // thing, and saying so is what makes `error` below readable rather than a
  // value that has to be re-narrowed from `unknown`.
  const {
    mutate: submit,
    isPending,
    error,
  } = useLogin<ApiRequestError>({
    mutation: {
      onSuccess: (response) => {
        // Before navigating, so the bar is already showing "sign out" by the
        // time the home page paints rather than correcting itself a frame later.
        signIn(payload(response));

        // `replace`, not `push`: pressing Back from the page you just signed in
        // to should not return you to a form you no longer need. There is
        // deliberately no `router.refresh()` alongside it — every page here is
        // static and no Server Component can see the session anyway, so
        // re-fetching the tree would cost a request and change nothing on screen.
        router.replace("/");
      },
    },
  });

  const onSubmit = handleSubmit((input) => submit({ data: input }));

  // 401 is the endpoint's single answer to every bad credential — unknown
  // address, wrong password, an account that has no password set. It is
  // deliberately not distinguishable, so this cannot be used to find out who has
  // an account, and the message shown says only what the reader is entitled to
  // know.
  //
  // Derived from the mutation rather than held in state beside it, which is what
  // retires the `setFailure(null)` that used to open every submission: a
  // mutation that is running has no error, so the notice clears itself.
  const failure: Failure | null = !error
    ? null
    : error.isUnreachable
      ? "network"
      : error.status === 401
        ? "credentials"
        : "unexpected";

  return (
    <form
      // The browser's own validation would otherwise pre-empt these messages
      // with a bubble in its UI language, which on a Ukrainian page is whatever
      // the reader's Chrome was built with. zod decides what is valid here.
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4 text-left"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          // The first field of a page whose only purpose is this form.
          autoFocus
          placeholder={t("emailPlaceholder")}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {/* One message per field rather than the schema's own text, and the
            reason is i18n: zod messages set on a schema (`"Enter your
            password."`) outrank any error map, so the strings in
            @moodnight/shared are English by construction. Each field here has
            exactly one way to be wrong — an address that is not one, a password
            not given — so the field, not the issue code, is enough to say which
            message applies. The schema still decides *whether* it is wrong. */}
        {errors.email && <FieldError id="email-error">{t("error.email")}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password && <FieldError id="password-error">{t("error.password")}</FieldError>}
      </div>

      {/* `role="alert"` because this appears after the reader has left the form
          and pressed a button: it has to be announced, not merely present. It
          sits above the button rather than below it so it is not the thing that
          gets scrolled off a short screen. */}
      {failure && (
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`error.${failure}`)}
        </p>
      )}

      {/* The button is already full width — it is the stretched item of a
          `flex-col` — so what overflows on a phone is the label inside it:
          `Button` sets `whitespace-nowrap`, and "Запалити свою свічу" at 0.25em
          of tracking is wider than a 360px screen has left after the card. It
          is allowed to take two lines here, and gives back the padding it no
          longer needs now that nothing is centring against it. */}
      <Button
        type="submit"
        className="compact:px-8 mt-[0.8rem] px-4 whitespace-normal"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

/**
 * A field's rejection notice, in the same small caps as its label so the two
 * read as one unit.
 *
 * Ember rather than `destructive`: that token is `--blood` (#5a1a1a), which
 * works as the border and wash on the alert above but is barely two lightness
 * steps off the page as *text* and would fail contrast outright. Ember is the
 * palette's other warning colour and is legible on ink.
 */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="font-caps text-micro tracking-label text-ember uppercase">
      {children}
    </p>
  );
}
