import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn's Input with the gothic treatment from prototype/styles.css:770-790:
 * an inset well of near-black ink inside a thin gold hairline, which lights up
 * and glows when focused.
 *
 * Two departures from the prototype's `.input`, both about telling the reader
 * something it had no way to say:
 *
 * - The focus glow is bound to `focus-visible`, not `focus`. A mouse click on a
 *   text field already shows a caret; the ring is for keyboard readers.
 * - `aria-invalid` paints the frame in `destructive`. The prototype's form never
 *   failed — it called `preventDefault()` and stopped — so a field that has to
 *   report a rejected value is new here, and colour alone is not the whole
 *   answer: the message underneath is, and this only agrees with it.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full px-4 py-[0.9rem]",
        "font-body text-foreground text-[1.05rem] leading-normal",
        // Deliberately darker than `--card`: the prototype sinks the field below
        // the card it sits on rather than lifting it (styles.css:774). Its
        // literal `rgba(10, 8, 5, 0.7)` is `--background` at 70% to the byte, so
        // this follows a re-theme instead of staying that one brown.
        "border-primary/25 bg-background/70 border",
        "transition-[border-color,box-shadow] duration-300",
        "placeholder:text-parchment-faint placeholder:italic",
        "focus-visible:border-primary focus-visible:shadow-glow-soft outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive",
        // Chrome paints its own pale-blue fill over autofilled credentials,
        // which on this palette is the one thing that looks like a bug rather
        // than a theme. The fill cannot be unset, only outwaited: a
        // `background-color` transition long enough never to arrive leaves the
        // field's own ink showing, and the text colour is set separately because
        // `-webkit-text-fill-color` is what actually paints autofilled glyphs.
        "autofill:[-webkit-text-fill-color:var(--parchment)]",
        "autofill:[transition:background-color_9999s]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
