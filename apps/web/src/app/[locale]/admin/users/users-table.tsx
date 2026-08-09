"use client";

import { userList, userRoleSchema, type User } from "@moodnight/shared";
import { keepPreviousData } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import { listColumnHelper, type ListColumns } from "@/components/list/columns";
import { useListQuery } from "@/components/list/query";
import { ListView } from "@/components/list/view";
import { payload, type ApiRequestError } from "@/lib/api/error";
import { useListUsers, type listUsersResponse } from "@/lib/api/generated/users";
import type { ListUsersParams } from "@/lib/api/generated/model";

/**
 * The administration's list of accounts, and the first thing on this site to
 * read a paged endpoint.
 *
 * Everything generic is in components/list — the URL is the state, the contract
 * decides what may be sorted and filtered, and the table, toolbar and pager are
 * the same ones the moderation queue will use. What is left here is what is
 * genuinely about *users*: five columns, one filter, and the words.
 *
 * A client component by necessity rather than preference, and the reason is in
 * docs/ROADMAP.md: "a gated page is built at deploy time for everybody and its
 * payload is fetchable by anybody, so data must always arrive over an
 * authenticated call and never be baked into a page." The refresh cookie is
 * pathed `/api/auth`, so no Server Component here could fetch this even if the
 * cost model allowed it.
 */
export function UsersTable() {
  const t = useTranslations("admin.sections.users");
  // The site's own names for the four roles, and the same namespace the rail,
  // the user menu and the home page's greeting read. There is deliberately no
  // second list of role labels anywhere.
  const role = useTranslations("roles");
  const format = useFormatter();

  const query = useListQuery(userList);

  const { data, error, isPending, isFetching, refetch } = useListUsers<
    listUsersResponse,
    // orval types `TError` from the statuses the document lists, which is `void`
    // — it cannot know what the mutator throws. `request` throws exactly one
    // thing, and saying so is what makes `error` below readable. The same note
    // sign-in-form.tsx makes about `useLogin`, one type position over because a
    // query's `TData` comes first.
    ApiRequestError
  >(
    // No cast, and that is the check: if a sortable property is added in
    // packages/shared and `pnpm api:generate` is not run, these two types stop
    // agreeing and `pnpm typecheck` says so.
    query.params satisfies ListUsersParams,
    {
      // What stops the table collapsing to its header and back on every page
      // turn: the rows on screen stay mounted until the next page resolves, and
      // `isPending` narrows to meaning the genuine first load.
      query: { placeholderData: keepPreviousData },
    },
  );

  const columns = useMemo<ListColumns<User>>(() => {
    const column = listColumnHelper<User>();

    return column.columns([
      column.accessor("name", {
        header: t("columns.name"),
        // The email column is gone below `compact:`, so the cell that names the
        // row carries it there instead. One markup tree, two widths — which is
        // what keeps a second card renderer from being needed per list.
        cell: (cell) => (
          <span className="flex flex-col">
            <span>{cell.getValue()}</span>
            <span className="text-parchment-faint text-micro compact:hidden break-all">
              {cell.row.original.email}
            </span>
          </span>
        ),
      }),
      column.accessor("surname", { header: t("columns.surname") }),
      column.accessor("email", {
        header: t("columns.email"),
        meta: { hideBelow: "compact" },
        cell: (cell) => <span className="text-parchment-faint break-all">{cell.getValue()}</span>,
      }),
      column.accessor("role", {
        header: t("columns.role"),
        cell: (cell) => (
          // The badge treatment from app/[locale]/welcome.tsx, dimmed: gold in
          // every row of every page is noise, and the greeting's chip is lit
          // because it is about the reader themselves.
          <span className="font-caps text-parchment-faint text-micro tracking-label border-primary/20 inline-block border px-3 py-1 uppercase">
            {role(cell.getValue())}
          </span>
        ),
      }),
      column.accessor("createdAt", {
        header: t("columns.createdAt"),
        // Newest first on the first click, which is the order the endpoint
        // itself defaults to.
        sortDescFirst: true,
        meta: { hideBelow: "compact", align: "end" },
        cell: (cell) => (
          <time
            dateTime={cell.getValue()}
            className="text-parchment-faint whitespace-nowrap tabular-nums"
          >
            {/* `useFormatter` and not an ICU message, unlike `home.welcome.since`
                — that one has prose around its date and this cell has none, so a
                catalogue entry would be a placeholder and nothing else. The
                `timeZone: "Europe/Kyiv"` from i18n/request.ts still applies, so
                the server and the browser agree on which day this is. */}
            {format.dateTime(new Date(cell.getValue()), {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        ),
      }),
    ]);
  }, [t, role, format]);

  return (
    <ListView
      definition={userList}
      query={query}
      columns={columns}
      page={data && payload(data)}
      isPending={isPending}
      isRefreshing={isFetching && !isPending}
      error={error ?? null}
      onRetry={refetch}
      filters={[
        {
          field: "role",
          label: t("filters.role"),
          // Straight off the zod enum the server validates against, so a role
          // added to `userRoleSchema` is filterable here the same day.
          options: userRoleSchema.options,
          optionLabel: (value) => role(value as User["role"]),
        },
      ]}
      labels={{
        caption: t("title"),
        searchPlaceholder: t("searchPlaceholder"),
        total: t("total", { count: data ? payload(data).total : 0 }),
        loading: t("loading"),
        empty: t("empty"),
        emptyLine: t("emptyLine"),
      }}
    />
  );
}
