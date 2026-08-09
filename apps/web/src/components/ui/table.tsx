import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Table, re-themed the way `Button` and `Input` were: the API stays
 * shadcn's, the look becomes the prototype's.
 *
 * Four of its defaults had to go, and each for the same underlying reason —
 * shadcn's table is drawn for a light page with grey rules, and this one is ink
 * with gold hairlines:
 *
 * - **`border-b` per row.** That resolves to `--border`, which here is
 *   `--accent-deep` — a solid brown-gold that reads as a drawn grid rather than
 *   a ruled page. The site fences its bands with `border-primary/15`; a row is a
 *   fainter division than a band, so rows take `/10` and the header keeps `/25`.
 * - **`hover:bg-muted/50`.** A flat block of lifted ink, which is the one thing
 *   the theme's variables cannot correct on their own. A row here lights from a
 *   rule at its left edge with the wash running off it — `MenuItem` in
 *   components/top-nav/user-menu.tsx, at the scale a table row can afford.
 * - **`font-medium` in `text-sm`** on the header. Every other label on this site
 *   is IM Fell small caps at `--text-micro` with `--tracking-label`.
 * - **`text-sm` in the body.** The root font is fluid (globals.css), so a fixed
 *   ladder step fights it; Cormorant at the page's own size is what the rest of
 *   the site reads at.
 *
 * The container div is kept exactly as generated. `overflow-x-auto` on a `w-full`
 * box is what the `minmax(0,1fr)` track in components/area/shell.tsx was written
 * for — a table too wide for a phone scrolls inside its own frame instead of
 * pushing the rail off the screen.
 *
 * Not a client component, unlike the file shadcn writes: there is not a hook or
 * a handler in here, and the one thing on the page that does hold state — the
 * sort buttons in components/list/table.tsx — is a client component of its own.
 * Leaving the `"use client"` on would have pulled every table's markup into the
 * bundle for nothing.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("font-body w-full caption-bottom border-collapse", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-primary/25 [&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-primary/25 border-t [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

/**
 * A row, lit from its left edge.
 *
 * The rule is a `before:` on the row's first cell rather than on the `<tr>`:
 * a table row is not a containing block, so an absolutely positioned pseudo on
 * it resolves against the page and lands nowhere near the row. The first `<td>`
 * is, once it is `relative`, and a rule at the left edge of the first cell is
 * the left edge of the row.
 *
 * Unconditional colour on the rule, scaled to nothing at rest, for the reason
 * `MenuItem` gives: setting the colour only on hover flicks it through the
 * wrong tone on the way out.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "group border-primary/10 border-b transition-colors duration-300",
        "hover:from-primary/6 hover:bg-gradient-to-r hover:to-transparent",
        "data-[state=selected]:from-primary/8 data-[state=selected]:bg-gradient-to-r data-[state=selected]:to-transparent",
        "[&>td:first-child]:relative",
        "[&>td:first-child]:before:bg-primary [&>td:first-child]:before:absolute [&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-px [&>td:first-child]:before:origin-center [&>td:first-child]:before:scale-y-0 [&>td:first-child]:before:transition-transform [&>td:first-child]:before:duration-300 [&>td:first-child]:before:content-['']",
        "hover:[&>td:first-child]:before:scale-y-100",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "font-caps text-parchment-faint text-micro tracking-label px-3 py-3 text-left align-middle whitespace-nowrap uppercase",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("text-foreground px-3 py-[0.7rem] align-middle whitespace-nowrap", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-parchment-faint text-caption mt-4 italic", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
