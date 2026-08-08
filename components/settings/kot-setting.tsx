"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Printer, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getKotSettings, saveKotSettings, resetKotNumbers } from "@/lib/actions/print-settings";
import { formatKOTHTML, printReceipt } from "@/lib/printing";

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
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function KotSettingPage() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    getKotSettings()
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
    const res: any = await saveKotSettings(s);
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    setS(res.data);
    setDirty(false);
    toast.success("KOT settings saved");
  };

  const handleReset = async () => {
    setResetting(true);
    const res: any = await resetKotNumbers();
    setResetting(false);
    setConfirmReset(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`KOT numbering reset (${res.data.cleared} dockets cleared)`);
  };

  const previewHtml = useCallback(() => {
    if (!s) return "";
    return formatKOTHTML({
      kotNumber: 23,
      tableLabel: "Cabin-1",
      orderTypeLabel: "Dine In",
      waiterName: "Swadesh Nepali",
      orderedAt: "18 Sep 2025 12:41 PM",
      items: [
        { name: "Chicken Chowmein", qty: 4, notes: "Please make it without sauce." },
        { name: "Burger - Crunchy", qty: 4 },
        { name: "Yak Cheese Ball", qty: 3 },
        { name: "Chicken Cheese Pizza", qty: 1, notes: "Add extra cheese on top." },
      ],
      kotRemarks: "Please make it quick and spicy.",
      printedBy: "Owner",
      printedAt: "18 Sep 2025 12:42 PM",
      settings: s,
    });
  }, [s]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!s) return <p className="text-sm text-muted-foreground">Couldn&apos;t load KOT settings.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">KOT Setting</h1>
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
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">KOT Heading Details</h2>
              <div className="flex flex-wrap gap-2">
                <TogglePill label="KOT No" checked={s.showKotNo} onChange={(v) => set({ showKotNo: v })} />
                <TogglePill label="Order Type" checked={s.showOrderType} onChange={(v) => set({ showOrderType: v })} />
                <TogglePill label="Table" checked={s.showTable} onChange={(v) => set({ showTable: v })} />
                <TogglePill label="Order By" checked={s.showOrderBy} onChange={(v) => set({ showOrderBy: v })} />
                <TogglePill label="Time" checked={s.showTime} onChange={(v) => set({ showTime: v })} />
                <TogglePill label="Table as Sub Heading" checked={s.tableAsSubHeading} onChange={(v) => set({ tableAsSubHeading: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">Line Items Details</h2>
              <div className="flex flex-wrap gap-2">
                <TogglePill label="S.N" checked={s.showSN} onChange={(v) => set({ showSN: v })} />
                <TogglePill label="Dishes" checked={s.showDishes} onChange={(v) => set({ showDishes: v })} />
                <TogglePill label="QTY" checked={s.showQty} onChange={(v) => set({ showQty: v })} />
                <TogglePill label="Total" checked={s.showTotal} onChange={(v) => set({ showTotal: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold">Font Settings</h2>
                <p className="text-xs text-muted-foreground">Set the custom font size for KOT printing.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => set({ fontSize: Math.max(6, s.fontSize - 1) })}>−</Button>
                <span className="w-10 text-center text-sm">{s.fontSize}</span>
                <Button variant="outline" size="icon" onClick={() => set({ fontSize: Math.min(24, s.fontSize + 1) })}>+</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold">Print Settings</h2>
                <p className="text-xs text-muted-foreground">
                  Number of KOT copies printed when using Confirm &amp; Print.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => set({ printCount: Math.max(1, s.printCount - 1) })}>−</Button>
                <span className="w-10 text-center text-sm">{s.printCount}</span>
                <Button variant="outline" size="icon" onClick={() => set({ printCount: Math.min(10, s.printCount + 1) })}>+</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Row label="Compact View" description="Enabling Compact View will print KOTs with minimal gap."
              checked={s.compactView} onChange={(v) => set({ compactView: v })} />
            <Row label="Print KOT after Item Cancellation" description="Print an updated KOT alongside the Cancelled Item KOT."
              checked={s.printOnCancel} onChange={(v) => set({ printOnCancel: v })} />
            <Row label="Print KOT after Item Update" description="Print an updated KOT alongside the Updated Item KOT."
              checked={s.printOnUpdate} onChange={(v) => set({ printOnUpdate: v })} />
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold">KOT Footer Details</h2>
              <div className="flex flex-wrap gap-2">
                <TogglePill label="KOT Remarks" checked={s.showKotRemarks} onChange={(v) => set({ showKotRemarks: v })} />
                <TogglePill label="Dish Remarks" checked={s.showDishRemarks} onChange={(v) => set({ showDishRemarks: v })} />
                <TogglePill label="Printed By" checked={s.showPrintedBy} onChange={(v) => set({ showPrintedBy: v })} />
                <TogglePill label="Printed At" checked={s.showPrintedAt} onChange={(v) => set({ showPrintedAt: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Footer Text</Label>
                <Input value={s.footerText} onChange={(e) => set({ footerText: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Dish Remarks Position</Label>
                <div className="flex gap-2">
                  {([["KOT_FOOTER", "KOT Footer"], ["BELOW_DISH", "Below Dish"]] as const).map(([val, lbl]) => (
                    <Button
                      key={val}
                      variant={s.dishRemarksPosition === val ? "default" : "outline"}
                      size="sm"
                      onClick={() => set({ dishRemarksPosition: val })}
                    >
                      {lbl}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Determines where dish remarks are displayed.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold text-destructive">Reset KOT Number</h2>
              <Row
                label="Automatically Reset with Daybook"
                description="Reset the counter when the daybook closes."
                checked={s.autoResetWithDaybook}
                onChange={(v) => set({ autoResetWithDaybook: v })}
              />
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
                KOT numbers can be reset manually or automatically based on the daybook close
                date. To reset now, use the button below — the next docket will start at 1.
              </p>
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="w-4 h-4" /> Reset Manually
              </Button>
            </CardContent>
          </Card>
        </div>

        <aside className="w-full xl:w-[340px] xl:flex-shrink-0 xl:sticky xl:top-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">Print Preview</p>
              {/* Rendered by the same function that prints the real docket. */}
              <iframe
                title="KOT preview"
                className="w-full h-[520px] bg-white rounded border"
                srcDoc={previewHtml()}
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset KOT numbering?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the KOT number from every past order, so the next docket starts at
              KOT 1. Dockets already printed will no longer match what&apos;s on screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={handleReset}
              
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
