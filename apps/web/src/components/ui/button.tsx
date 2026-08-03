import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Button with its CVA variants rewritten to the gothic styles from
 * prototype/styles.css:231-283. Keeping shadcn's API — `asChild`, focus
 * handling, the variant/size contract — while the look stays ours is exactly
 * what the copy-in-rather-than-install model is for; a parallel `.btn` class
 * living alongside it is the thing to avoid.
 *
 * The radial ember the prototype paints with `.btn::before` survives as a
 * `before:` variant instead of hand-written CSS. It washes over the label at
 * 0.18 alpha on hover, as it does in the prototype — that tint is the look, not
 * a stacking bug, so there is deliberately no z-index lifting the text out of it.
 *
 * Only the two variants the shipped screens use are defined. More arrive with
 * the phases that need them, the same way shadcn components themselves do.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-[0.6rem] overflow-hidden",
    "font-display tracking-action whitespace-nowrap uppercase",
    "cursor-pointer border transition-all duration-400 ease-in-out",
    "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-400",
    "before:bg-radial before:from-primary/18 before:from-0% before:to-transparent before:to-70%",
    "hover:before:opacity-100",
  ],
  {
    variants: {
      variant: {
        default: [
          "border-primary-deep bg-transparent text-primary",
          "hover:border-primary hover:bg-primary hover:text-primary-foreground",
          "hover:shadow-glow-strong",
        ],
        ghost: [
          "border-primary/30 bg-transparent text-muted-foreground",
          "hover:border-primary hover:bg-primary/8 hover:text-primary-bright",
          "hover:shadow-glow-soft",
        ],
      },
      size: {
        default: "text-caption px-8 py-[0.85rem]",
        // The prototype overrides the nav's sign-in button inline at
        // prototype/app.jsx:77; that override is this size.
        sm: "text-micro px-[1.4rem] py-[0.6rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
