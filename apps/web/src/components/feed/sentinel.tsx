"use client";

import { useEffect, useRef } from "react";

/**
 * An empty marker near the bottom of the feed that asks for the next page when
 * the reader gets close to it.
 *
 * `rootMargin` is what makes the scroll feel endless rather than stepped: the
 * observer fires while the marker is still 600px below the fold, so the request
 * is usually finished by the time the last card leaves the screen and there is
 * nothing to wait at. Shorter and a fast scroll outruns the fetch; much longer
 * and a reader who stops after the first card has still paid for a second page.
 *
 * **It is not the only way to go on reading.** An observer needs a scroll it can
 * watch, and there are readers who never produce one — a keyboard, a screen
 * reader moving by heading, a browser that has this API disabled. So the button
 * beside it in ./index.tsx is always rendered and does exactly the same thing;
 * this element is `aria-hidden` and has no role, because to anybody being read
 * to it is not a control, it is a place in the page.
 *
 * `enabled` rather than an unconditional observer: with nothing left to fetch,
 * the marker sits permanently inside its own margin and would fire on every
 * scroll event for as long as the reader stayed. `fetchNextPage` is safe to call
 * twice — react-query drops the second while the first is in flight — but a
 * disconnected observer is cheaper than a deduplicated request.
 */
export function FeedSentinel({ onReach, enabled }: { onReach: () => void; enabled: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  // The callback changes identity on every render of the feed, and re-running
  // the effect for that would tear down and rebuild the observer each time —
  // which fires it again from a fresh intersection. A ref keeps the effect's
  // dependencies down to the one thing that should actually restart it, and it
  // is written in an effect rather than during render because a render must not
  // have side effects: React may throw one away, and this one would survive it.
  const reach = useRef(onReach);

  useEffect(() => {
    reach.current = onReach;
  }, [onReach]);

  useEffect(() => {
    const element = marker.current;

    if (!element || !enabled) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          reach.current();
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [enabled]);

  return <div ref={marker} aria-hidden="true" />;
}
