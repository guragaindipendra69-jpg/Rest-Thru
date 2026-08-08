import NepaliDate from "nepali-date-converter";

/**
 * Nepali fiscal-year handling and invoice serial numbering.
 * Implements section 6 of bill-design.md.
 *
 * The Nepali fiscal year runs Shrawan 1 to Asar end. Shrawan is month index 3
 * in nepali-date-converter's 0-based BS calendar (Baisakh 0, Jestha 1, Asar 2,
 * Shrawan 3), so any BS date from Shrawan onward belongs to the fiscal year
 * beginning in that BS year, and Baisakh through Asar belong to the previous one.
 *
 * Serial numbers reset at the start of each fiscal year and must be unbroken:
 * no gaps, no reuse, no manual override. A voided bill still consumes its serial
 * and is marked void rather than deleted, because IRD requires the audit trail.
 */

const SHRAWAN = 3; // 0-based BS month index

export type FiscalYear = {
  /** BS year the fiscal year starts in, e.g. 2082. */
  startYear: number;
  /** Label as printed on bills and sent to CBMS, e.g. "2082/83". */
  label: string;
  /** CBMS payload variant, e.g. "2082.083". */
  cbmsLabel: string;
};

/** Resolve the Nepali fiscal year containing a given AD date. */
export function fiscalYearFor(date: Date = new Date()): FiscalYear {
  const bs = new NepaliDate(date);
  const bsYear = bs.getYear();
  const bsMonth = bs.getMonth();

  const startYear = bsMonth >= SHRAWAN ? bsYear : bsYear - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");

  return {
    startYear,
    label: `${startYear}/${endShort}`,
    cbmsLabel: `${startYear}.0${endShort}`,
  };
}

/** BS date string as printed on the bill, e.g. "2082-04-15". */
export function toBikramSambat(date: Date = new Date()): string {
  const bs = new NepaliDate(date);
  const y = bs.getYear();
  const m = String(bs.getMonth() + 1).padStart(2, "0");
  const d = String(bs.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type InvoiceNumberParts = {
  fiscalYear: FiscalYear;
  sequence: number;
  /** Optional branch code, recommended for multi-outlet CBMS sync. */
  branchCode?: string | null;
  /** Separate series for credit notes / sales returns. */
  series?: "INV" | "CN";
};

/**
 * Format an invoice number: {branch-}{FiscalYear}-{Sequence}, e.g.
 *   2082/83-00142
 *   KTM-2082/83-00142
 *   CN-2082/83-00007
 */
export function formatInvoiceNumber({
  fiscalYear,
  sequence,
  branchCode,
  series = "INV",
}: InvoiceNumberParts): string {
  const padded = String(sequence).padStart(5, "0");
  const prefix = [series === "CN" ? "CN" : null, branchCode || null]
    .filter(Boolean)
    .join("-");
  return prefix
    ? `${prefix}-${fiscalYear.label}-${padded}`
    : `${fiscalYear.label}-${padded}`;
}

/**
 * Next sequence number for a fiscal year.
 *
 * IMPORTANT for the caller: this must run inside a serialized transaction that
 * also inserts the bill, and the (restaurantId, billNumber) unique constraint on
 * the Bill model is what ultimately guarantees no duplicate is committed. A
 * plain count()+1 or max()+1 read outside a transaction races under concurrent
 * checkouts and produces duplicate tax-invoice numbers, which is a compliance
 * problem rather than merely a bug.
 *
 * `highestExistingSequence` is the largest sequence already issued for this
 * fiscal year, including voided bills, since a void still consumes its number.
 */
export function nextSequence(highestExistingSequence: number | null | undefined): number {
  return (highestExistingSequence ?? 0) + 1;
}

/** Extract the sequence back out of a formatted number, for max() scans. */
export function parseSequence(invoiceNumber: string): number | null {
  const match = invoiceNumber.match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}
