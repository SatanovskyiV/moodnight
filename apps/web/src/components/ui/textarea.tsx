import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Textarea, wearing ./input.tsx's well — the same near-black ink inside
 * a gold hairline, the same glow on `focus-visible`, the same `destructive` frame
 * when `aria-invalid`. A field is a field; only what a multi-line one needs and a
 * single-line one has no use for differs, and that is all of it:
 *
 * - **`leading-[1.75]`, not the input's `leading-normal`.** This is the one field
 *   on the site whose contents are read as they are typed: the line breaks in a
 *   poem are content (see the note on `body` in packages/shared/src/poem.ts), so
 *   the box a poem is written in uses the leading the card will read it at —
 *   components/editorial/poem-card.tsx sets the same 1.75. A stanza should not
 *   change shape on its way to being published.
 * - **A tall box that scrolls, rather than one that grows.** shadcn's default is
 *   `field-sizing-content`, which is right for a comment and wrong for three
 *   hundred lines of verse: it would walk the submit buttons off the bottom of
 *   the page as the poem got longer. `resize-y` hands the choice back to anyone
 *   who wants more of it at once.
 * - **`block`.** A textarea is `inline-block` by default, which leaves a few
 *   pixels of descender space under it that read as a broken gap in the form's
 *   flex column.
 *
 * The input's two `autofill:` rules are deliberately absent. They exist to
 * outwait Chrome's pale-blue fill over saved credentials, and nothing autofills a
 * poem.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "compact:min-h-[24rem] block min-h-[18rem] w-full resize-y px-4 py-[0.9rem]",
        "font-body text-foreground text-[1.05rem] leading-[1.75]",
        "border-primary/25 bg-background/70 border",
        "transition-[border-color,box-shadow] duration-300",
        "placeholder:text-parchment-faint placeholder:italic",
        "focus-visible:border-primary focus-visible:shadow-glow-soft outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
