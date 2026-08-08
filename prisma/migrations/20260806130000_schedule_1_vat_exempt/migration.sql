-- Schedule 1 VAT exemption (bill-design.md section 8.3).
--
-- lib/billing/calculate.ts has always honoured a `vatExempt` flag on a bill
-- line, but no model carried it, so the exemption was unreachable from the
-- application: every sale was treated as taxable regardless of what was sold.
-- Restaurants that also sell exempt goods (basic foodstuffs, certain packaged
-- items) were therefore over-declaring VAT.
--
-- Defaulting to false is the safe direction: prepared food and beverages are
-- taxable, so existing rows keep exactly the treatment they were billed under
-- and an outlet opts individual items out deliberately.

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "vat_exempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "combos" ADD COLUMN IF NOT EXISTS "vat_exempt" BOOLEAN NOT NULL DEFAULT false;

-- Snapshotted onto the order line rather than joined from menu_items at bill
-- time. An IRD audit reads the invoice as issued, so re-flagging a menu item
-- years later must not restate the tax treatment of a completed sale.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "vat_exempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "hs_code" TEXT;
