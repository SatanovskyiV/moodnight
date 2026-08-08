"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@moodnight/shared";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useRegister } from "@/lib/api/generated/auth";

/**
 * Why the whole submission failed, as opposed to why one field is not valid.
 *
 * `taken` is the one case this form has that signing in does not, and it is not
 * a leak: an endpoint that creates accounts has to say when it cannot, and
 * "that address is already registered" is the only truthful answer to a second
 * attempt at the same one. It is exactly what `/auth/login`'s uniform 401
 * refuses to reveal — the difference being that here the reader is the person
 * proposing the address, and the alternative is an account that silently is not
 * created.
 */
type Failure = "taken" | "network" | "unexpected";

/**
 * The registration form.
 *
 * The same shape as `SignInForm`, and deliberately so: the client boundary
 * starts here rather than at the page, it resolves the very schema the API's
 * `ZodValidationPipe` enforces on the body (`registerSchema` from
 * @moodnight/shared), and a successful response is put straight into the
 * session cache so registering signs you in — which is what the endpoint
 * already does by handing back a session rather than a bare user.
 *
 * There is no `role` field and no way to add one: `registerSchema` is `.strict()`
 * and does not carry the key, so a body with one in it is a 400 rather than a
 * self-appointed admin. See the note on that schema.
 */
export function RegisterForm() {
  const t = useTranslations("register");
  const router = useRouter();
  const { signIn } = useSession();

  // `register` renamed, and only in this file: it would otherwise sit beside
  // `registerSchema` and `useRegister` and read as the API call rather than as
  // react-hook-form binding a field.
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", surname: "", email: "", password: "" },
  });

  // `useRegister<ApiRequestError>` for the same reason the sign-in form does it:
  // orval types `TError` from the statuses the document lists, which is `void`,
  // because it cannot know what the mutator throws. `request` throws exactly
  // one thing.
  const {
    mutate: submit,
    isPending,
    error,
  } = useRegister<ApiRequestError>({
    mutation: {
      onSuccess: (response) => {
        signIn(payload(response));
        router.replace("/");
      },
    },
  });

  const onSubmit = handleSubmit((input) => submit({ data: input }));

  // 409 is the endpoint's answer to an address that already has an account. A
  // 400 falls through to `unexpected` on purpose: this form resolved the same
  // schema the API validates against, so a body it agreed to send is one the
  // server has already agreed to parse — a 400 arriving here means the two
  // copies of the schema have drifted, which is a bug and not something to word
  // a message for.
  const failure: Failure | null = !error
    ? null
    : error.isUnreachable
      ? "network"
      : error.status === 409
        ? "taken"
        : "unexpected";

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 text-left">
      {/* The prototype asked for one "poetic name" (app.jsx:243); the account
          behind it has a `name` and a `surname`, both required, so the single
          field becomes two rather than one field guessing where to split.

          Each `maxLength` is its schema's own maximum, which is what keeps one
          message per field honest: the upper bound cannot be reached by typing
          or pasting, so the only way any of these can be wrong is by being
          empty — or, for the password, short. zod still enforces both bounds;
          this only spares the reader a rejection they cannot see coming. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          autoComplete="given-name"
          maxLength={100}
          // The first field of a page whose only purpose is this form.
          autoFocus
          placeholder={t("namePlaceholder")}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...field("name")}
        />
        {errors.name && <FieldError id="name-error">{t("error.name")}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="surname">{t("surname")}</Label>
        <Input
          id="surname"
          autoComplete="family-name"
          maxLength={100}
          placeholder={t("surnamePlaceholder")}
          aria-invalid={errors.surname ? true : undefined}
          aria-describedby={errors.surname ? "surname-error" : undefined}
          {...field("surname")}
        />
        {errors.surname && <FieldError id="surname-error">{t("error.surname")}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...field("email")}
        />
        {errors.email && <FieldError id="email-error">{t("error.email")}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          // `new-password`, not `current-password`: this is what tells a password
          // manager to offer to generate one and to save what is typed as a new
          // credential rather than autofilling an old one.
          autoComplete="new-password"
          maxLength={128}
          placeholder="••••••••"
          aria-invalid={errors.password ? true : undefined}
          // The hint stays described even while the error is showing — they say
          // different things, and dropping it would leave a reader who is
          // fixing the field without the rule they are fixing it against.
          aria-describedby={errors.password ? "password-error password-hint" : "password-hint"}
          {...field("password")}
        />
        {/* A rule the reader is entitled to know before being refused for
            breaking it — the sign-in form has no equivalent because there is
            nothing there to get right in advance. */}
        <p id="password-hint" className="text-parchment-faint text-[0.95rem] italic">
          {t("passwordHint")}
        </p>
        {errors.password && <FieldError id="password-error">{t("error.password")}</FieldError>}
      </div>

      {failure && (
        <p
          role="alert"
          className="border-destructive/60 bg-destructive/10 text-foreground border-l-2 px-4 py-3 text-[0.95rem] italic"
        >
          {t(`error.${failure}`)}
        </p>
      )}

      {/* Wraps rather than overflows on a narrow card — see the note on the
          sign-in form's button, which this is the twin of. */}
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
 * A field's rejection notice — the same ember small caps as the sign-in form's,
 * for the reason given there: `destructive` is `--blood`, which works as a
 * border and a wash but fails contrast as text on ink.
 */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="font-caps text-micro tracking-label text-ember uppercase">
      {children}
    </p>
  );
}
