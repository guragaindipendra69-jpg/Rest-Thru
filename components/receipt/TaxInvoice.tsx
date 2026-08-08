import * as React from "react";
import { cn } from "@/lib/utils";
import { amountInWords } from "@/lib/billing/amount-in-words";
import { headerFor } from "@/lib/billing/config";
import { digitalPaymentRebate } from "@/lib/billing/calculate";
import type { TaxInvoicePayload } from "@/lib/billing/receipt";

/**
 * IRD Nepal compliant bill document. Implements sections 3 to 9 of
 * bill-design.md.
 *
 * Designed for an 80mm thermal roll first (the dominant restaurant printer in
 * Nepal) and degrades to A4/screen. Layout uses a fixed character-grid feel so
 * the printed output matches the on-screen preview.
 *
 * Two classes of field are rendered here and they are NOT treated the same:
 *
 *   Compliance fields (header text, PAN, VAT line, buyer PAN above threshold,
 *   amount in words, void watermark) are driven by registration type and
 *   thresholds. They are deliberately NOT wired to the InvoiceSetting show*
 *   toggles, because letting an outlet switch off its own PAN or VAT line is
 *   how a bill becomes non-compliant.
 *
 *   Presentation fields (SN column, HS code, order type, served-by, footer
 *   text) follow the outlet's InvoiceSetting toggles.
 */

export type TaxInvoiceProps = TaxInvoicePayload & {
  className?: string;
};

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2 tabular-nums", strong && "font-bold")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const Rule = ({ dashed }: { dashed?: boolean }) => (
  <div className={cn("my-1 border-t border-black", dashed && "border-dashed")} />
);

export function TaxInvoice({
  calculation,
  config,
  registrationType,
  outlet,
  buyer,
  invoiceNumber,
  billDateBS,
  billDateAD,
  paymentMethod,
  amountPaid,
  change,
  billedBy,
  tableLabel,
  orderType,
  customerName,
  isReprint = false,
  isVoid = false,
  voidReason,
  options = {},
  className,
}: TaxInvoiceProps) {
  const {
    showSN = false,
    showHSCode = false,
    showRate = true,
    showQty = true,
    showInWords = true,
    showPaymentMode = true,
    showBilledBy = true,
    footerHeader = "Thank You",
    footerRemarks = "Thank you for your visit! Visit again",
    qrImageUrl,
  } = options;

  const isVat = registrationType === "VAT";
  const header = headerFor(registrationType, calculation.isAbbreviated);
  const isDigital = paymentMethod !== "cash";
  const rebate = digitalPaymentRebate(calculation, config, isDigital);

  // Parse the ISO date string for display formatting
  const billDate = new Date(billDateAD);

  // A buyer PAN is mandatory above the threshold, and always for B2B, whatever
  // the amount. Section 5.
  const panMandatory = calculation.buyerPanRequired || Boolean(buyer?.isBusiness);
  const panMissing = panMandatory && !buyer?.panNumber;

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[302px] bg-white p-3 font-mono text-[11px] leading-tight text-black",
        "print:max-w-none print:p-0",
        className
      )}
      data-bill-root
    >
      {/* Reprints are watermarked because the Taxpayer Incentive Prize Program
          requires the ORIGINAL invoice to claim a prize. */}
      {isReprint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-30deg] text-2xl font-bold tracking-widest text-black/10">
            DUPLICATE
          </span>
        </div>
      )}

      {/* ── Seller block. Always shown, both registration types. Section 4. ── */}
      <div className="text-center">
        {outlet.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={outlet.logoUrl} alt="" className="mx-auto mb-1 h-10 w-auto object-contain" />
        )}
        <div className="text-[13px] font-bold uppercase">{outlet.legalName}</div>
        <div className="whitespace-pre-line">{outlet.address}</div>
        {outlet.phone && <div>Tel: {outlet.phone}</div>}
        {/* PAN always. VAT number only when VAT-registered, as its own labeled
            field so it is never conflated with the PAN. */}
        <div>PAN: {outlet.panNumber}</div>
        {isVat && outlet.vatNumber && <div>VAT No: {outlet.vatNumber}</div>}
        {outlet.branchCode && <div>Branch: {outlet.branchCode}</div>}
      </div>

      <Rule />
      <div className="text-center text-[12px] font-bold uppercase tracking-wide">{header}</div>
      {isVoid && (
        <div className="mt-0.5 text-center text-[11px] font-bold uppercase">
          *** VOID{voidReason ? `: ${voidReason}` : ""} ***
        </div>
      )}
      <Rule />

      {/* ── Invoice meta ── */}
      <div className="space-y-0.5">
        <Row label="Invoice No" value={invoiceNumber} />
        <Row label="Date (BS)" value={billDateBS || "-"} />
        <Row label="Date (AD)" value={billDate.toLocaleString("en-GB", { hour12: false })} />
        {tableLabel && <Row label="Table" value={tableLabel} />}
        {orderType && <Row label="Order Type" value={orderType.replace(/_/g, " ")} />}
        {customerName && <Row label="Customer" value={customerName} />}
      </div>

      {/* ── Buyer block. Conditional per section 5. ── */}
      {(buyer?.name || panMandatory) && (
        <>
          <Rule dashed />
          <div className="space-y-0.5">
            {buyer?.name && <Row label="Buyer" value={buyer.name} />}
            {buyer?.address && <Row label="Address" value={buyer.address} />}
            <Row label="Buyer PAN" value={buyer?.panNumber || (panMandatory ? "REQUIRED" : "-")} />
          </div>
          {panMissing && (
            <div className="mt-0.5 text-[10px] font-bold">
              Buyer PAN required for this amount.
            </div>
          )}
        </>
      )}

      <Rule />

      {/* ── Line items. Section 7. ── */}
      <div className="flex justify-between gap-1 font-bold">
        <span className="flex-1">{showSN ? "# Item" : "Item"}</span>
        {showQty && <span className="w-7 text-right">Qty</span>}
        {showRate && <span className="w-14 text-right">Rate</span>}
        <span className="w-16 text-right">Amount</span>
      </div>
      <Rule dashed />

      <div className="space-y-0.5">
        {calculation.lines.map((line, i) => (
          <div key={`${line.description}-${i}`}>
            <div className="flex justify-between gap-1">
              <span className="flex-1 break-words">
                {showSN && `${i + 1}. `}
                {line.description}
                {line.unit ? ` (${line.unit})` : ""}
                {/* Schedule 1 items must be visibly distinguished, since they
                    are excluded from the taxable base entirely. */}
                {line.vatExempt && <span className="font-bold"> [EXEMPT]</span>}
              </span>
              {showQty && <span className="w-7 text-right tabular-nums">{line.quantity}</span>}
              {showRate && (
                <span className="w-14 text-right tabular-nums">{money(line.unitPrice)}</span>
              )}
              <span className="w-16 text-right tabular-nums">{money(line.lineTotal)}</span>
            </div>
            {showHSCode && line.hsCode && (
              <div className="pl-2 text-[10px]">HS: {line.hsCode}</div>
            )}
          </div>
        ))}
      </div>

      <Rule />

      {/* ── Totals. Sequencing per section 8. ── */}
      <div className="space-y-0.5">
        <Row label="Gross Subtotal" value={money(calculation.grossSubtotal)} />

        {calculation.discountAmount > 0 && (
          <Row label="Discount" value={`- ${money(calculation.discountAmount)}`} />
        )}

        {calculation.exemptValue > 0 && (
          <Row label="Exempt Value" value={money(calculation.exemptValue)} />
        )}

        {calculation.serviceCharge > 0 && (
          <Row
            label={`Service Charge${
              calculation.pricingMode === "INCLUSIVE" ? " (incl.)" : ""
            }`}
            value={money(calculation.serviceCharge)}
          />
        )}

        {/* VAT lines are shown for VAT-registered outlets only, and NEVER for
            PAN-only, which must not imply a VAT charge. */}
        {isVat && (
          <>
            <Row label="Taxable Value" value={money(calculation.taxableValue)} />
            <Row label={`VAT @ ${calculation.vatRate}%`} value={money(calculation.vatAmount)} />
          </>
        )}
      </div>

      <Rule />
      <div className="text-[13px]">
        <Row label="GRAND TOTAL" value={`Rs ${money(calculation.grandTotal)}`} strong />
      </div>

      {/* Abbreviated invoices carry a VAT-inclusive note rather than a split
          VAT line. Rule 17(Ka). */}
      {isVat && calculation.isAbbreviated && (
        <div className="mt-1 text-center text-[10px]">Price inclusive of VAT</div>
      )}

      {/* Grand total in words. Section 9. */}
      {showInWords && (
        <>
          <Rule dashed />
          <div className="text-[10px]">
            <span className="font-bold">In words: </span>
            {amountInWords(calculation.grandTotal)}
          </div>
        </>
      )}

      <Rule />
      <div className="space-y-0.5">
        {showPaymentMode && (
          <Row label="Payment" value={paymentMethod.replace(/_/g, " ").toUpperCase()} />
        )}
        {amountPaid != null && (
          <Row label="Amount Paid" value={`Rs ${money(amountPaid)}`} />
        )}
        {change != null && change > 0 && (
          <Row label="Change" value={`Rs ${money(change)}`} />
        )}
        {showBilledBy && billedBy && <Row label="Billed By" value={billedBy} />}
      </div>

      {/* Digital-payment VAT rebate note. Section 13. VAT-linked only. */}
      {isVat && isDigital && rebate > 0 && (
        <div className="mt-1 text-[10px]">
          Pay digitally to receive a VAT rebate via IRD. Eligible rebate: Rs {money(rebate)} (
          {config.digitalVatRebatePercent}% of VAT).
        </div>
      )}

      {/* Prize-program eligibility. Section 12. */}
      {calculation.grandTotal >= config.prizeProgramMinimum && !isReprint && (
        <div className="mt-1 text-[10px]">
          This bill is eligible for the IRD Taxpayer Incentive Prize Program.
        </div>
      )}

      {qrImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImageUrl} alt="" className="mx-auto mt-2 h-20 w-20 object-contain" />
      )}

      <Rule />
      {/* Authorized signatory line. Section 9. */}
      <div className="mt-3 text-center text-[10px]">
        <div className="mx-auto w-40 border-t border-black pt-0.5">Authorized Signatory</div>
      </div>

      <div className="mt-2 text-center">
        <div className="font-bold">{footerHeader}</div>
        <div className="text-[10px]">{footerRemarks}</div>
      </div>
    </div>
  );
}

export default TaxInvoice;
