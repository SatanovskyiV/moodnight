import { redirect } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

/**
 * The same arrangement as the studio's front door, for the same reason: the
 * names are the only section written, so `/admin` is that section.
 *
 * The redirect is unconditional and happens on the server, which is not a hole —
 * a reader who may not be here meets `RequireRole` at `/admin/users` instead of
 * at `/admin`, and the request behind that page meets `RolesGuard`. Nothing on
 * either address is decided by who asked for it (docs/ROADMAP.md, "Gating in the
 * browser is chrome, not security").
 */
export default async function AdminPage(props: LocaleParams) {
  const locale = await resolveLocale(props);

  redirect({ href: "/admin/users", locale });
}
