"use client";

import type { ListDefinition } from "@moodnight/shared";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";

import { readList, writeList, type ListPatch, type ListValues } from "./wire";

export type { ListPatch, ListValues } from "./wire";

/**
 * A list's controls, kept in the address bar.
 *
 * The reading and writing are in ./wire.ts, which is pure and knows nothing
 * about React; this is the part that binds them to the router. Why the URL and
 * not `useState`: the endpoint was written for it. "Every parameter is optional
 * and an empty one is read as absent, so a table can keep its controls in the
 * URL and clear them without pruning the query string" is in the shared schema,
 * in the OpenAPI description, and in the README. Local state would decline a
 * feature built on purpose, restate the defaults in a second place, and make
 * "editors, sorted by name" a thing you cannot send anybody.
 */
export interface ListQuery<Definition extends ListDefinition> {
  /**
   * Ready to hand straight to a generated `useListXxx` hook, with no cast at the
   * call site — and that is a check, not a convenience. If someone adds a
   * sortable field in packages/shared and forgets `pnpm api:generate`, the
   * parsed type stops being assignable to orval's params and `pnpm typecheck`
   * says so.
   */
  params: ListValues<Definition>;
  /** What the definition answers with when nothing is asked of it. */
  defaults: ListValues<Definition>;
  /** Whether any control differs from those defaults. The URL is bare when false. */
  narrowed: boolean;
  set: (patch: ListPatch<Definition>, history?: "push" | "replace") => void;
  filter: (field: Definition["filterable"][number]) => readonly string[];
  setFilter: (field: Definition["filterable"][number], values: readonly string[]) => void;
  clear: () => void;
}

export function useListQuery<Definition extends ListDefinition>(
  definition: Definition,
): ListQuery<Definition> {
  // `next/navigation`'s, because next-intl has no equivalent and search params
  // carry no locale. The other two are next-intl's: `usePathname` gives the path
  // with the prefix stripped and `router` puts it back, which is what lets this
  // build an href without knowing what language it is in.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const defaults = useMemo(
    () => definition.query.parse({}) as ListValues<Definition>,
    [definition],
  );

  const params = useMemo(
    () => readList(definition, new URLSearchParams(searchParams)),
    [definition, searchParams],
  );

  const set = useCallback(
    (patch: ListPatch<Definition>, history: "push" | "replace" = "push") => {
      // Any control other than the page implies the first page — a guarantee of
      // the framework rather than a discipline at every call site, because
      // forgetting it means narrowing a 7-page result while on page 6 and being
      // shown nothing at all.
      const resets = Object.keys(patch).some((key) => key !== "page");

      // Widened to reach the framework's own five by name. `ListValues` is
      // precise at the call site — that is the point of it — but inside this
      // generic all TypeScript knows is `Definition extends ListDefinition`,
      // whose `query` is a bare `z.ZodType`, so `page` is not visible from here.
      const current = params as Record<string, unknown>;
      const fallback = defaults as Record<string, unknown>;

      const next = {
        ...current,
        ...patch,
        ...(resets && !("page" in patch) ? { page: fallback.page } : null),
      } as ListValues<Definition>;

      const search = writeList(definition, next, defaults);
      const href = search ? `${pathname}?${search}` : pathname;

      // `scroll: false` throughout: a sort or a keystroke must not throw the
      // reader back to the top of the page.
      if (history === "push") {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [definition, params, defaults, pathname, router],
  );

  const filter = useCallback(
    (field: Definition["filterable"][number]) => {
      const value = (params as Record<string, unknown>)[field];

      return Array.isArray(value) ? (value as string[]) : [];
    },
    [params],
  );

  const setFilter = useCallback(
    (field: Definition["filterable"][number], values: readonly string[]) => {
      // The one widening in this module, and it cannot produce a bad request:
      // what is written here goes into the URL and comes back through the
      // definition's own schema on the very next render, so a value the contract
      // does not accept is dropped before `params` is built from it. The same
      // shape of argument `defineList` itself makes for its `FilterFields` cast.
      set({ [field]: values.length > 0 ? [...values] : undefined } as ListPatch<Definition>);
    },
    [set],
  );

  const clear = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  const narrowed = useMemo(
    () => writeList(definition, params, defaults) !== "",
    [definition, params, defaults],
  );

  return { params, defaults, narrowed, set, filter, setFilter, clear };
}
