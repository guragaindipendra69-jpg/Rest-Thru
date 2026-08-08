-- IRD Nepal compliance columns (bill-design.md sections 5, 6, 8, 12, 14).
--
-- schema.prisma has declared these fields since the lib/billing engine landed,
-- but no migration ever created them, so every deployed database was missing
-- all of them except bills.fiscal_year. lib/actions/billing.ts issueBill()
-- would have thrown on its first call. This migration closes that gap.
--
-- It is deliberately additive: no column is dropped or retyped in a way that
-- loses data, because this runs against live outlets with settled bills.

-- ── bills ───────────────────────────────────────────────────────────────────

-- fiscal_year arrived via an earlier `db push` as NOT NULL DEFAULT '' while the
-- schema declares it optional. Relax it to match, and null out the placeholder
-- so legacy "B-00001" bills do not appear to belong to a real fiscal year and
-- cannot interfere with sequence allocation for the current one.
ALTER TABLE "bills" ALTER COLUMN "fiscal_year" DROP DEFAULT;
ALTER TABLE "bills" ALTER COLUMN "fiscal_year" DROP NOT NULL;
UPDATE "bills" SET "fiscal_year" = NULL WHERE "fiscal_year" = '';

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "sequence" INTEGER;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "bill_date_bs" TEXT;

-- Every bill issued so far came from the VAT-inclusive path in orders.ts and
-- bills.ts (splitVatInclusive), so INCLUSIVE is the historically accurate value
-- for existing rows, not merely a convenient default. Defaulting to ADDITIVE
-- here would also stack 13% VAT on top of every future guest bill across all
-- live outlets, which is a silent pricing change rather than a migration.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "pricing_mode" TEXT NOT NULL DEFAULT 'INCLUSIVE';

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "is_abbreviated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "exempt_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "buyer_name" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "buyer_pan" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "buyer_address" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cbms_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cbms_synced_at" TIMESTAMP(3);
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cbms_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "cbms_last_error" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "credit_note_for_id" TEXT;

-- ── restaurants ─────────────────────────────────────────────────────────────

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "pricing_mode" TEXT NOT NULL DEFAULT 'INCLUSIVE';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "branch_code" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "rolling_turnover" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ── indexes ─────────────────────────────────────────────────────────────────

-- The unbroken per-fiscal-year serial. This constraint, not application-side
-- max()+1, is what makes a duplicate tax-invoice number impossible under
-- concurrent checkouts. Legacy rows carry (NULL, NULL) and Postgres treats
-- NULLs as distinct in a unique index, so they coexist without collision.
CREATE UNIQUE INDEX IF NOT EXISTS "bills_restaurant_id_fiscal_year_sequence_key"
  ON "bills" ("restaurant_id", "fiscal_year", "sequence");

CREATE INDEX IF NOT EXISTS "bills_restaurant_id_cbms_status_idx"
  ON "bills" ("restaurant_id", "cbms_status");
