/**
 * Amount in words for NPR, in the Nepali/South Asian numbering system.
 *
 * Required by section 9 of bill-design.md: the grand total must print in figures
 * AND in words. The grouping is lakh and crore, not the Western thousand and
 * million, so 150000 reads "One Lakh Fifty Thousand" and never "One Hundred
 * Fifty Thousand".
 *
 * Grouping: crore (10,000,000), lakh (100,000), thousand (1,000), hundred (100).
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

const CRORE = 10_000_000;
const LAKH = 100_000;
const THOUSAND = 1_000;
const HUNDRED = 100;

/** Convert 0..99 to words. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

/** Convert a non-negative integer to words using lakh/crore grouping. */
function integerToWords(value: number): string {
  if (value === 0) return "Zero";

  const parts: string[] = [];

  const crores = Math.floor(value / CRORE);
  if (crores > 0) {
    // Crores above 99 recurse, so 1,23,45,67,890 reads "One Arba..." style
    // grouping stays consistent rather than emitting "One Hundred Twenty Three Crore".
    parts.push(`${integerToWords(crores)} Crore`);
    value %= CRORE;
  }

  const lakhs = Math.floor(value / LAKH);
  if (lakhs > 0) {
    parts.push(`${twoDigits(lakhs)} Lakh`);
    value %= LAKH;
  }

  const thousands = Math.floor(value / THOUSAND);
  if (thousands > 0) {
    parts.push(`${twoDigits(thousands)} Thousand`);
    value %= THOUSAND;
  }

  const hundreds = Math.floor(value / HUNDRED);
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} Hundred`);
    value %= HUNDRED;
  }

  if (value > 0) parts.push(twoDigits(value));

  return parts.join(" ");
}

/**
 * Render an NPR amount as it should appear on the bill.
 *
 * @example amountInWords(2486)    // "Two Thousand Four Hundred Eighty Six Rupees Only"
 * @example amountInWords(150000)  // "One Lakh Fifty Thousand Rupees Only"
 * @example amountInWords(99.5)    // "Ninety Nine Rupees and Fifty Paisa Only"
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";

  const negative = amount < 0;
  const absolute = Math.abs(amount);

  // Split on the minor unit in integer space so 0.1 + 0.2 style float error
  // cannot turn 99.50 into 99.49.
  const totalPaisa = Math.round(absolute * 100);
  const rupees = Math.floor(totalPaisa / 100);
  const paisa = totalPaisa % 100;

  const rupeeWords = `${integerToWords(rupees)} Rupee${rupees === 1 ? "" : "s"}`;
  const words =
    paisa > 0
      ? `${rupeeWords} and ${twoDigits(paisa)} Paisa Only`
      : `${rupeeWords} Only`;

  return negative ? `Minus ${words}` : words;
}
