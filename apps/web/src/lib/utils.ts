import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told about the scales this theme adds.
 *
 * It settles conflicts by class *group*, and it works out a class's group from
 * Tailwind's stock names — so `text-micro`, one of the four type steps
 * registered in globals.css, does not read as a font size to it. It reads as a
 * colour, and a colour is exactly what sits beside it in every component that
 * sets both: `cn("text-micro", "text-muted-foreground")` returned the colour
 * alone, having decided the size was the same declaration said twice.
 *
 * The effect was quiet and everywhere — the bar's links and the language
 * switcher rendering at whatever size they inherited, and `Button`'s gold
 * dropped by its own `text-caption`, which is why the primary button came out
 * parchment. Naming the steps here fixes all of it at once and is the only
 * place that has to know.
 *
 * The tracking scale is listed for the same reason before it costs anything:
 * unrecognised, two `tracking-*` classes are not conflicting classes, so an
 * override would silently come down to which one Tailwind emitted first.
 *
 * Both lists are the `@theme` blocks in globals.css, and adding a step there
 * means adding it here. The other custom scales need no entry — `--shadow-*`
 * and `--text-shadow-*` extend names tailwind-merge already groups correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "caption", "label", "brand"] }],
      tracking: [{ tracking: ["label", "display", "action", "brand", "eyebrow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
