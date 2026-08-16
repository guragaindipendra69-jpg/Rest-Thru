"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Printer, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { getTableCheckout, settleOrder } from "@/lib/actions/orders";
import { formatCurrency, formatBSDate, formatBillNo, formatInvoiceNo } from "@/lib/format";
import { formatReceiptHTML, printReceipt, downloadReceiptPdf } from "@/lib/printing";
import { calculateBill } from "@/lib/billing/calculate";
import {
  resolveBillingConfig,
  registrationTypeFor,
  type PricingMode,
} from "@/lib/billing/config";
import { amountInWords } from "@/lib/billing/amount-in-words";

const PAYMENT_METHODS = [
  { id: "CASH", label: "Cash", code: "CA" },
  { id: "ESEWA", label: "eSewa", code: "ES" },
  { id: "KHALTI", label: "Khalti", code: "KH" },
  { id: "FONEPAY", label: "Fonepay", code: "FO" },
] as const;

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: "Dine In",
  TAKEAWAY: "Take away",
  DELIVERY: "Delivery",
  PICKUP: "Pick up",
};

export default function TableCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = String(params?.orderId ?? "");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [tender, setTender] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [discountMode, setDiscountMode] = useState<"RS" | "PCT">("RS");
  const [remarks, setRemarks] = useState("");
  const [isSettling, setIsSettling] = useState(false);
  const [settledBill, setSettledBill] = useState<any>(null);

  const portal =
    typeof window !== "undefined" && window.location.pathname.startsWith("/owner")
      ? "/owner"
      : "/reception";

  useEffect(() => {
    if (!orderId) return;
    getTableCheckout(orderId)
      .then((res: any) => {
        if (res.error) { toast.error(res.error); return; }
        setData(res.data);
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const subtotal = data?.subtotal ?? 0;
  const serviceCharge = data?.serviceCharge ?? 0;

  const discount = useMemo(() => {
    const raw = parseFloat(discountInput) || 0;
    const value = discountMode === "PCT" ? (subtotal * raw) / 100 : raw;
    return Math.min(Math.max(value, 0), subtotal);
  }, [discountInput, discountMode, subtotal]);

  /**
   * The quote comes from the same engine that will issue the bill.
   *
   * This screen used to compute `subtotal + serviceCharge - discount` and carve
   * VAT out of it with a hardcoded 13 percent. That is the INCLUSIVE reading of
   * the menu price, so an ADDITIVE outlet — where VAT stacks on top — was shown
   * a total roughly a VAT-rate below what `settleOrder` charges, and the tender
   * and change the cashier worked from were both short. Calling calculateBill
   * with the outlet's own pricing mode and rate means the estimate on screen and
   * the tax invoice printed after checkout cannot disagree.
   */
  const quote = useMemo(() => {
    const restaurant = data?.restaurant ?? null;
    const lines = (data?.items ?? []).map((i: any) => ({
      description: i.name,
      quantity: i.quantity,
      unitPrice: i.rate,
      vatExempt: Boolean(i.vatExempt),
      hsCode: i.hsCode ?? null,
    }));
    if (serviceCharge > 0) {
      lines.push({ description: "Service Charge", quantity: 1, unitPrice: serviceCharge });
    }
    return calculateBill({
      lines,
      config: resolveBillingConfig(restaurant),
      pricingMode: (restaurant?.pricingMode as PricingMode) ?? "INCLUSIVE",
      registrationType: registrationTypeFor(restaurant ?? {}),
      discountAmount: discount,
      // Service charge is already a line above; applying it again double-charges.
      applyServiceCharge: false,
    });
  }, [data, serviceCharge, discount]);

  const totalAmount = quote.grandTotal;
  const taxable = quote.taxableValue;
  const vat = quote.vatAmount;
  const vatRegistered = !!data?.restaurant?.vatRegistered;
  const taxRate = quote.vatRate;

  const tenderAmount = parseFloat(tender) || 0;
  const change = tenderAmount > totalAmount ? tenderAmount - totalAmount : 0;

  const buildReceiptHtml = useCallback(
    (bill: any) => {
      const when = new Date(bill?.settledAt ?? bill?.createdAt ?? Date.now());
      const rounded = Math.round(bill?.totalAmount ?? totalAmount);
      const r = data?.restaurant ?? {};
      return formatReceiptHTML({
        restaurantName: r.name || "Restaurant",
        panNumber: r.panNumber,
        vatRegistered: r.vatRegistered,
        vatNumber: r.vatNumber,
        taxPercentage: r.taxPercentage,
        invoiceNo: bill?.billNumber ? formatInvoiceNo(bill.billNumber, when) : "##",
        billNo: bill?.billNumber ? formatBillNo(bill.billNumber) : "##",
        adDate: when.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
        bsDate: formatBSDate(when),
        time: when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        tableNo: data?.tableLabel,
        orderNo: data?.orderIds?.[0] ? `ORD-${String(data.orderIds[0]).padStart(5, "0")}` : null,
        customerName: data?.customerName || undefined,
        items: (data?.items ?? []).map((i: any) => ({
          name: i.name, qty: i.quantity, price: i.rate, total: i.total,
        })),
        subtotal: bill?.subtotal ?? subtotal,
        discountAmount: bill?.discountAmount ?? discount,
        taxableAmount: bill?.taxableAmount ?? taxable,
        taxAmount: bill?.taxAmount ?? vat,
        serviceCharge: bill?.serviceCharge ?? serviceCharge,
        roundOff: rounded - (bill?.totalAmount ?? totalAmount),
        totalAmount: bill?.totalAmount ?? totalAmount,
        amountPaid: bill?.amountPaid ?? tenderAmount ?? totalAmount,
        change: bill?.change ?? change,
        paymentMethod: bill?.paymentMethod ?? payMethod,
      });
    },
    [data, subtotal, discount, taxable, vat, serviceCharge, totalAmount, tenderAmount, change, payMethod]
  );

  const handleConfirm = async (thenPrint: boolean) => {
    if (!data) return;
    setIsSettling(true);
    const result: any = await settleOrder({
      orderId: data.anchorId,
      paymentMethod: payMethod as any,
      amountPaid: tenderAmount > 0 ? tenderAmount : undefined,
      discountAmount: discount > 0 ? discount : undefined,
      discountReason: remarks || undefined,
    });
    setIsSettling(false);

    if (result.error) { toast.error(result.error); return; }

    // Hold the guest's bill on screen instead of bouncing straight back — the
    // cashier still has to hand over or print it.
    setSettledBill(result.data);
    if (thenPrint && !printReceipt(buildReceiptHtml(result.data))) {
      toast.error("Couldn't open the printer — check your browser's print settings.");
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load this checkout.</p>
        <Button variant="outline" onClick={() => router.push(`${portal}/orders`)}>
          Back to orders
        </Button>
      </div>
    );
  }

  const addressLine = [data.restaurant?.street, data.restaurant?.city, data.restaurant?.state]
    .filter(Boolean)
    .join(", ");
  const settledDate = new Date(
    settledBill?.settledAt ?? settledBill?.createdAt ?? Date.now()
  );
  const bsSettledDate = formatBSDate(settledDate);

  const heading = data.tableLabel
    ? `Checkout - ${data.tableLabel}`
    : `Checkout - ${ORDER_TYPE_LABELS[String(data.orderType).toUpperCase()] ?? "Order"}`;

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        {/* The back button carried no accessible name: an icon-only control is
            announced as just "button" to a screen reader, and this is the only
            way off a checkout screen. */}
        <PageHeader
          back={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to orders"
              onClick={() => router.push(`${portal}/orders`)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          }
          title={heading}
        >
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (downloadReceiptPdf(buildReceiptHtml(settledBill), `estimate-${data.orderIds[0]}`)) {
                toast.success("Estimate downloaded");
              }
            }}
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => printReceipt(buildReceiptHtml(settledBill))}
          >
            <Printer className="w-4 h-4" /> Print Estimate
          </Button>
        </PageHeader>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* ── Left: the bill being built ─────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          <div>
            <h2 className="font-semibold text-sm mb-2">Items</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium w-12">S.N</th>
                    <th className="p-3 font-medium">Item</th>
                    <th className="p-3 font-medium w-16">QTY</th>
                    <th className="p-3 font-medium w-28">Rate</th>
                    <th className="p-3 font-medium w-32">Taxable Amount</th>
                    <th className="p-3 font-medium w-20">Tax</th>
                    <th className="p-3 font-medium w-28">Item Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item: any, idx: number) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">{idx + 1}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">Rs {item.rate.toFixed(0)}</td>
                      <td className="p-3">Rs {item.total.toFixed(0)}</td>
                      <td className="p-3">{vatRegistered ? `${taxRate}%` : "0 %"}</td>
                      <td className="p-3">Rs {item.total.toFixed(0)}</td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No items on this table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.orderIds.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                Covers {data.orderIds.length} rounds — #{data.orderIds.join(", #")} — settled as one bill.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add remarks to invoice"
                className="w-full min-h-[90px] rounded-lg border bg-background p-3 text-sm resize-y"
              />
              <div>
                <label className="text-sm font-medium block mb-1.5">Tender Amount</label>
                <Input
                  type="number"
                  value={tender}
                  onChange={(e) => setTender(e.target.value)}
                  placeholder="Rs 0.00"
                />
                {change > 0 && (
                  <p className="text-xs text-success mt-1.5">
                    Change: {formatCurrency(change)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item total</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground">Discount (—)</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-md border overflow-hidden">
                    {(["RS", "PCT"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setDiscountMode(m)}
                        className={`px-2 py-1 text-xs ${
                          discountMode === m
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        }`}
                      >
                        {m === "RS" ? "Rs" : "%"}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-24 h-8 text-right"
                  />
                </div>
              </div>
              {serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Charge</span>
                  <span>{formatCurrency(serviceCharge)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Amount</span>
                <span>{formatCurrency(taxable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {vatRegistered ? `VAT (${taxRate}%)` : `No Tax (${formatCurrency(totalAmount)})`}
                </span>
                <span>{formatCurrency(vat)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-2 border-t">
                <span>Total Amount</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium mb-3">
              Payment Mode <span className="text-destructive">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPayMethod(m.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    payMethod === m.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <span className="text-[10px] font-semibold rounded bg-muted px-1.5 py-0.5">
                    {m.code}
                  </span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: what the guest will be handed ───────────────────── */}
        <aside className="w-full xl:w-[400px] xl:flex-shrink-0">
          <Card>
            <CardContent className="p-5">
              <h2 className="text-center font-semibold tracking-wide mb-4">
                ESTIMATE INVOICE
              </h2>

              <div className="flex justify-between text-sm">
                <span>Invoice No: <b>##</b></span>
                <span className="text-muted-foreground">
                  Date: {new Date().toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-sm mt-1">
                {ORDER_TYPE_LABELS[String(data.orderType).toUpperCase()] ?? "Dine In"}
                {data.tableLabel ? `: ${data.tableLabel}` : ""}
              </p>

              <p className="text-sm mt-3">
                Customer: <b>{data.customerName || "Cash Customer"}</b>
              </p>

              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Particular</th>
                    <th className="py-2 font-medium text-right">Rate</th>
                    <th className="py-2 font-medium text-right">QTY</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i: any) => (
                    <tr key={i.id}>
                      <td className="py-1.5 text-primary">{i.name}</td>
                      <td className="py-1.5 text-right">{i.rate.toFixed(0)}</td>
                      <td className="py-1.5 text-right text-primary">{i.quantity}</td>
                      <td className="py-1.5 text-right">{i.total.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t mt-2 pt-2 flex justify-between text-sm">
                <span>Total (Particular/QTY)</span>
                <span>
                  {data.items.length}/
                  {data.items.reduce((s: number, i: any) => s + i.quantity, 0)}
                  <b className="ml-4">{formatCurrency(subtotal)}</b>
                </span>
              </div>
              <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
                <span>Total Amount</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>

              <p className="text-sm text-primary mt-3">{amountInWords(totalAmount)}</p>

              <div className="text-sm mt-3 space-y-1">
                <p>
                  Payment Mode:{" "}
                  <b>
                    {tenderAmount >= totalAmount && tenderAmount > 0
                      ? `${payMethod} (${formatCurrency(totalAmount)})`
                      : `Unpaid (${formatCurrency(totalAmount)})`}
                  </b>
                </p>
              </div>

              <p className="font-semibold mt-4">This is not a Tax Invoice!</p>
              <p className="text-sm text-muted-foreground">
                Kindly accept the original bill from the counter.
              </p>

              <div className="border-t mt-4 pt-3">
                <p className="text-xs text-muted-foreground">Net sales amount</p>
                <p className="text-xl font-bold">{formatCurrency(totalAmount)}</p>
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isSettling || data.alreadyBilled}
                  onClick={() => handleConfirm(true)}
                >
                  Confirm &amp; Print
                </Button>
                <Button
                  className="flex-1"
                  disabled={isSettling || data.alreadyBilled}
                  onClick={() => handleConfirm(false)}
                >
                  {isSettling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Checkout"}
                </Button>
              </div>
              {data.alreadyBilled && (
                <p className="text-xs text-destructive mt-2 text-center">
                  This table is already billed.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ── Settled: the guest's bill, held on screen to hand over ──── */}
      {/* Deliberately not dismissible: the money is already taken, and a stray
          click outside must not whisk the guest's bill off the screen before
          it has been handed over or printed. "Done" is the only way out. */}
      <Dialog
        open={!!settledBill}
        // Only the ✕ and "Done" close this — both land back on the order list.
        // Without a handler the built-in ✕ would be inert.
        onOpenChange={(open) => { if (!open) router.push(`${portal}/orders`); }}
      >
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Successful Checkout</DialogTitle>

          <div className="flex flex-col items-center pt-2">
            <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-success" />
            </div>
            <h2 className="text-lg font-semibold mt-3">Successful Checkout</h2>
          </div>

          <div className="rounded-lg border p-5 mt-2">
            <div className="text-center">
              <p className="font-bold text-lg">{data.restaurant?.name || "Restaurant"}</p>
              {addressLine && (
                <p className="text-sm text-muted-foreground">{addressLine}</p>
              )}
              {data.restaurant?.phoneNumber && (
                <p className="text-sm text-muted-foreground">
                  {data.restaurant.phoneNumber}
                </p>
              )}
            </div>

            {/* A settled bill is no longer an estimate; VAT-registered shops
                must hand over a tax invoice, so the heading reflects that. */}
            <h3 className="text-center font-semibold tracking-wide mt-4 mb-4">
              {data.restaurant?.vatRegistered ? "TAX INVOICE" : "INVOICE"}
            </h3>

            <div className="flex justify-between text-sm">
              <span>
                Invoice No:{" "}
                {settledBill?.billNumber
                  ? formatInvoiceNo(settledBill.billNumber, settledDate)
                  : "—"}
              </span>
              <span>
                Date:{" "}
                {settledDate.toLocaleDateString("en-US", {
                  month: "short", day: "2-digit", year: "numeric",
                })}
              </span>
            </div>
            <p className="text-sm mt-1">
              {ORDER_TYPE_LABELS[String(data.orderType).toUpperCase()] ?? "Dine In"}
              {data.tableLabel ? `: ${data.tableLabel}` : ""}
            </p>
            {bsSettledDate && (
              <p className="text-sm text-muted-foreground">Miti: {bsSettledDate} BS</p>
            )}

            <div className="border-t mt-3 pt-3">
              <p className="text-sm">
                Customer: <b>{data.customerName || "Cash Customer"}</b>
              </p>
            </div>

            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="border-y text-left">
                  <th className="py-2 font-medium">Particular</th>
                  <th className="py-2 font-medium text-right">Rate</th>
                  <th className="py-2 font-medium text-right">QTY</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i: any) => (
                  <tr key={i.id}>
                    <td className="py-1.5">{i.name}</td>
                    <td className="py-1.5 text-right">{i.rate.toFixed(0)}</td>
                    <td className="py-1.5 text-right">{i.quantity}</td>
                    <td className="py-1.5 text-right">{i.total.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t mt-2 pt-2 flex justify-between text-sm">
              <span>Total (Particular/QTY)</span>
              <span>
                {data.items.length}/
                {data.items.reduce((s: number, i: any) => s + i.quantity, 0)}
                <b className="ml-4">{formatCurrency(settledBill?.subtotal ?? subtotal)}</b>
              </span>
            </div>
            {(settledBill?.discountAmount ?? 0) > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span>Discount</span>
                <span>-{formatCurrency(settledBill.discountAmount)}</span>
              </div>
            )}
            {data.restaurant?.vatRegistered && (
              <>
                <div className="flex justify-between text-sm mt-1">
                  <span>Taxable Amount</span>
                  <span>{formatCurrency(settledBill?.taxableAmount ?? taxable)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VAT ({taxRate}%)</span>
                  <span>{formatCurrency(settledBill?.taxAmount ?? vat)}</span>
                </div>
              </>
            )}
            <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
              <span>Total Amount</span>
              <span>{formatCurrency(settledBill?.totalAmount ?? totalAmount)}</span>
            </div>

            <p className="text-sm text-primary mt-3">
              {amountInWords(settledBill?.totalAmount ?? totalAmount)}
            </p>

            <div className="text-sm mt-3 space-y-0.5">
              <p>
                Payment Mode: <b>{settledBill?.paymentMethod ?? payMethod}</b>
                {" "}({formatCurrency(settledBill?.amountPaid ?? totalAmount)})
              </p>
              {(settledBill?.change ?? 0) > 0 && (
                <p>Change: <b>{formatCurrency(settledBill.change)}</b></p>
              )}
              {data.orderIds.length > 1 && (
                <p className="text-muted-foreground">
                  Covers {data.orderIds.length} rounds — #{data.orderIds.join(", #")}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-1">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                const name = `bill-${settledBill?.billNumber ?? data.orderIds[0]}`;
                if (downloadReceiptPdf(buildReceiptHtml(settledBill), name)) {
                  toast.success("Bill downloaded");
                } else {
                  toast.error("Couldn't download the bill.");
                }
              }}
            >
              <Download className="w-4 h-4" /> Download PDF
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                if (!printReceipt(buildReceiptHtml(settledBill))) {
                  toast.error("Couldn't open the printer — check your browser's print settings.");
                }
              }}
            >
              <Printer className="w-4 h-4" /> Print Bill
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(`${portal}/orders`)}
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
