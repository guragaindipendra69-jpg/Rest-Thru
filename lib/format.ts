/**
 * Formatting utilities for displaying data in user-friendly formats
 */
import NepaliDate from "nepali-date-converter";

/**
 * Formats a number as Nepali Rupees with comma separators
 * @param amount - The amount to format
 * @returns Formatted string like "NPR 1,234"
 */
export function formatCurrency(amount: number): string {
  const formatted = formatNumber(Math.round(amount));
  return `NPR ${formatted}`;
}

/**
 * Adds comma separators to a number
 * @param num - The number to format
 * @returns String with comma separators like "1,234,567"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Formats a number as a percentage
 * @param value - The value to format (0.5 = 50%)
 * @returns Formatted string like "50.0%"
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Formats a date as "Jan 15, 2025"
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date as "2:30 PM"
 * @param date - The date to format
 * @returns Formatted time string
 */
export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a date with both date and time
 * @param date - The date to format
 * @returns Formatted date-time string like "Jan 15, 2025 2:30 PM"
 */
export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Formats a date as relative time from now
 * @param date - The date to format
 * @returns Relative time string like "2 min ago", "5 hours ago", "Yesterday"
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Truncates text to a maximum length and adds ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated string with "..." if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}...`;
}

/**
 * Converts an AD date to the Bikram Sambat calendar used on Nepali tax invoices.
 * @returns Formatted string like "2083/04/18", or "" if the conversion fails
 */
export function formatBSDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  try {
    return new NepaliDate(dateObj).format("YYYY/MM/DD");
  } catch {
    return "";
  }
}

/**
 * Bill number for display.
 *
 * IRD-compliant numbers ("2083/84-00142", "KTM-2083/84-00142", "CN-2083/84-7")
 * are the legal tax-invoice identifier and must print exactly as issued: the
 * fiscal year and any branch or credit-note prefix are part of the number, not
 * decoration. They are returned untouched.
 *
 * Legacy pre-compliance numbers ("B-00125") predate that scheme and keep their
 * old presentation, zero-padded with the letter prefix stripped, so historical
 * bills still render the way they always did.
 */
export function formatBillNo(billNumber: string): string {
  if (!billNumber) return "";
  // A fiscal-year segment ("2083/84") is what distinguishes an IRD serial.
  if (/\d{4}\/\d{2}/.test(billNumber)) return billNumber;
  const digits = billNumber.replace(/\D/g, "");
  return digits.padStart(6, "0");
}

/**
 * Invoice No as printed on the bill.
 *
 * For IRD-compliant numbers this IS the invoice number and is returned as
 * issued. Wrapping it in "INV-<AD year>-" would both corrupt the legal
 * identifier and state the wrong year, since the number is scoped to a Nepali
 * fiscal year that straddles two AD years.
 *
 * Legacy numbers keep the old "INV-2026-000125" presentation.
 */
export function formatInvoiceNo(billNumber: string, date: Date | string): string {
  if (!billNumber) return "";
  if (/\d{4}\/\d{2}/.test(billNumber)) return billNumber;
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return `INV-${dateObj.getFullYear()}-${formatBillNo(billNumber)}`;
}
