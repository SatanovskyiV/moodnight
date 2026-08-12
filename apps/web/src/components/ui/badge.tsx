import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Badge with its CVA variants rewritten to `.poem-tag` from
 * prototype/styles.css:592-604 — the same trade ./button.tsx makes, and for the
 * same reason: shadcn's API and focus handling are worth keeping, its pill
 * shape and its palette are not.
 *
 * Two departures from what the CLI wrote, both deliberate:
 *
 * - **Not `rounded-full`.** The whole theme is near-square by design
 *   (`--radius: 0.125rem`, "gothic frames, not pills"), and a lozenge among the
 *   card's heraldic corners is the one shape that would look borrowed.
 * - **No `[&>svg]:size-3`.** A tag carries a `Rune`, which is sized in flat
 *   pixels like every other ornament on the site — constraining it here would
 *   quietly override the glyph's own dimensions.
 *
 * One variant, because one is what the feed wears. More arrive with the phase
 * that needs them.
 *
 * `asChild` survives untouched and is what Phase 2's `/tag/[slug]` will use to
 * make a tag a `Link` without a second component; the `[a&]:` rules below are
 * already written for that day and do nothing until it comes.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "font-caps text-micro tracking-action uppercase",
    "border px-[0.9rem] py-[0.3rem] transition-all duration-300",
    "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  ],
  {
    variants: {
      variant: {
        // The prototype's tag: gold on the faintest wash of itself, inside a
        // hairline of the same colour at 30%.
        default: [
          "border-primary/30 bg-primary/4 text-primary",
          "[a&]:hover:border-primary [a&]:hover:text-primary-bright",
          "[a&]:hover:text-shadow-glow-soft",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
