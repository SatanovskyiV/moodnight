-- AlterTable
-- When a poem last entered PENDING_REVIEW — the column `/admin/queue` orders
-- by, and the reason it is not simply `updated_at`: an editor is expected to
-- fix a line before approving, and every such edit would push the poem to the
-- back of the queue it is currently being read from.
--
-- Nullable, with no default. A draft has never been submitted, and `now()` on
-- an unsubmitted poem would be a date the queue would then have to explain.
ALTER TABLE "poems"
  ADD COLUMN "submitted_at" TIMESTAMPTZ(3);

-- Backfill, for the rows that are already waiting.
--
-- Only PENDING_REVIEW poems get a value: a published poem was submitted at some
-- point nothing recorded, and inventing a date for it would put a lie in a
-- column whose whole purpose is to be ordered by. The queue is the only reader,
-- and after this it sees every row it holds with a date rather than a null that
-- sorts to one end of it.
--
-- `updated_at` is the closest true statement available — for a poem sitting in
-- the queue untouched, it is the moment it was submitted.
UPDATE "poems"
  SET "submitted_at" = "updated_at"
  WHERE "status" = 'PENDING_REVIEW';

-- CreateIndex
-- The queue's own query: `WHERE status = 'PENDING_REVIEW' ORDER BY submitted_at`.
-- Equality column first, then the ordered one — the same shape as the feed's
-- index, ascending because a queue is read oldest first.
CREATE INDEX "poems_status_submitted_at_idx" ON "poems"("status", "submitted_at");
