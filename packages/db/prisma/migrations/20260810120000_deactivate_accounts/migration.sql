-- AlterTable
-- Whether an account may sign in — the column that makes deactivation possible
-- and makes hard deletion mostly unnecessary.
--
-- NOT NULL with a default, which Postgres applies to existing rows without
-- rewriting the table. `true` is the correct starting point and not merely the
-- convenient one: every account that reached this migration was one that could
-- sign in, so the default states what was already true of all of them rather
-- than choosing a value for them.
--
-- No index. The administration table filters on this column, but it is a
-- boolean on a table of accounts where nearly every row is `true` — a plain
-- index would be ignored by the planner for `active = true` and unnecessary for
-- the handful matching `active = false`. If the site ever holds enough
-- deactivated accounts for that to stop being true, the answer is a partial
-- index (`WHERE NOT "active"`), written here in SQL like `users_one_root`.
ALTER TABLE "users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
