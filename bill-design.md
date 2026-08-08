# IRD Nepal Compliant Bill: Design and Generation Spec
For: Restaurant Management App (POS / Billing Module)
Scope: VAT-registered and PAN-only, with CBMS real-time e-billing, English-only UI
Compiled: August 2026, FY 2082/83 to FY 2083/84 (Finance Act 2083, "2026/27")

## Instructions for anyone (human or AI) editing or extending this file

1. No em dashes or en dashes anywhere in this document. Use a period, comma, colon, or the word "to" instead.
2. No emojis or decorative symbols anywhere in this document, including in section headers, callouts, or checklists. Use plain words such as "Note:", "Warning:", or "Unconfirmed:" instead.
3. No hardcoded objects in the spec or in any code generated from it. Every rate, threshold, header string, and percentage mentioned below (VAT rate, service charge percent, buyer-PAN threshold, abbreviated-invoice threshold, CBMS turnover threshold) must be implemented as a named, configurable value (config file, database setting, or constant with a clear name) rather than a literal typed directly into calculation or rendering logic. This is because Nepal's Finance Act changes these figures most fiscal years, and hardcoding them means a code release every time a number changes.
4. Where source data conflicts (marked "Unconfirmed" below), do not silently pick one value and present it as settled. Keep it configurable and flag it for legal confirmation.
5. Keep language plain and factual. Do not add promotional framing, filler summaries, or restated conclusions that were not asked for.

Legal disclaimer: This document is compiled from IRD notices, news coverage, tax-advisory blogs, and one community-sourced API doc. It is an engineering spec, not legal advice. Several figures below have conflicting values across sources (marked "Unconfirmed"). Before shipping, have a Nepali tax advisor or chartered accountant confirm: the buyer-PAN threshold, the CBMS turnover threshold, and the current CBMS API contract with IRD or your CBMS-listed software vendor. Rules also change every Nepali fiscal year (Shrawan 1) via the Finance Act. Re-verify annually.

---

## 1. Legal basis

| Instrument | Governs |
|---|---|
| Value Added Tax Act, 2052 (1996) | VAT rate, registration, invoicing obligation (Sec. 10, 16, 25) |
| VAT Rules, 2053 (1996), Rule 17 | Prescribed tax-invoice format. Rule 17(Ka): abbreviated invoice for high-volume retail (restaurants, supermarkets, pharmacies, petrol pumps) |
| Income Tax Act, 2058 (2002) | PAN requirement, PAN-bill basis for non-VAT taxpayers |
| Electronic Billing Procedure, 2074 (incl. 4th Amendment, 2021) | E-billing/CBMS software approval, technical and hosting requirements |
| Finance Act 2083 (FY 2026/27, "Finance Act 2026/27") | Current-year rate/threshold amendments (VAT unchanged at 13 percent; electricity VAT; digital-payment VAT rebate; taxpayer incentive program) |
| Consumer Protection Act, 2075 (2018) plus Kathmandu District Court / Supreme Court rulings (2023) | Menu-price inclusivity: restaurants and hotels barred from adding VAT plus service charge on top of the listed menu price |
| Taxpayer Incentive Gift Programme Operation Procedure, 2026 | Consumer lucky-draw tied to registered invoices |

---

## 2. Registration-type decision logic (core conditional gate)

Every seller profile in the app must be tagged with a registration type, which drives every downstream rule. Ask this once at outlet setup, and re-check turnover quarterly.

```
IF outlet is a hotel, bar, or restaurant operating as part of a group,
   chain, or brand OR classified by IRD circular as a "specified sector"
   THEN VAT registration is mandatory from first sale, regardless of turnover.
   Unconfirmed: some sources list "hotel and restaurant chains" as a
   mandatory-VAT sector; independent single-outlet eateries are generally
   threshold-based. Confirm outlet's own status against its VAT
   certificate, not by inferring from business type alone.

ELSE IF rolling 12-month turnover exceeds NPR 30,00,000 (30 lakh)
   THEN VAT registration is mandatory (restaurants count as a "mixed"
   goods-plus-services business, so the services/mixed threshold applies,
   not the 50-lakh goods-only threshold).

ELSE IF outlet holds a VAT certificate voluntarily (Sec. 9)
   THEN treat as VAT-registered.

ELSE
   treat as PAN-only ("Bill" / cash memo): no VAT charged, no VAT line.
```

Outlet profile fields required:
- `registration_type`: enum `VAT` or `PAN_ONLY`
- `pan_number` (9 digits, always required, with or without VAT)
- `vat_number` (same as PAN once VAT-registered in Nepal; store separately for clarity)
- `vat_registration_date`
- `fiscal_year_turnover_rolling` (used to auto-alert when nearing the 30-lakh threshold; trigger an in-app "register for VAT" warning at roughly 90 percent of the configured threshold)
- `cbms_required` (boolean; see section 9)

---

## 3. Bill header (conditional)

| Registration type | Header text | Language |
|---|---|---|
| VAT-registered | "Tax Invoice" (or "kar bijak") | English (per current setting; a Nepali toggle can be added later) |
| PAN-only | "Bill" or "Invoice" (never "Tax Invoice"; do not imply VAT was charged) | English |
| Abbreviated (VAT, transaction at or below the configured abbreviated-invoice threshold, see section 7) | "Tax Invoice (Abbreviated)" or "Cash Bill" per Rule 17(Ka) | English |

Never let a PAN-only outlet print "Tax Invoice." This misrepresents a VAT charge and is a compliance and legal risk. The header string must be pulled from a config map keyed by `registration_type`, not written inline in the receipt template.

---

## 4. Seller details block (always shown, both registration types)

- Registered business/trade name
- Full physical address (ward, municipality, district)
- Phone number
- PAN number (always)
- VAT number, only if VAT-registered. Render as a separate labeled field; do not conflate with PAN
- Outlet/branch code, if multi-branch (for consolidated CBMS reporting)

---

## 5. Buyer details block (conditional)

| Condition | Buyer fields required |
|---|---|
| Transaction at or below the configured buyer-PAN threshold (default NPR 10,000; see Unconfirmed note below) | None mandatory; name optional |
| Transaction above the configured buyer-PAN threshold | Buyer name and PAN recommended/required |
| Buyer is a registered business (B2B, e.g. corporate catering, banquet booking) | Buyer name, address, and PAN/VAT number mandatory, regardless of amount |
| Buyer requests a full tax invoice for a smaller amount | Must be issued on request even under the abbreviated-invoice threshold |

Unconfirmed: source data conflicts on the buyer-PAN-mandatory threshold. Some guides cite NPR 10,000, others cite NPR 1,00,000 (1 lakh). Implement this as a configurable value, `buyer_pan_threshold`, default `10000`, rather than a literal in code, so the business can align it once confirmed with their accountant, and so an IRD circular change does not require a code release.

---

## 6. Invoice numbering and dates

- Serial number resets at the start of each Nepali fiscal year (Shrawan 1).
- Recommended format: `{FiscalYear}-{SequentialNumber}`, for example `2082/83-00142`. The sequence must be unbroken: no gaps, no reuse, no manual override. Voided or cancelled bills still consume a serial number and must be marked void, not deleted (IRD audit trail requirement).
- Store both Bikram Sambat (BS) and AD dates on every record. BS is what prints on the bill; AD is useful for backend reconciliation.
- A separate numbering series per outlet/branch, prefixed by branch code, is recommended to avoid CBMS sync collisions.
- Credit notes and sales returns get their own numbering series, referencing the original invoice number (required field for the CBMS credit-note submission; see section 9).

---

## 7. Item breakdown

Each line item:
- Description (menu item name)
- Quantity
- Unit (for example plate, piece, glass). HS codes apply to imported/traded goods, not prepared food and beverage service; skip the HS code field for standard menu items, but keep it available as an optional field for retail/packaged-goods add-ons such as bottled beverages, in case the outlet needs it for import-linked SKUs.
- Rate per unit
- Line total
- VAT-exempt flag per line (Schedule 1 items, for example raw exempt goods sold over the counter at a grocery- or bakery-attached outlet; not typical for a la carte dining). Never apply the VAT rate to a Schedule-1-flagged line.

---

## 8. Financial calculation: sequencing rules (read this section first)

### 8.1 The menu-price-inclusive rule (highest priority)

Following a 2023 Supreme Court ruling (upholding a Kathmandu District Court decision) and Consumer Protection Act enforcement by the Department of Commerce, Supplies and Consumer Protection, restaurants and hotels may not print a menu price and then add VAT plus service charge on top of it at the bill. Menu prices are expected to already be VAT-inclusive, and per that ruling, service-charge-inclusive too. Businesses that still add these as separate line items risk fines (a range of roughly NPR 200,000 to 300,000 has been cited in reporting) under consumer-protection enforcement, even though this remains a point of active disagreement with the Restaurant and Bar Association Nepal, and industry practice is mixed as of 2026.

Design implication: build the calculation engine to support both modes, selectable per outlet via a `pricing_mode` setting, with the additive mode flagged in-app as "higher legal risk, confirm with your tax advisor":

- Mode A, Inclusive pricing (lower legal risk): menu price equals the final price to the guest. VAT (and service charge, if charged) is back-calculated for the printed bill, the internal VAT ledger, and the CBMS payload, rather than stacked on top of what the guest sees on the menu.
- Mode B, Additive pricing (legacy/common practice): menu price is the pre-VAT, pre-service-charge base; service charge and VAT are calculated and added as separate lines, as shown in section 8.2.

### 8.2 Calculation order (Mode B, additive)

```
1. Sum item line totals                          = Gross Subtotal
2. Apply itemized discount (if any)               = Net Subtotal (Taxable Value)
3. Apply Service Charge (commonly 10 percent, not
   legally mandated; outlet-configurable percent) on Net Subtotal
   Subtotal + Service Charge = Service-Inclusive Amount
4. Apply VAT (configured rate, currently 13 percent) on the
   Service-Inclusive Amount (industry-standard practice: VAT is
   computed on food plus service charge combined, not on food alone)
5. Grand Total = Service-Inclusive Amount + VAT
```

Worked example (Mode B, using default configured values): NPR 2,000 food, plus 10 percent service charge (NPR 200) equals NPR 2,200, plus 13 percent VAT (NPR 286), equals a grand total of NPR 2,486.

- Discounts are always applied before VAT calculation. VAT applies to the net price after discount, never the pre-discount price.
- VAT-exempt line items (Schedule 1) are excluded from the taxable-value base entirely. Compute two subtotals (taxable and exempt) if the outlet ever mixes them.
- Round the final VAT amount and grand total per IRD convention: round the total, not each line before summing, to avoid mismatches against CBMS.

### 8.3 Abbreviated invoice (Rule 17(Ka))

For over-the-counter transactions at or below the configured abbreviated-invoice threshold (default NPR 10,000, the typical dine-in/takeaway ticket), VAT-registered restaurants may print:
- A "VAT inclusive" note instead of a separate VAT line
- No mandatory buyer PAN
- A single copy (no triplicate requirement)
- Note: a full itemized tax invoice must still be issued on customer request, even under this threshold. Provide a "Generate Full Invoice" action on any ticket regardless of amount.

---

## 9. Totals and authorization

- Grand total printed in figures and in words, for example "Rs 2,486.00, Two Thousand Four Hundred Eighty-Six Rupees Only." Build a Nepali-context number-to-words function that reads naturally for NPR amounts, including the switch to "lakh" past 99,999 rather than "hundred thousand."
- Authorized signature or stamp line. For digital tickets, a printed "Authorized Signatory" line with the outlet's registered digital signature (valid under the Electronic Transactions Act) or the cashier's name/ID is sufficient. A physical stamp is only needed where a wet-ink copy is retained.
- Retain every invoice (original and duplicate, digital or physical) for 6 years per Rule 23. Build this into the data-retention/archival policy, not just the receipt printer.

---

## 10. VAT-registered vs PAN-only: full field comparison

| Field | VAT-registered | PAN-only |
|---|---|---|
| Header | "Tax Invoice" | "Bill" |
| VAT number shown | Yes | No, PAN only |
| VAT percent line | Yes (configured rate, currently 13 percent; split by rate if applicable, see section 11) | Never shown |
| Taxable value line | Yes | Not applicable; show plain amount |
| Buyer PAN | Conditional (section 5) | Not required |
| CBMS sync | Required if outlet crosses the configured turnover threshold (section 14) | Not applicable; PAN-only outlets are outside the CBMS mandate |
| Serial numbering reset | Fiscal-year based | Fiscal-year based (same discipline recommended even though not legally distinct for PAN bills) |
| Copies | Triplicate (buyer, IRD-record, book-retained) unless abbreviated | Single copy acceptable |
| Digital-payment VAT rebate eligibility (section 13) | Yes | No; the rebate is VAT-linked, not applicable to PAN-only sales |
| Taxpayer Incentive Prize Program eligibility | Yes | Yes; PAN bills also qualify per IRD notices, as long as it is an original VAT or PAN bill |

---

## 11. Special-rate items (if the menu ever includes these)

- Alcoholic beverages: the standard VAT rate applies at retail sale in addition to excise already embedded upstream. Do not double-apply excise; apply VAT only at point of sale.
- Electricity is not a bill line item for a restaurant's guest invoice (it is an outlet input cost), but for a back-office/expense module: VAT on electricity applies only to consumption from Shrawan 1, 2083 (mid-July 2026) onward. Consumption up to end of Asar 2082/83, even if billed later, is VAT-exempt, and any VAT mistakenly charged is being adjusted as a credit in the following month's bill. Note also the tiered household rate (exempt at or below 50 units/month, a reduced rate above that for household category, the standard rate for non-household); relevant only when modeling the restaurant's own utility costs, not guest bills.

---

## 12. Taxpayer Incentive Prize Program integration (optional, recommended)

A consumer-facing feature, not a legal requirement for the bill itself, but a strong addition for a restaurant app:
- Every printed or digital bill above the program's configured minimum (currently NPR 100) is prize-program eligible.
- Digital payments (QR, card, mobile banking) through the outlet's payment integration are auto-registered by the payment processor/bank; no app action needed beyond ensuring the transaction reference ties back to the invoice number.
- Cash payments: the customer must self-register the bill on the IRD's prize portal or mobile app. Optional enhancement: print a QR code on the receipt that deep-links to the registration portal, pre-filled with invoice number, date, and amount, if the portal supports query-parameter prefill. Verify against the current portal capability before building this.
- Only bills issued from 17 July 2026 (Shrawan 1, 2083) onward are eligible; not relevant for new installs, but relevant if backfilling historical data.
- Store a `prize_program_eligible` boolean and an `original_invoice_retained` flag per transaction for audit purposes. Winners must present the original invoice to claim prizes, so if reprints are offered, watermark them "DUPLICATE, not valid for prize claim."

---

## 13. Digital-payment VAT rebate (restaurants, hotels, bars specifically)

IRD has designated lodging, restaurant, and bar businesses as pilot sectors for a scheme (under VAT Act Sec. 25, clause 1(B), reinforced in the FY 2026/27 budget) where a guest who pays electronically (QR, card, mobile wallet) on a VAT-registered invoice gets a percentage of the VAT amount refunded to their bank account (currently 10 percent of the VAT amount, not 10 percent of the bill).

App implications:
- Payment method must be captured per transaction: `cash`, `qr`, `card`, `mobile_wallet`, or `bank_transfer`.
- For VAT-registered outlets, when payment method is not cash, the bill/receipt should display the VAT amount clearly, since the rebate is calculated on it, and ideally a short note such as "Pay digitally to receive a VAT rebate via IRD."
- The scheme requires businesses to display rebate-availability information at the premises. This is not strictly a bill-printing requirement, but it is worth a settings flag reminding the outlet owner to post signage.
- This rebate is VAT-linked only. PAN-only outlets' guests are not eligible, since there is no VAT amount to rebate.
- The refund mechanics run through the bank/payment processor, not the app. The app's responsibility is accurate VAT-line reporting, nothing more. Keep the rebate percentage configurable (`digital_vat_rebate_percent`), not hardcoded, since it is a policy setting that can change.

---

## 14. CBMS (Central Billing Monitoring System): real-time e-billing integration

### 14.1 Who must integrate (thresholds: source figures conflict, verify the current circular)

- General businesses: mandatory above NPR 10 crore annual turnover. Some older sources cite NPR 25 crore or NPR 35 crore as historical thresholds; the figure has been lowered over successive amendments, and NPR 10 crore appears to be the current general figure as of mid-2026.
- Hotels, restaurants, and canteens specifically: mandatory above NPR 5 crore annual turnover, a materially lower bar than general businesses. A growing multi-branch restaurant should plan for this earlier than other sectors would need to.
- Any VAT-registered business may voluntarily adopt CBMS-integrated billing software even below the threshold, for a cleaner compliance and audit trail.
- Implement both threshold values as named config entries (`cbms_threshold_general`, `cbms_threshold_hospitality`), not literals.

### 14.2 Approval process (complete this before going live)

IRD requires the billing software itself, not just the business, to be listed and approved. As the software vendor/app builder, prepare (or have the restaurant's compliance owner prepare):
- Business/software registration documents
- PAN/VAT registration certificate of the taxpayer using the software
- Software purchase invoice / agreement between software provider and business
- User manual (English or Nepali)
- Sample invoices and tax reports generated by the software
- System architecture and data-backup-recovery policy
- If cloud-hosted: the central server must be located inside Nepal. If using third-party hosting, the hosting provider must itself be registered in Nepal, with servers physically in-country. Inform IRD of server location in advance and allow IRD server access on request.

### 14.3 Technical integration shape

Historical, community-documented CBMS API (verify the current endpoint and contract with a CBMS-listed vendor or IRD before building; this is from a 2018-era integration thread, and the live production endpoint or schema may have moved):

```
POST /api/bill        submit a new invoice
POST /api/billreturn  submit a credit note / sales return
```

Payload shape (fields to design the internal invoice model around, regardless of the exact live endpoint):

```json
{
  "username": "string, CBMS-issued credential",
  "password": "string, CBMS-issued credential",
  "seller_pan": "string",
  "buyer_pan": "string, optional per section 5 rules",
  "buyer_name": "string",
  "fiscal_year": "string, e.g. 2082.083",
  "invoice_number": "string",
  "invoice_date": "string, BS format",
  "total_sales": "decimal",
  "taxable_sales_vat": "decimal",
  "vat": "decimal",
  "excisable_amount": "decimal, 0 if not applicable",
  "excise": "decimal, 0 if not applicable",
  "amount_for_esf": "decimal, 0 if not applicable",
  "esf": "decimal, 0 if not applicable",
  "export_sales": "decimal, 0, not applicable to dine-in",
  "tax_exempted_sales": "decimal, Schedule 1 items only",
  "isrealtime": true,
  "datetimeClient": "ISO datetime of transaction"
}
```

Response codes to handle: `200` success. `101` bill already exists (idempotency; safe to treat as already-synced). `100` credential mismatch (alert operations immediately, do not silently drop the sale). `102`, `103`, `104` server-side or validation errors (queue for retry).

Design for offline resilience: real-time means "sync at time of sale when connectivity allows," not "billing blocks on network availability." Queue unsent invoices locally, retry with backoff, and surface a clear "N invoices pending IRD sync" indicator to outlet managers. Never let a POS terminal refuse to close a ticket because CBMS is unreachable.

---

## 15. Audit trail and data-integrity requirements (non-negotiable for CBMS-listed software)

- No silent deletion of any issued invoice. Void or cancel only, with a reason code and timestamp; original data preserved.
- Every edit to a submitted invoice must be logged (who, when, what changed). IRD explicitly checks for tamper-evidence in approved software.
- 6-year minimum retention, both for VAT invoices and, as good practice, PAN bills.
- Sales register and purchase register views. Even if the purchase side is not part of this app, keep the sales register exportable in a format matching IRD's expected register layout for monthly VAT return preparation.

---

## 16. Implementation checklist

- [ ] Outlet setup wizard captures registration type, PAN, VAT number (if any), branch code
- [ ] Header text, VAT lines, buyer-detail fields all conditionally rendered per sections 3 to 5, pulled from config, not hardcoded
- [ ] Configurable `buyer_pan_threshold`, `abbreviated_invoice_threshold`, `service_charge_percent`, `vat_rate`, `digital_vat_rebate_percent`, `cbms_threshold_general`, `cbms_threshold_hospitality`
- [ ] Pricing mode toggle (Inclusive vs Additive) per section 8.1, with an in-app compliance-risk note on Additive mode
- [ ] Fiscal-year-based serial numbering, unbroken, void not deleted
- [ ] Abbreviated-invoice logic for transactions at or below the configured threshold, with a "generate full invoice" override always available
- [ ] Grand total in figures and words
- [ ] 6-year archival policy for all invoice data
- [ ] Payment-method capture on every transaction (for the digital VAT rebate and the prize program)
- [ ] CBMS sync client: async queue, retry with backoff, idempotent resubmission, an operations-visible sync-status dashboard
- [ ] CBMS software-approval document package prepared before go-live, or confirmation that the restaurant is below threshold and integration can be deferred/voluntary
- [ ] Legal review of the buyer-PAN threshold figure, the CBMS turnover threshold figure, and the inclusive-vs-additive pricing decision, before first production release

---

## 17. Open items requiring confirmation with a Nepali tax advisor before launch

1. Exact current buyer-PAN-mandatory threshold (NPR 10,000 vs NPR 1,00,000 conflict in sources).
2. Exact current CBMS-mandatory turnover threshold for the hospitality sector specifically (NPR 5 crore cited most consistently, but confirm against the latest IRD circular, not just vendor marketing pages).
3. Whether the specific outlet(s) fall under any IRD "specified sector" list requiring VAT registration regardless of turnover.
4. Current legal posture on inclusive vs additive VAT/service-charge display. This is genuinely contested between IRD/consumer-protection enforcement and industry association practice as of 2026; choose a mode with counsel, do not infer it from competitors' receipts.
5. Live CBMS API endpoint and contract, and the credentialing process. The schema in section 14.3 is community-documented from an older integration and should be confirmed with a CBMS-listed software vendor or IRD directly.
