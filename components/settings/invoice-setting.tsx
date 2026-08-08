"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getInvoiceSettings, saveInvoiceSettings } from "@/lib/actions/print-settings";
import { formatReceiptHTML, printReceipt, extractReceiptText } from "@/lib/printing";

/** Checkbox-style pill used for the field toggles, matching the reference. */
function TogglePill({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        checked
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border-strong bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function Row({
  label, description, checked, onChange,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function InvoiceSettingPage() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getInvoiceSettings()
      .then((res: any) => {
        if (res.error) { toast.error(res.error); return; }
        setS(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = useCallback((patch: Record<string, any>) => {
    setS((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res: any = await saveInvoiceSettings(s);
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    setS(res.data);
    setDirty(false);
    toast.success("Invoice settings saved");
  };

  // Sample figures so the preview shows every line the toggles can affect.
  const previewHtml = useCallback(() => {
    if (!s) return "";
    return formatReceiptHTML({
      restaurantName: s.legalName || "Restaurant",
      address: s.address,
      phone: s.contactNumber,
      vatRegistered: true,
      taxPercentage: 13,
      invoiceNo: "INV-2026-000001",
      billNo: "000001",
      adDate: "Aug 6, 2026",
      bsDate: "2083/04/22",
      time: "07:45 PM",
      tableNo: "Table 1",
      orderNo: "ORD-00001",
      customerName: "Cash Customer",
      items: [
        { name: "Chicken Momo", qty: 2, price: 250, total: 500 },
        { name: "Coke", qty: 1, price: 100, total: 100 },
      ],
      subtotal: 600,
      discountAmount: 60,
      discountPercent: 10,
      taxableAmount: 477.88,
      taxAmount: 62.12,
      totalAmount: 540,
      amountPaid: 600,
      change: 60,
      paymentMethod: "CASH",
      amountInWords: "Five Hundred Forty Nepalese Rupee Only",
      billedBy: "Owner",
      kotNumbers: [12, 11],
      serviceDuration: "24 mins",
      settings: s,
    });
  }, [s]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!s) return <p className="text-sm text-muted-foreground">Couldn&apos;t load invoice settings.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Invoice Setting</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => printReceipt(previewHtml())}>
            <Printer className="w-4 h-4" /> Print Preview
          </Button>
          <Button size="sm" className="gap-2" disabled={saving || !dirty} onClick={handleSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full space-y-5">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold">Restaurant Information</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Invoice Type *</Label>
                  <Input value={s.invoiceType} onChange={(e) => set({ invoiceType: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Restaurant Legal Name *</Label>
                  <Input value={s.legalName} onChange={(e) => set({ legalName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Number</Label>
                  <Input value={s.contactNumber} onChange={(e) => set({ contactNumber: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={s.address} onChange={(e) => set({ address: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax Number</Label>
                  <Input
                    value={s.taxNumber}
                    placeholder="Enter Tax Number"
                    onChange={(e) => set({ taxNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Font Size *</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => set({ fontSize: Math.max(6, s.fontSize - 1) })}>−</Button>
                    <span className="w-10 text-center text-sm">{s.fontSize}</span>
                    <Button variant="outline" size="icon" onClick={() => set({ fontSize: Math.min(24, s.fontSize + 1) })}>+</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">Invoice Heading Details</h2>
              <div className="flex flex-wrap gap-2">
                <TogglePill label="Detail For Estimate" checked={s.showEstimateDetail} onChange={(v) => set({ showEstimateDetail: v })} />
                <TogglePill label="Invoice No" checked={s.showInvoiceNo} onChange={(v) => set({ showInvoiceNo: v })} />
                <TogglePill label="Date" checked={s.showDate} onChange={(v) => set({ showDate: v })} />
                <TogglePill label="Order Type" checked={s.showOrderType} onChange={(v) => set({ showOrderType: v })} />
                <TogglePill label="Time" checked={s.showTime} onChange={(v) => set({ showTime: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">Line Item Details</h2>
              <div className="flex flex-wrap gap-2">
                <TogglePill label="S.N" checked={s.showSN} onChange={(v) => set({ showSN: v })} />
                <TogglePill label="HS Code" checked={s.showHSCode} onChange={(v) => set({ showHSCode: v })} />
                <TogglePill label="Particular" checked={s.showParticular} onChange={(v) => set({ showParticular: v })} />
                <TogglePill label="Rate" checked={s.showRate} onChange={(v) => set({ showRate: v })} />
                <TogglePill label="QTY" checked={s.showQty} onChange={(v) => set({ showQty: v })} />
                <TogglePill label="Amount" checked={s.showAmount} onChange={(v) => set({ showAmount: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold mb-1">Sub Total Calculation</h2>
              <Row label="Dish/Offer Discount" description="Discount based on dishes, this doesn't affect Item Total"
                checked={s.enableDishDiscount} onChange={(v) => set({ enableDishDiscount: v })} />
              <Row label="Loyalty Discount" description="Applied before sub total"
                checked={s.enableLoyaltyDiscount} onChange={(v) => set({ enableLoyaltyDiscount: v })} />
              <Row label="Discount" description="Calculated on Sub Total"
                checked={s.enableDiscount} onChange={(v) => set({ enableDiscount: v })} />
              <Row label="Service Charge" description="Calculated after Sub Total & Discount"
                checked={s.enableServiceCharge} onChange={(v) => set({ enableServiceCharge: v })} />
              <Row label="Discount Percentage" description="Show discount percentage in invoice when discount is applied."
                checked={s.showDiscountPercentage} onChange={(v) => set({ showDiscountPercentage: v })} />
              <Row label="Tax" description="Uses the VAT rate from Tax & VAT"
                checked={s.enableTax} onChange={(v) => set({ enableTax: v })} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">Invoice Footer Details</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <TogglePill label="Payment Mode" checked={s.showPaymentMode} onChange={(v) => set({ showPaymentMode: v })} />
                <TogglePill label="Billed By" checked={s.showBilledBy} onChange={(v) => set({ showBilledBy: v })} />
                <TogglePill label="KOT Number" checked={s.showKotNumber} onChange={(v) => set({ showKotNumber: v })} />
                <TogglePill label="Assign" checked={s.showAssign} onChange={(v) => set({ showAssign: v })} />
                <TogglePill label="Tender Amount" checked={s.showTenderAmount} onChange={(v) => set({ showTenderAmount: v })} />
                <TogglePill label="In Words" checked={s.showInWords} onChange={(v) => set({ showInWords: v })} />
                <TogglePill label="Service Duration" checked={s.showServiceDuration} onChange={(v) => set({ showServiceDuration: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold">Footer</h2>
              <div className="space-y-1.5">
                <Label>Header</Label>
                <Input value={s.footerHeader} onChange={(e) => set({ footerHeader: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Input value={s.footerRemarks} onChange={(e) => set({ footerRemarks: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live preview — rendered by the same function that prints the real
            bill, so what's shown here is exactly what comes out on paper. */}
        <aside className="w-full xl:w-[360px] xl:flex-shrink-0 xl:sticky xl:top-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">Print Preview</p>
              <pre className="bg-white text-black text-[9px] leading-[1.35] font-mono whitespace-pre overflow-x-auto p-3 rounded border">
                {extractReceiptText(previewHtml())}
              </pre>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
