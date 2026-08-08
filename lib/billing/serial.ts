import type { Prisma } from "@prisma/client";
import { fiscalYearFor, formatInvoiceNumber, toBikramSambat } from "./fiscal-year";

/**
 * Transaction-safe invoice serial allocation. Implements section 6 of
 * bill-design.md for every code path that issues a bill.
 *
 * This exists as a standalone helper rather than living inside issueBill()
 * because the live checkout in lib/actions/orders.ts allocates its number
 * inside a much larger transaction that also groups sibling orders, releases
 * the table and writes payments. That work cannot be folded into issueBill, so
 * without a shared allocator the two paths drift and one of them ends up
 * inventing its own numbering, which is what the "B-00001" counter was.
 *
 * The correctness argument is the unique constraint, not this function. A
 * max()+1 read races under concurrent checkouts: two cashiers close tickets at
 * the same moment, both read the same highest sequence, both write N+1, and the
 * outlet has two bills carrying one tax-invoice number. That is a compliance
 * failure rather than a cosmetic bug. So:
 *
 *   - the read happens inside the caller's transaction,
 *   - @@unique([restaurantId, fiscalYear, sequence]) is the actual arbiter, and
 *   - the caller retries the whole transaction on the resulting P2002.
 *
 * Callers MUST use runWithSerialRetry (or replicate its retry) around the
 * transaction. Allocating without retrying just moves the race into a 500.
 */

export const MAX_SEQUENCE_ATTEMPTS = 5;

export type AllocateInvoiceOptions = {
  restaurantId: string;
  /** Prefixed onto the number so multi-outlet groups do not collide in CBMS. */
  branchCode?: string | null;
  /** Credit notes use "CN"; normal bills use "INV". Both share the fiscal-year sequence. */
  series?: "INV" | "CN";
  /** Defaults to now. Injectable so backdated issuance lands in the right FY. */
  when?: Date;
};

export type AllocatedInvoiceNumber = {
  billNumber: string;
  fiscalYear: string;
  sequence: number;
  billDateBS: string;
  billDate: Date;
};

export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  { restaurantId, branchCode, series = "INV", when = new Date() }: AllocateInvoiceOptions
): Promise<AllocatedInvoiceNumber> {
  const fiscalYear = fiscalYearFor(when);

  // Highest sequence issued this fiscal year, INCLUDING voided bills: a void
  // consumes its number permanently and must never be handed out again.
  //
  // Legacy pre-compliance bills carry fiscalYear NULL (see the
  // 20260806120000_ird_billing_compliance_fields migration), so they are
  // excluded from this scan and the first compliant bill of a fiscal year
  // correctly starts at 1.
  const highest = await tx.bill.findFirst({
    where: { restaurantId, fiscalYear: fiscalYear.label },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  const sequence = (highest?.sequence ?? 0) + 1;

  return {
    billNumber: formatInvoiceNumber({ fiscalYear, sequence, branchCode, series }),
    fiscalYear: fiscalYear.label,
    sequence,
    billDateBS: toBikramSambat(when),
    billDate: when,
  };
}

/** True when an error is another cashier having taken the sequence we read. */
export function isSerialCollision(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * Run a transaction that allocates an invoice number, retrying on serial
 * collision. The callback must be idempotent on retry: it re-runs from scratch
 * in a fresh transaction, so the previous attempt's writes were rolled back.
 */
export async function runWithSerialRetry<T>(
  run: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SEQUENCE_ATTEMPTS; attempt++) {
    try {
      return await run(attempt);
    } catch (err) {
      lastError = err;
      if (!isSerialCollision(err)) throw err;
    }
  }
  throw lastError ?? new Error("Could not allocate an invoice number, please retry");
}
