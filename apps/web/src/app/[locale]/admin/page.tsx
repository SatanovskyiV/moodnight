import { redirect } from "@/i18n/navigation";
import { resolveLocale, type LocaleParams } from "@/i18n/resolve-locale";

/**
 * The same arrangement as the studio's front door, and now with two sections to
 * choose between: the queue, because it is the gentlest floor the area keeps.
 *
 * That is the same rule `areaFloor` follows and it is the only one that works
 * here. The redirect cannot ask who is arriving — it runs on the server, and the
 * refresh cookie is pathed `/api/auth` — so it has to send everybody to the same
 * place, and the only place that suits everybody who is let this far is the
 * section with the lowest floor. Sending them to the names instead would put
 * every editor on «Не твій поріг» as the first thing the administration ever
 * showed them. An admin outranks an editor and sees the queue too, with the
 * names one row away in the rail.
 *
 * Unconditional, which is not a hole: a reader who may not be here meets
 * `RequireRole` at `/admin/queue` instead of at `/admin`, and the request behind
 * that page meets `RolesGuard`. Nothing on either address is decided by who
 * asked for it (docs/ROADMAP.md, "Gating in the browser is chrome, not
 * security").
 */
export default async function AdminPage(props: LocaleParams) {
  const locale = await resolveLocale(props);

  redirect({ href: "/admin/queue", locale });
}
