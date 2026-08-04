-- AlterTable
-- The two columns authentication needs, both added without touching the rows
-- already there.
--
-- `password_hash` is nullable, so existing rows take a NULL and no backfill is
-- needed. That nullability is the model, not a migration convenience: an
-- account without a password simply cannot sign in with one. The alternative —
-- NOT NULL with a sentinel value — would put a string in the column that looks
-- like a credential and is not, and every read of it would have to remember
-- that.
--
-- `token_version` is NOT NULL with a default, which Postgres applies to
-- existing rows without rewriting the table. Zero is the correct starting
-- point: no refresh token has been issued for any of these accounts yet, so
-- there is nothing for a higher number to invalidate.
ALTER TABLE "users"
  ADD COLUMN "password_hash" VARCHAR(255),
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
