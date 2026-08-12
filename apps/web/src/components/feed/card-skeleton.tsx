import { Skeleton } from "@/components/ui/skeleton";

/**
 * A poem card before the poem.
 *
 * It traces components/editorial/poem-card.tsx rather than being a grey box the
 * right height: the same frame, the same padding, the same 44px disc in the same
 * place, the same six teaser lines. That is the entire point of a skeleton — the
 * cards that replace these must land where these already are, so a reader's eye
 * does not have to find the page a second time.
 *
 * The frame and the corners are *not* skeletons. They are chrome and they are
 * already correct, so drawing them for real means the only thing that appears to
 * change when the poems arrive is the poems.
 *
 * The line widths taper, which is what a stanza does. All of them equal would
 * read as a paragraph of prose, and this is the one page where that difference
 * is the subject.
 */
export function FeedCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-primary/18 from-secondary/85 to-card/85 compact:px-14 compact:py-12 relative border bg-gradient-to-b px-6 py-8"
    >
      <div className="mb-[1.6rem] flex items-center gap-4">
        <Skeleton className="size-[44px] shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[0.85rem] w-40" />
          <Skeleton className="h-[0.7rem] w-24" />
        </div>
      </div>

      <Skeleton className="mb-2 h-[2.2rem] w-3/4" />
      <Skeleton className="mb-[1.8rem] h-[1.05rem] w-1/2" />

      {/* Written out rather than mapped over an array of widths: Tailwind finds
          classes by scanning for whole strings, so a width computed at runtime
          is a width that never reaches the stylesheet. The same note lives in
          components/session/hint.ts. */}
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-[1.25rem] w-[92%]" />
        <Skeleton className="h-[1.25rem] w-[86%]" />
        <Skeleton className="h-[1.25rem] w-[94%]" />
        <Skeleton className="h-[1.25rem] w-[78%]" />
        <Skeleton className="h-[1.25rem] w-[88%]" />
        <Skeleton className="h-[1.25rem] w-[62%]" />
      </div>

      <div className="border-primary/15 flex items-center justify-between border-t pt-6">
        <Skeleton className="h-[0.78rem] w-28" />
        <Skeleton className="h-[0.78rem] w-40" />
      </div>
    </div>
  );
}
