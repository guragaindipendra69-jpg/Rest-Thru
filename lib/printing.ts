/** Fixed character width the Tax Invoice layout is drawn to (fits an 80mm thermal roll in Courier). */
const INVOICE_WIDTH = 46;

/**
 * The subset of Settings → Invoice Setting the renderer reads. Declared
 * structurally rather than importing the Prisma type so `lib/printing` stays
 * usable on the client, where the generated client isn't available.
 */
export interface InvoicePrintSettings {
  invoiceType?: string;
  legalName?: string;
  address?: string;
  contactNumber?: string;
  taxNumber?: string;
  showInvoiceNo?: boolean;
  showDate?: boolean;
  showOrderType?: boolean;
  showTime?: boolean;
  showSN?: boolean;
  showParticular?: boolean;
  showRate?: boolean;
  showQty?: boolean;
  showAmount?: boolean;
  enableDiscount?: boolean;
  enableServiceCharge?: boolean;
  showDiscountPercentage?: boolean;
  enableTax?: boolean;
  showPaymentMode?: boolean;
  showBilledBy?: boolean;
  showKotNumber?: boolean;
  showTenderAmount?: boolean;
  showInWords?: boolean;
  showServiceDuration?: boolean;
  footerHeader?: string;
  footerRemarks?: string;
}

function padCenter(text: string, width = INVOICE_WIDTH): string {
  if (text.length >= width) return text;
  const total = width - text.length;
  const left = Math.floor(total / 2);
  return " ".repeat(left) + text + " ".repeat(total - left);
}

function twoCol(left: string, right: string, width = INVOICE_WIDTH): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right;
}

function itemRow(sn: string, name: string, qty: string, rate: string, total: string): string {
  const snCol = sn.padEnd(3);
  const qtyCol = qty.padStart(5);
  const rateCol = rate.padStart(8);
  const totalCol = total.padStart(8);
  const nameWidth = INVOICE_WIDTH - snCol.length - qtyCol.length - rateCol.length - totalCol.length;
  const nameCol = name.length > nameWidth ? name.slice(0, nameWidth - 1) + "…" : name.padEnd(nameWidth);
  return snCol + nameCol + qtyCol + rateCol + totalCol;
}

/**
 * Renders a Nepali-style VAT tax invoice as monospace text (the columns are
 * hand-aligned to INVOICE_WIDTH, so this only looks right in a fixed-width font).
 */
export function formatReceiptHTML(data: {
  restaurantName: string;
  address?: string;
  phone?: string;
  /** Shown only when the restaurant has registered a PAN number in Settings. */
  panNumber?: string | null;
  /** Shown only when VAT-registered — an unregistered restaurant charges no VAT. */
  vatRegistered?: boolean;
  vatNumber?: string | null;
  /** Restaurant's configured VAT rate (Settings → Tax & VAT), e.g. 13. */
  taxPercentage?: number;
  invoiceNo: string;
  billNo: string;
  /** Pre-formatted Gregorian date, e.g. "2 Aug 2026". */
  adDate: string;
  /** Pre-formatted Bikram Sambat date, e.g. "2083/04/18". */
  bsDate?: string;
  time: string;
  tableNo?: string | null;
  orderNo?: string | null;
  customerName?: string;
  waiterName?: string | null;
  items: Array<{ name: string; qty: number; price: number; total: number }>;
  subtotal: number;
  discountAmount?: number;
  discountPercent?: number;
  taxableAmount?: number;
  taxAmount: number;
  serviceCharge?: number;
  roundOff?: number;
  totalAmount: number;
  amountPaid: number;
  change: number;
  paymentMethod: string;
  websiteUrl?: string;
  footer?: string;
  /** Extra footer fields, printed when the matching toggle is on. */
  amountInWords?: string | null;
  billedBy?: string | null;
  kotNumbers?: Array<number | string>;
  serviceDuration?: string | null;
  /**
   * Settings → Invoice Setting. Omitted entirely (e.g. by older callers) means
   * "print everything", which is the behaviour this renderer had before the
   * settings page existed.
   */
  settings?: InvoicePrintSettings | null;
}) {
  const s = data.settings;
  // `??` not `||` — an explicit `false` must win, but a missing setting falls
  // back to on.
  const on = (v: boolean | undefined, fallback = true) => v ?? fallback;

  const dbl = "═".repeat(INVOICE_WIDTH);
  const thin = "─".repeat(INVOICE_WIDTH);

  const lines: string[] = [];
  lines.push(dbl);
  lines.push(padCenter((s?.legalName || data.restaurantName).toUpperCase()));
  const addr = s?.address || data.address;
  const phone = s?.contactNumber || data.phone;
  if (addr) lines.push(padCenter(addr));
  if (phone) lines.push(padCenter(`Phone: ${phone}`));
  const taxNo = s?.taxNumber;
  if (taxNo) {
    lines.push(padCenter(`Tax No.: ${taxNo}`));
  } else {
    if (data.panNumber) lines.push(padCenter(`PAN No.: ${data.panNumber}`));
    if (data.vatRegistered && data.vatNumber) lines.push(padCenter(`VAT No.: ${data.vatNumber}`));
  }
  lines.push(dbl);
  lines.push("");
  lines.push(padCenter((s?.invoiceType || "Tax Invoice").toUpperCase()));
  lines.push("");
  if (on(s?.showInvoiceNo)) lines.push(twoCol("Invoice No :", data.invoiceNo));
  lines.push(twoCol("Bill No    :", data.billNo));
  if (on(s?.showDate)) {
    lines.push(twoCol("Date       :", data.bsDate ? `${data.bsDate} BS` : data.adDate));
  }
  if (on(s?.showTime)) lines.push(twoCol("Time       :", data.time));
  lines.push("");
  if (on(s?.showOrderType)) {
    if (data.tableNo) lines.push(twoCol("Table No   :", data.tableNo));
    if (data.orderNo) lines.push(twoCol("Order No   :", data.orderNo));
    lines.push("");
  }
  lines.push(twoCol("Customer   :", data.customerName || "Walk-in Customer"));
  if (data.waiterName) lines.push(twoCol("Waiter     :", data.waiterName));
  lines.push("");
  lines.push(thin);
  // Columns are fixed-width, so a hidden column is blanked rather than removed
  // — dropping it would shift every row out of alignment with the header.
  const col = (v: string, show: boolean) => (show ? v : "");
  const showSN = on(s?.showSN);
  const showQty = on(s?.showQty);
  const showRate = on(s?.showRate);
  const showAmount = on(s?.showAmount);
  lines.push(
    itemRow(col("SN", showSN), "Item", col("Qty", showQty), col("Rate", showRate), col("Total", showAmount))
  );
  lines.push(thin);
  data.items.forEach((item, idx) => {
    lines.push(
      itemRow(
        col(String(idx + 1), showSN),
        item.name,
        col(String(item.qty), showQty),
        col(formatNum(item.price), showRate),
        col(formatNum(item.total), showAmount)
      )
    );
  });
  lines.push(thin);
  lines.push("");
  lines.push(twoCol("Subtotal", `Rs. ${formatNum(data.subtotal)}`));
  if (data.discountAmount && on(s?.enableDiscount)) {
    const label =
      data.discountPercent && on(s?.showDiscountPercentage)
        ? `Discount (${data.discountPercent.toFixed(0)}%)`
        : "Discount";
    lines.push(twoCol(label, `Rs. ${formatNum(data.discountAmount)}`));
  }
  lines.push(thin);
  const taxOn = on(s?.enableTax) && data.vatRegistered;
  if (data.taxableAmount !== undefined && taxOn) {
    lines.push(twoCol("Taxable Amount", `Rs. ${formatNum(data.taxableAmount)}`));
  }
  if (taxOn) {
    lines.push(twoCol(`VAT (${data.taxPercentage ?? 13}%)`, `Rs. ${formatNum(data.taxAmount)}`));
  }
  if (data.serviceCharge && on(s?.enableServiceCharge, true)) {
    lines.push(twoCol("Service Charge", `Rs. ${formatNum(data.serviceCharge)}`));
  }
  lines.push(thin);
  lines.push(twoCol("Grand Total", `Rs. ${formatNum(data.totalAmount)}`));
  if (data.roundOff) {
    lines.push(twoCol("Round Off", `Rs. ${formatNum(Math.abs(data.roundOff))}`));
  }
  lines.push(dbl);
  const payable = data.totalAmount + (data.roundOff ?? 0);
  lines.push(twoCol("TOTAL PAYABLE", `Rs. ${formatNum(payable)}`));
  lines.push(dbl);
  lines.push("");
  if (on(s?.showPaymentMode)) {
    lines.push(twoCol("Payment Method :", data.paymentMethod));
    lines.push("");
  }
  if (on(s?.showTenderAmount)) {
    lines.push(twoCol("Paid Amount    :", `Rs. ${formatNum(data.amountPaid)}`));
    if (data.change) lines.push(twoCol("Change         :", `Rs. ${formatNum(data.change)}`));
  }
  if (on(s?.showInWords, false) && data.amountInWords) {
    lines.push("");
    lines.push(data.amountInWords);
  }
  if (on(s?.showBilledBy) && data.billedBy) {
    lines.push(twoCol("Billed By      :", data.billedBy));
  }
  if (on(s?.showKotNumber) && data.kotNumbers?.length) {
    lines.push(twoCol("KOT No         :", data.kotNumbers.join(",")));
  }
  if (on(s?.showServiceDuration, false) && data.serviceDuration) {
    lines.push(twoCol("Service Duration:", data.serviceDuration));
  }
  lines.push("");
  lines.push(thin);
  lines.push(padCenter(s?.footerHeader || "Thank You!"));
  lines.push(padCenter(s?.footerRemarks || "Please Visit Again."));
  if (data.websiteUrl) lines.push(padCenter(data.websiteUrl));
  if (data.footer) lines.push(padCenter(data.footer));

  const body = lines.map(escapeHtml).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.billNo)}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; padding: 4mm 0; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
</style></head><body>
<pre>${body}</pre>
</body></html>`;
}

/** Wider than the 80mm invoice — the order slip is printed on A5/A4 stock. */
const SLIP_WIDTH = 72;

/**
 * Order Slip — the front-of-house summary of everything a table has ordered.
 *
 * Distinct from the KOT: the kitchen docket covers one round and carries no
 * prices, whereas this is the whole table's running order with money on it,
 * used to check the table before billing. It lists every KOT the party has
 * generated so a slip can be traced back to the dockets behind it.
 */
export function formatOrderSlipHTML(data: {
  orderTypeLabel: string;
  tableLabel?: string | null;
  /** Pre-formatted, e.g. "03 Aug 2026 12:25 AM". */
  orderedAt: string;
  /** Running / Billed / Served … whatever the table's rounds add up to. */
  status: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  /** Every KOT number the table's rounds have been issued. */
  kotNumbers: Array<number | string>;
  printedBy: string;
  printedAt: string;
}) {
  const thin = "-".repeat(SLIP_WIDTH);

  const slipRow = (sn: string, name: string, qty: string, price: string) => {
    const snCol = sn.padEnd(4);
    const qtyCol = qty.padStart(8);
    const priceCol = price.padStart(12);
    const nameWidth = SLIP_WIDTH - snCol.length - qtyCol.length - priceCol.length;
    const nameCol =
      name.length > nameWidth ? name.slice(0, nameWidth - 1) + "…" : name.padEnd(nameWidth);
    return snCol + nameCol + qtyCol + priceCol;
  };

  const lines: string[] = [];
  lines.push(padCenter("Order Slip", SLIP_WIDTH));
  lines.push("");
  // Type on the left, table on the right of the same line — mirrors the slip
  // a cashier is used to reading at a glance.
  lines.push(
    twoCol(
      `Type: ${data.orderTypeLabel}`,
      data.tableLabel ? `Table: ${data.tableLabel}` : "",
      SLIP_WIDTH
    )
  );
  lines.push(`Order At: ${data.orderedAt}`);
  lines.push(`Status: ${data.status}`);
  lines.push(thin);
  lines.push(slipRow("S.N", "Dishes", "QTY", "Price"));
  lines.push(thin);
  data.items.forEach((item, idx) => {
    lines.push(slipRow(`${idx + 1}.`, item.name, String(item.qty), formatNum(item.price)));
  });
  lines.push(thin);
  lines.push(twoCol("Total", `Rs ${formatNum(data.total)}`, SLIP_WIDTH));
  lines.push(thin);
  lines.push("");
  if (data.kotNumbers.length > 0) {
    lines.push(`KOT NO: ${data.kotNumbers.join(",")}`);
  }
  lines.push(`Printed By: ${data.printedBy}`);
  lines.push(`Printed At: ${data.printedAt}`);
  lines.push("");
  lines.push(padCenter("Thank You!", SLIP_WIDTH));

  const body = lines.map(escapeHtml).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Order Slip</title>
<style>
  @page { margin: 8mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
</style></head><body>
<pre>${body}</pre>
</body></html>`;
}

/** The subset of Settings → KOT Setting the docket renderer reads. */
export interface KotPrintSettings {
  showKotNo?: boolean;
  showOrderType?: boolean;
  showTable?: boolean;
  showOrderBy?: boolean;
  showTime?: boolean;
  tableAsSubHeading?: boolean;
  showSN?: boolean;
  showDishes?: boolean;
  showQty?: boolean;
  showTotal?: boolean;
  fontSize?: number;
  compactView?: boolean;
  showKotRemarks?: boolean;
  showDishRemarks?: boolean;
  showPrintedBy?: boolean;
  showPrintedAt?: boolean;
  footerText?: string;
  /** KOT_FOOTER | BELOW_DISH */
  dishRemarksPosition?: string;
}

/**
 * Kitchen Order Ticket (KOT) — the docket the kitchen cooks from.
 *
 * Deliberately price-free and set in much larger type than the customer
 * receipt: it is read at a glance across a hot, busy pass, so quantity and
 * item name dominate and special instructions are called out rather than
 * tucked away.
 */
export function formatKOTHTML(data: {
  kotNumber: number | string;
  /** Omitted from the docket when the order has no table (delivery/takeaway). */
  tableLabel?: string | null;
  orderTypeLabel: string;
  waiterName: string;
  /** Pre-formatted, e.g. "29 Jul 2026 10:22 PM". */
  orderedAt: string;
  items: Array<{ name: string; qty: number; notes?: string | null }>;
  reprint?: boolean;
  /** Docket-level note, distinct from the per-dish remarks. */
  kotRemarks?: string | null;
  printedBy?: string | null;
  printedAt?: string | null;
  /** Settings → KOT Setting. Omitted means "print everything". */
  settings?: KotPrintSettings | null;
}) {
  const s = data.settings;
  const on = (v: boolean | undefined, fallback = true) => v ?? fallback;
  const totalDishes = data.items.length;
  const totalQty = data.items.reduce((s2, i) => s2 + i.qty, 0);
  const fontSize = s?.fontSize ?? 13;
  const gap = s?.compactView ? 1 : 3;
  // Dish notes either sit under each dish or collect in the footer.
  const notesInFooter = (s?.dishRemarksPosition ?? "KOT_FOOTER") === "KOT_FOOTER";
  const showDishRemarks = on(s?.showDishRemarks);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>KOT ${escapeHtml(String(data.kotNumber))}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; font-size: ${fontSize}px; width: 72mm; margin: 0 auto; padding: 4mm 0; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .kot-title { font-size: ${fontSize + 8}px; font-weight: bold; }
  .table-label { font-size: ${fontSize + 3}px; font-weight: bold; margin-top: 3px; }
  .meta { margin-top: 2px; }
  .divider { border-top: 1px dashed #000; margin: ${gap * 2}px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: bold; padding-bottom: 2px; }
  td { padding: ${gap}px 0; vertical-align: top; }
  .qty-col { text-align: right; white-space: nowrap; }
  .sn-col { width: 26px; }
  .notes { font-size: ${Math.max(fontSize - 2, 8)}px; font-style: italic; padding-left: 26px; }
  .reprint { border: 2px solid #000; padding: 2px; font-weight: bold; margin-bottom: 5px; }
  .thanks { margin-top: 10px; }
  .footer-note { margin-top: 6px; font-size: ${Math.max(fontSize - 2, 8)}px; }
</style></head><body>
  ${data.reprint ? `<div class="center reprint">*** REPRINT ***</div>` : ""}
  ${on(s?.showKotNo) ? `<div class="center kot-title">KOT ${escapeHtml(String(data.kotNumber))}</div>` : ""}
  ${
    on(s?.tableAsSubHeading)
      ? data.tableLabel
        ? `<div class="center table-label">Table: ${escapeHtml(data.tableLabel)}</div>`
        : `<div class="center table-label">${escapeHtml(data.orderTypeLabel)}</div>`
      : ""
  }

  ${on(s?.showOrderType) ? `<div class="meta">Type: ${escapeHtml(data.orderTypeLabel)}</div>` : ""}
  ${on(s?.showTable) && data.tableLabel ? `<div class="meta">Table: ${escapeHtml(data.tableLabel)}</div>` : ""}
  ${on(s?.showOrderBy) ? `<div class="meta">Order By: ${escapeHtml(data.waiterName)}</div>` : ""}
  ${on(s?.showTime) ? `<div class="meta">Order At: ${escapeHtml(data.orderedAt)}</div>` : ""}

  <div class="divider"></div>
  <table>
    <tr>${on(s?.showSN) ? `<th class="sn-col">S.N</th>` : ""}${
      on(s?.showDishes) ? `<th>Dishes</th>` : "<th></th>"
    }${on(s?.showQty) ? `<th class="qty-col">QTY</th>` : ""}</tr>
  </table>
  <div class="divider"></div>
  <table>
    ${data.items
      .map(
        (i, idx) => `<tr>
          ${on(s?.showSN) ? `<td class="sn-col">${idx + 1}.</td>` : ""}
          <td>${escapeHtml(i.name)}${
            i.notes && showDishRemarks && !notesInFooter
              ? `<div class="notes">** ${escapeHtml(i.notes)}</div>`
              : ""
          }</td>
          ${on(s?.showQty) ? `<td class="qty-col">${i.qty}</td>` : ""}
        </tr>`
      )
      .join("")}
    ${
      on(s?.showTotal)
        ? `<tr class="bold">
      <td colspan="2">Total (Dishes/QTY)</td>
      <td class="qty-col">${totalDishes}/${totalQty}</td>
    </tr>`
        : ""
    }
  </table>
  <div class="divider"></div>

  ${
    on(s?.showKotRemarks) && data.kotRemarks
      ? `<div class="footer-note"><b>KOT Remarks:</b><br>${escapeHtml(data.kotRemarks)}</div>`
      : ""
  }
  ${
    showDishRemarks && notesInFooter && data.items.some((i) => i.notes)
      ? `<div class="footer-note"><b>Dish Remarks:</b><br>${data.items
          .map((i, idx) => (i.notes ? `(${idx + 1}) ${escapeHtml(i.name)}: ${escapeHtml(i.notes)}` : null))
          .filter(Boolean)
          .join("<br>")}</div>`
      : ""
  }
  ${on(s?.showPrintedBy) && data.printedBy ? `<div class="footer-note">Printed By: ${escapeHtml(data.printedBy)}</div>` : ""}
  ${on(s?.showPrintedAt) && data.printedAt ? `<div class="footer-note">Printed At: ${escapeHtml(data.printedAt)}</div>` : ""}

  <div class="center thanks">${escapeHtml(s?.footerText || "Thank You!")}</div>
</body></html>`;
}

/**
 * Saves a receipt/docket to a file.
 *
 * Writes the same self-contained HTML that `printReceipt` sends to the printer,
 * so the saved copy is byte-identical to the paper one — it opens in any
 * browser and can be re-printed or saved as PDF from there. Kept dependency
 * free on purpose: generating a true PDF client-side needs a library, which
 * isn't worth pulling in just to archive a bill.
 *
 * Returns false if the browser blocks the download.
 */
export function downloadReceipt(html: string, filename: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(".html") ? filename : `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a receipt/docket to the printer.
 *
 * Uses a hidden same-page iframe rather than `window.open`: a popup is blocked
 * by default in most browsers unless the click is trusted all the way through,
 * and a blocked popup fails *silently* — the cashier taps Print and nothing at
 * all happens. An iframe is never popup-blocked.
 *
 * Returns false only when the document itself can't be created, so callers can
 * surface a real error instead of leaving the user guessing.
 */
export function printReceipt(html: string): boolean {
  if (typeof document === "undefined") return false;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Kept on-page but visually nowhere: `display:none` stops some browsers
  // rendering the document at all, which prints a blank sheet.
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  // onload and the fallback timer can both fire; without this the user gets
  // two print dialogs (and two dockets).
  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    const win = iframe.contentWindow;
    if (!win) return cleanup();
    // Tear down once the print dialog closes; the timeout is a backstop for
    // browsers that never fire afterprint (and so would leak the iframe).
    win.addEventListener?.("afterprint", cleanup);
    setTimeout(cleanup, 60_000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  // Wait for the written document to be laid out, or the sheet comes out blank.
  if (doc.readyState === "complete") {
    setTimeout(run, 50);
  } else {
    iframe.onload = run;
    setTimeout(run, 500); // fallback if onload doesn't fire for a written doc
  }

  return true;
}

export function generateESCPOS(data: {
  restaurantName: string;
  billNumber: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  paid: number;
  change: number;
}): Uint8Array {
  const lines: string[] = [
    `\x1b\x61\x01${data.restaurantName}\x0a`,
    `\x1b\x61\x00Bill: ${data.billNumber}\x0a`,
    "-".repeat(32) + "\x0a",
    ...data.items.map(
      (i) => `${i.name} x${i.qty} ${(i.price * i.qty).toFixed(2)}\x0a`
    ),
    "-".repeat(32) + "\x0a",
    `TOTAL: ${data.total.toFixed(2)}\x0a`,
    `PAID: ${data.paid.toFixed(2)}\x0a`,
    `CHANGE: ${data.change.toFixed(2)}\x0a`,
    "\x0a\x1b\x61\x01Thank you!\x0a",
    "\x0a\x0a\x0a\x0a\x0a\x1d\x56\x00",
  ];
  const encoder = new TextEncoder();
  return encoder.encode(lines.join(""));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNum(n: number) {
  return n.toFixed(2);
}

/** Pulls the plain-text receipt back out of the printable HTML. */
export function extractReceiptText(html: string): string {
  const match = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!match) return "";
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Builds a real PDF from monospace receipt text.
 *
 * Hand-rolled rather than pulling in a PDF library: the receipt is already
 * plain text in a fixed-width font, which is the one case a PDF can be
 * assembled in a few dozen lines. Uses the standard Courier face, so no font
 * has to be embedded.
 */
export function buildTextPdf(text: string, opts?: { fontSize?: number }): Blob {
  const fontSize = opts?.fontSize ?? 9;
  const leading = fontSize * 1.25;
  const marginX = 36; // 0.5in
  const marginY = 40;

  // Courier advance width is exactly 0.6em, so the page can be sized to fit
  // the widest line instead of guessing at A4 and clipping the invoice rules.
  const rawLines = text.replace(/\r/g, "").split("\n");
  const widest = rawLines.reduce((m, l) => Math.max(m, l.length), 0);
  const pageWidth = Math.ceil(marginX * 2 + widest * fontSize * 0.6);
  const pageHeight = Math.ceil(marginY * 2 + rawLines.length * leading);

  // Courier's built-in encoding has no box-drawing glyphs; fall back to the
  // ASCII rules the same layout reads fine with.
  const asciiFold = (s: string) =>
    s
      .replace(/[═━]/g, "=")
      .replace(/[─―—–]/g, "-")
      .replace(/[│┃]/g, "|")
      .replace(/…/g, "...")
      // Anything still outside Latin-1 can't be encoded by the standard font.
      .replace(/[^\x20-\x7E]/g, "?");

  // Backslash and both parens are PDF string metacharacters.
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const body = rawLines
    .map((line, i) => {
      const y = pageHeight - marginY - i * leading;
      return `BT /F1 ${fontSize} Tf ${marginX} ${y.toFixed(2)} Td (${escape(asciiFold(line))}) Tj ET`;
    })
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];

  // Assemble with a byte-accurate xref table — viewers reject a wrong one.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  // Latin-1 so each char is one byte — otherwise the xref offsets computed
  // above (string indices) wouldn't match the encoded byte positions.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

/** Saves a receipt as a real .pdf. Returns false if the browser blocks it. */
export function downloadReceiptPdf(html: string, filename: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const blob = buildTextPdf(extractReceiptText(html));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
