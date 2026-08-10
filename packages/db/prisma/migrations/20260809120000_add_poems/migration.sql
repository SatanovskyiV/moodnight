-- AlterTable
-- The author's public face: the fields a poem card and an author page render,
-- none of which the account table needed while it only answered `GET /users`.
--
-- Three of them are NOT NULL and the table already has rows, so each is added
-- nullable, backfilled, and only then constrained. Postgres can add a NOT NULL
-- column with a DEFAULT without rewriting the table, but a *derived* default is
-- not a constant, so the three-step is what a correct backfill costs here.
ALTER TABLE "users"
  ADD COLUMN "pen_name"   VARCHAR(100),
  ADD COLUMN "slug"       VARCHAR(120),
  ADD COLUMN "initials"   VARCHAR(8),
  ADD COLUMN "role_title" VARCHAR(100),
  ADD COLUMN "bio"        VARCHAR(2000),
  ADD COLUMN "avatar_url" VARCHAR(500);

-- Backfill.
--
-- `pen_name` and `initials` are honest derivations of what the row already
-- holds. `slug` is not, and the placeholder is deliberate: a real slug is the
-- transliteration of a pen name, that transliteration lives in
-- @moodnight/shared as `slugify`, and reimplementing the Cabinet of Ministers'
-- table as a chain of thirty `replace()` calls here would be a second copy of
-- it that drifts from the first the day either changes.
--
-- So existing rows take their id, which is unique by construction and therefore
-- satisfies the index below without any chance of a collision. It is an ugly
-- URL and it is not reachable yet — `/author/[slug]` does not ship in this
-- change — and the dev seed overwrites all five of them on its next run. An
-- author changing their pen name in the studio is what replaces it in earnest.
UPDATE "users"
SET
  "pen_name" = "name" || ' ' || "surname",
  "initials" = upper(left("name", 1)) || upper(left("surname", 1)),
  "slug"     = "id"::text
WHERE "pen_name" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "pen_name" SET NOT NULL,
  ALTER COLUMN "slug"     SET NOT NULL,
  ALTER COLUMN "initials" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_slug_key" ON "users"("slug");

-- CreateEnum
CREATE TYPE "poem_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "review_action" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "poems" (
  "id"           UUID          NOT NULL,
  "slug"         VARCHAR(200)  NOT NULL,
  "title"        VARCHAR(200)  NOT NULL,
  "subtitle"     VARCHAR(200),
  "body"         TEXT          NOT NULL,
  "author_id"    UUID          NOT NULL,
  "status"       "poem_status" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMPTZ(3),
  "featured"     BOOLEAN       NOT NULL DEFAULT false,
  "read_count"   INTEGER       NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "poems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
  "id"         UUID           NOT NULL,
  "name"       VARCHAR(60)    NOT NULL,
  "slug"       VARCHAR(80)    NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poem_tags" (
  "poem_id" UUID NOT NULL,
  "tag_id"  UUID NOT NULL,

  CONSTRAINT "poem_tags_pkey" PRIMARY KEY ("poem_id", "tag_id")
);

-- CreateTable
CREATE TABLE "reviews" (
  "id"          UUID            NOT NULL,
  "poem_id"     UUID            NOT NULL,
  "reviewer_id" UUID            NOT NULL,
  "action"      "review_action" NOT NULL,
  "note"        VARCHAR(2000),
  "created_at"  TIMESTAMPTZ(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "poems_slug_key" ON "poems"("slug");

-- CreateIndex
-- The feed's own query — published poems, newest first — in the order the
-- planner wants it: the equality column first, then the one being sorted. This
-- is what keeps the front page an index scan instead of a sort over the whole
-- table, and it is the single most-run query the site has.
CREATE INDEX "poems_status_published_at_idx" ON "poems"("status", "published_at" DESC);

-- CreateIndex
-- The same page narrowed to one author, for `/author/[slug]`.
CREATE INDEX "poems_author_id_status_published_at_idx" ON "poems"("author_id", "status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
-- "Which poems carry this tag" — the direction `/tag/[slug]` reads in. The
-- primary key above already serves the other one.
CREATE INDEX "poem_tags_tag_id_idx" ON "poem_tags"("tag_id");

-- CreateIndex
CREATE INDEX "reviews_poem_id_created_at_idx" ON "reviews"("poem_id", "created_at" DESC);

-- AddForeignKey
-- RESTRICT, not CASCADE: deleting an account must not take its published poems
-- with it. This is the decision the note on `UsersService.remove` deferred —
-- the delete now fails while the author has poems, and reassigning or archiving
-- them is a choice somebody makes on purpose.
ALTER TABLE "poems"
  ADD CONSTRAINT "poems_author_id_fkey" FOREIGN KEY ("author_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- CASCADE here, because a deleted poem genuinely has no tags left to keep.
ALTER TABLE "poem_tags"
  ADD CONSTRAINT "poem_tags_poem_id_fkey" FOREIGN KEY ("poem_id")
  REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT on the other side: removing a tag that poems still carry should
-- fail rather than quietly unfile them.
ALTER TABLE "poem_tags"
  ADD CONSTRAINT "poem_tags_tag_id_fkey" FOREIGN KEY ("tag_id")
  REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_poem_id_fkey" FOREIGN KEY ("poem_id")
  REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
