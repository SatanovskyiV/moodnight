import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Skeleton on this theme's ink.
 *
 * Two changes from what the CLI wrote. `bg-secondary` rather than `bg-accent`:
 * shadcn's `--accent` is the hover surface, and a block of it reads as something
 * the pointer is over rather than something that has not arrived — `--secondary`
 * is the lifted ink every other resting panel on the site uses. And the pulse is
 * `motion-safe:`, because a page of these is a lot of movement to put in front
 * of a reader who has asked for none; the shape still holds the space, which is
 * the part that does the work.
 *
 * The site's other wait is `Restoring` in components/session/gate.tsx, and the
 * two are not interchangeable: that one is a rite with a sentence, right where
 * the answer is a yes or a no and the reader is waiting on it. This one is for
 * a shape that is already known — a column of poem cards — where showing the
 * layout settle is calmer than a line of prose in the middle of an empty page.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-secondary rounded-md motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
