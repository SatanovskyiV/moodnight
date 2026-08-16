-- CreateTable
-- Every version a poem's text has had, and who wrote each one.
--
-- An editor may fix a line before approving a poem and keep fixing it after it
-- is published, so the text a reader sees is not always the text its author
-- submitted. Until now that difference was unrecoverable — an UPDATE replaced
-- the body and nothing remembered the old one. These rows are the record: the
-- original, every version after it, and the account behind each.
--
-- The three text columns are typed exactly as `poems`' own, so a version can
-- hold anything the poem could. Whole snapshots rather than diffs — a body is
-- capped at 20 000 characters by the API and this archive holds tens of poems,
-- so the storage a diff would save is not worth the replay code, nor the loss of
-- being able to read a version in psql.
--
-- `version` is written down rather than derived from the row's position, and the
-- cap is why: a poem past POEM_REVISIONS_MAX keeps its original and its most
-- recent versions while the middle is pruned, so position is a number that moves
-- under the reader. Written at the moment the version is made, it never does.
CREATE TABLE "poem_revisions" (
  "id"         UUID           NOT NULL,
  "poem_id"    UUID           NOT NULL,
  "editor_id"  UUID           NOT NULL,
  "version"    INTEGER        NOT NULL,
  "title"      VARCHAR(200)   NOT NULL,
  "subtitle"   VARCHAR(200),
  "body"       TEXT           NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "poem_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Uniqueness and ordering in one index, which is why this table has no second
-- one on `created_at`. Every query it serves is "one poem's versions, in version
-- order" — newest-first with LIMIT 1 for a studio or queue row, oldest-first for
-- the whole trail — and both are this B-tree read in one direction or the other.
--
-- The uniqueness is load-bearing rather than decorative: two editors saving the
-- same poem at once both read the same highest version and both try to write one
-- past it, and this is what rejects the second instead of letting it overwrite
-- the first. The API answers that rejection with a 409.
CREATE UNIQUE INDEX "poem_revisions_poem_id_version_key" ON "poem_revisions"("poem_id", "version");

-- AddForeignKey
-- CASCADE: versions of a poem that no longer exists describe nothing. The same
-- reading `reviews_poem_id_fkey` makes.
ALTER TABLE "poem_revisions"
  ADD CONSTRAINT "poem_revisions_poem_id_fkey" FOREIGN KEY ("poem_id")
  REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT: an account that has edited something cannot be deleted out from
-- under the record of having done it. `poems_author_id_fkey` and
-- `reviews_reviewer_id_fkey` already say the same, which is why deactivating an
-- account is the operation that applies to a real one.
ALTER TABLE "poem_revisions"
  ADD CONSTRAINT "poem_revisions_editor_id_fkey" FOREIGN KEY ("editor_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every poem that already exists gets its current text as version 1,
-- credited to its author at the moment the poem was written.
--
-- It is the only history that can honestly be reconstructed — nothing recorded
-- the earlier versions, and no row here may claim to be one. What this asserts
-- is narrower and true: this text exists, the author is who the site has always
-- said wrote the poem, and the poem is that old.
--
-- Not optional. From here on the API depends on every poem having at least one
-- version — the newest one is what `lastEdit` is read from, and the trail
-- endpoint distinguishes "no such poem" from "no history" by the fact that the
-- second cannot happen. A poem written before today would otherwise be the one
-- row that breaks both.
--
-- `gen_random_uuid()` gives a v4 where the application writes v7, which the
-- column does not care about and nothing else here does either: ids are never
-- ordered by — `version` is what orders this table — and this writes exactly one
-- row per poem.
INSERT INTO "poem_revisions" ("id", "poem_id", "editor_id", "version", "title", "subtitle", "body", "created_at")
SELECT gen_random_uuid(), "id", "author_id", 1, "title", "subtitle", "body", "created_at"
FROM "poems";
