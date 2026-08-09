"use client";

import { MAX_SEARCH_LENGTH, type ListDefinition } from "@moodnight/shared";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ListQuery } from "./query";

/**
 * One filter a list offers: which property, what it is called, and what may be
 * chosen. The values come from the resource's own zod enum, so a role added to
 * `userRoleSchema` is filterable the day it is added and not the day somebody
 * remembers to add it here too.
 */
export type ListFilterSpec<Definition extends ListDefinition> = {
  field: Definition["filterable"][number];
  label: string;
  options: readonly string[];
  optionLabel: (value: string) => string;
};

/**
 * The search box.
 *
 * Debounced, and the input holds its own draft so typing never waits on a
 * router write. Two details that are easy to get wrong and unpleasant when they
 * are:
 *
 * - **Re-seeding.** The draft has to follow the URL when the URL changes for
 *   some *other* reason — the back button, the clear control — and must not
 *   follow it when the URL changed because of this input, or our own debounced
 *   write bounces back and eats the character just typed. `written` is what
 *   tells the two apart.
 * - **`maxLength`.** The schema caps a search at `MAX_SEARCH_LENGTH`; without
 *   the attribute the 101st character is silently dropped on the way past and
 *   what the reader sees is a box that has stopped responding.
 */
export function ListSearch({
  query,
  placeholder,
}: {
  query: ListQuery<ListDefinition>;
  placeholder: string;
}) {
  const t = useTranslations("list");
  const id = useId();

  const committed = ((query.params as Record<string, unknown>).search as string | undefined) ?? "";
  const [draft, setDraft] = useState(committed);
  const written = useRef(committed);

  // The writer is held in a ref rather than named as a dependency below. `query`
  // is a fresh object every render and `query.set` a fresh callback whenever the
  // URL changes, so depending on either would tear down and restart the debounce
  // timer on every render — a 300ms delay that only ever elapses once rendering
  // happens to stop.
  const write = useRef(query.set);

  // Refreshed after every render rather than during one — a ref written in
  // render is the thing the compiler rule forbids, and the timer below cannot
  // fire for another 300ms anyway, long after this has run.
  useEffect(() => {
    write.current = query.set;
  });

  useEffect(() => {
    // Follow the URL only when it changed for some *other* reason — the back
    // button, or the clear control. Following our own debounced write would
    // bounce it back into the box and eat the character just typed.
    if (committed !== written.current) {
      written.current = committed;
      setDraft(committed);
    }
  }, [committed]);

  useEffect(() => {
    const next = draft.trim();

    if (next === written.current) {
      return;
    }

    const timer = setTimeout(() => {
      const first = written.current === "";

      written.current = next;
      // The first search pushes, so Back undoes it; the keystrokes after that
      // replace, so Back is not one character at a time.
      write.current({ search: next || undefined }, first ? "push" : "replace");
    }, 300);

    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {/* A placeholder is not an accessible name, and it is gone the moment
          there is a character in the box. */}
      <Label htmlFor={id} className="sr-only">
        {t("search")}
      </Label>

      <Input
        id={id}
        type="search"
        value={draft}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        // Trimmed padding rather than a smaller face: globals.css spells out
        // that iOS Safari zooms the page whenever a focused input computes under
        // 16px, and the root font already floors there.
        className="py-[0.6rem]"
      />
    </div>
  );
}

/**
 * A list's filters, as rows of chips.
 *
 * Chips rather than a select, because every filter this site has is a closed set
 * of four or fewer values and showing all of them at once is what a filter over
 * a closed set should do — there is nothing to discover behind a trigger. It
 * also means no new shadcn component, which is the "nothing ahead of need" rule
 * in docs/ROADMAP.md.
 *
 * `aria-pressed` rather than a checkbox group: these are toggles that act
 * immediately, not fields awaiting a submit.
 */
export function ListFilters<Definition extends ListDefinition>({
  query,
  filters,
}: {
  query: ListQuery<Definition>;
  filters: readonly ListFilterSpec<Definition>[];
}) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {filters.map((spec) => (
        <FilterGroup key={String(spec.field)} query={query} spec={spec} />
      ))}
    </div>
  );
}

function FilterGroup<Definition extends ListDefinition>({
  query,
  spec,
}: {
  query: ListQuery<Definition>;
  spec: ListFilterSpec<Definition>;
}) {
  const id = useId();
  const chosen = query.filter(spec.field);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        id={id}
        className="font-caps text-parchment-faint text-micro tracking-label mr-1 uppercase"
      >
        {spec.label}
      </span>

      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {spec.options.map((option) => {
          const on = chosen.includes(option);

          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() =>
                query.setFilter(
                  spec.field,
                  on ? chosen.filter((one) => one !== option) : [...chosen, option],
                )
              }
              className={`font-caps text-micro tracking-label focus-visible:outline-ring cursor-pointer border px-3 py-[0.35rem] uppercase transition-[color,border-color,box-shadow] duration-300 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
                on
                  ? "border-primary/50 bg-primary/8 text-primary shadow-glow-soft"
                  : "border-primary/15 text-parchment-faint hover:border-primary/40 hover:text-primary-bright"
              }`}
            >
              {spec.optionLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
