import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The small-caps field label from prototype/styles.css:762-768.
 *
 * A native `<label>` rather than shadcn's `@radix-ui/react-label` wrapper. That
 * package exists to fix a Safari bug with clicks on labels wrapping controls,
 * and to forward `peer-disabled` styling; here every label is associated by
 * `htmlFor` and sits beside its input, so the native element already does the
 * whole job and the dependency would buy nothing. `Button` copies shadcn's API
 * because callers depend on `asChild`; nobody depends on a label's internals.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "font-caps text-parchment-faint text-micro tracking-action uppercase",
        "select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
