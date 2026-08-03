import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The bar's link treatment, ported from prototype/styles.css:216-228: dim
 * parchment that warms to gold with a soft glow behind it.
 *
 * Three components wear it — the section links, the wordmark, and the options
 * in the locale switcher — and in the prototype they are literally the same
 * rule (`.topnav a`), which is why the wordmark warms to gold on hover there
 * too. A component rather than a shared class string so the variants stay a
 * closed set and `asChild` can hand the styling to next-intl's `Link`, the same
 * contract `Button` already follows.
 *
 * Two additions to the prototype: a focus ring, because a keyboard reader needs
 * to see where they are, and the `aria-current` treatment below.
 */
const navLinkVariants = cva(
  [
    "transition-[color,text-shadow] duration-300",
    "hover:text-primary hover:text-shadow-glow",
    "focus-visible:text-primary focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-4",
    // Whatever the reader is already looking at stays lit, one alpha step below
    // a hover. Driven off `aria-current` rather than a prop so the styling
    // cannot drift from what a screen reader announces — and matching any
    // value, so the section links light up on their own once Phase 2 turns them
    // into routes carrying `aria-current="page"`.
    "[&[aria-current]]:text-primary [&[aria-current]]:text-shadow-glow-soft",
  ],
  {
    variants: {
      variant: {
        default: "font-caps text-label tracking-label text-muted-foreground",
        compact: "font-caps text-micro tracking-label text-muted-foreground",
        brand: "font-display text-brand tracking-brand text-foreground uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function NavLink({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> &
  VariantProps<typeof navLinkVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp data-slot="nav-link" className={cn(navLinkVariants({ variant, className }))} {...props} />
  );
}

export { NavLink, navLinkVariants };
