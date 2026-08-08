import type * as React from "react";

import { Seal } from "@/components/editorial/ornaments";
import { Link } from "@/i18n/navigation";

/**
 * The card the auth screens are, ported from prototype/app.jsx:230-283 and
 * styled from prototype/styles.css:701-790.
 *
 * The prototype had one card that toggled between signing in and registering on
 * a `mode` prop. Here the two modes are two routes, so what they share is this
 * shell — the pool of lifted ink, the seal, the heading pair — and what differs
 * is the form each one puts inside it. Extracting the shell rather than
 * parameterising a `mode` is what keeps the difference between the screens
 * confined to their own directories: neither page carries a branch for the
 * other, and neither form ships the other's fields.
 *
 * A server component, and every caller keeps it one: the `"use client"`
 * boundary on each screen starts at its form, so the card, the seal and the
 * headings are markup the browser is handed rather than JavaScript it runs.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    // `min-h-dvh`, not `min-h-screen`: `screen` is `100vh`, which on a phone
    // measures the viewport as it will be once the address bar has retracted.
    // A card centred in that box starts life pushed below the fold, and this
    // screen is a single card whose whole job is to be the thing you see.
    <main className="compact:px-6 compact:py-20 relative z-10 flex min-h-dvh items-center justify-center px-4 py-14">
      {/* The prototype's `.auth-section` painted a radial pool of lifted ink
          behind the card and fenced the band off with a gold hairline top and
          bottom. As a page rather than a band there is nothing to fence it from,
          so the pool stays and the two borders go. */}
      <div className="from-secondary/60 pointer-events-none absolute inset-0 bg-radial-[ellipse_at_center] to-transparent to-70%" />

      {/* The prototype's 3.5rem of side padding is 63px, which on a 360px phone
          is a third of the screen spent on the frame — and the frame is the one
          thing here that can afford to give, because what it is squeezing is a
          column of labelled inputs. */}
      <section className="from-secondary/90 to-background/90 border-primary/25 compact:px-14 compact:py-16 relative w-full max-w-[520px] border bg-gradient-to-b px-5 py-10 text-center">
        {/* The seal is sized by its wrapper rather than by `Seal`'s own prop, so
            the two steps are one class each and the glyph's `viewBox` does the
            scaling. */}
        <span className="text-primary drop-shadow-glow compact:size-16 mx-auto mb-6 grid size-14 place-items-center">
          <Seal className="size-full" />
        </span>

        <h1 className="font-display text-foreground tracking-display compact:text-[1.8rem] mb-[0.8rem] text-[1.45rem] leading-tight font-medium uppercase">
          {title}
        </h1>

        <p className="text-muted-foreground compact:mb-10 mb-8 text-[1.05rem] text-balance italic">
          {subtitle}
        </p>

        {children}
      </section>
    </main>
  );
}

/**
 * The line at the foot of the card pointing at the other screen
 * (prototype/styles.css:812-831).
 *
 * In the prototype this flipped the card's `mode` in place; here it is a link
 * between two routes, which is the whole reason the pages can be split. Its
 * `prompt` and `label` are separate strings rather than one message with the
 * anchor inside it: `t.rich` would work, but a translator handed
 * `"Уперше тут? <link>Створити свій голос</link>"` has to keep the tag intact
 * to keep the sentence clickable, and nothing here needs the link to sit
 * mid-sentence.
 */
export function AuthAlt({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <p className="font-caps text-caption tracking-label text-muted-foreground mt-6 uppercase">
      {prompt}{" "}
      <Link
        href={href}
        className="text-primary border-primary/40 hover:text-primary-bright hover:border-primary hover:text-shadow-glow focus-visible:text-primary focus-visible:outline-ring border-b transition-[color,border-color,text-shadow] duration-300 focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {label}
      </Link>
    </p>
  );
}
