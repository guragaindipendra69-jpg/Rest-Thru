"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Percent, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { useAuthStore } from "@/store/auth-store";
import { getRestaurant, getSettingsData, updateRestaurant, upsertSettings } from "@/lib/actions/settings";
import { createTaxRate, deleteTaxRate, getTaxRates, updateTaxRate } from "@/lib/actions/tax";

/**
 * Tax & VAT -- PAN, VAT registration, the default rate, per-category rates and
 * the bill footer.
 *
 * These fields were a tab on the owner Settings index, which meant reception
 * could not reach them at all and the owner reached them through a tab set
 * nested inside the settings sidebar. They are IRD-mandated invoice fields
 * (`bill-design.md`), so they get a route of their own in both portals rather
 * than being folded into Invoice Setting, which persists to a different table.
 */
export default function TaxSettingPage() {
  const { restaurant: authRestaurant } = useAuthStore();
  const restaurantId = authRestaurant?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [showNewTaxRate, setShowNewTaxRate] = useState(false);
  const [creatingTaxRate, setCreatingTaxRate] = useState(false);
  const [newTaxRate, setNewTaxRate] = useState({
    name: "VAT", rate: "13", type: "VAT", isDefault: true, appliesToItemTypes: "",
  });

  const [form, setForm] = useState({
    pan_number: "",
    vat_registered: false,
    vat_number: "",
    vat_rate: 13,
    bill_footer_message: "",
    restaurant_name: "",
    restaurant_address: "",
  });

  const refreshRates = useCallback(async () => {
    const res = await getTaxRates();
    if ("data" in res && res.data) setTaxRates(res.data);
  }, []);

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return; }
    (async () => {
      const [restRes, setRes] = await Promise.all([
        getRestaurant(restaurantId),
        getSettingsData(restaurantId),
      ]);
      const r: any = restRes.data ?? {};
      const s: any = setRes.data ?? {};
      setForm({
        pan_number: r.panNumber ?? "",
        vat_registered: r.vatRegistered ?? false,
        vat_number: r.vatNumber ?? "",
        vat_rate: s.vat_rate ?? 13,
        bill_footer_message: s.bill_footer_message ?? "",
        restaurant_name: r.name ?? "",
        restaurant_address: r.street ?? "",
      });
      await refreshRates();
      setLoading(false);
    })();
  }, [restaurantId, refreshRates]);

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!restaurantId) return;
    setSaving(true);
    const [settingsRes, restRes] = await Promise.all([
      upsertSettings(restaurantId, {
        vat_rate: form.vat_rate,
        bill_footer_message: form.bill_footer_message,
      }),
      updateRestaurant(restaurantId, {
        panNumber: form.pan_number,
        vatRegistered: form.vat_registered,
        vatNumber: form.vat_number,
        taxPercentage: form.vat_rate,
      }),
    ]);
    setSaving(false);
    if (settingsRes.error) { toast.error(settingsRes.error); return; }
    if (restRes.error) { toast.error(restRes.error); return; }
    toast.success("Tax settings saved");
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tax &amp; VAT"
        description="Registration numbers and rates printed on every tax invoice."
      >
        <Button size="sm" className="gap-2" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="w-full min-w-0 flex-1 space-y-5">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold">Registration</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>PAN Number</Label>
                  <Input value={form.pan_number} onChange={(e) => set({ pan_number: e.target.value })} placeholder="Enter PAN number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Default Tax Rate (%)</Label>
                  <Input
                    type="number"
                    value={form.vat_rate}
                    onChange={(e) => set({ vat_rate: parseFloat(e.target.value) || 0 })}
                    placeholder="13"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The default rate is the fallback used when no specific tax rate matches an item.
              </p>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">VAT Registered</p>
                  <p className="text-sm text-muted-foreground">Is your restaurant VAT registered?</p>
                </div>
                <Switch checked={form.vat_registered} onCheckedChange={(v) => set({ vat_registered: v })} />
              </div>

              {form.vat_registered && (
                <div className="space-y-1.5">
                  <Label>VAT Registration Number</Label>
                  <Input value={form.vat_number} onChange={(e) => set({ vat_number: e.target.value })} placeholder="Enter VAT number" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Bill Footer Message</Label>
                <textarea
                  className="flex min-h-24 w-full rounded-md border border-border-control bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Thank you for your visit!"
                  value={form.bill_footer_message}
                  onChange={(e) => set({ bill_footer_message: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Percent className="w-4 h-4" /> Tax Rates
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manage tax rates for different item categories.
                </p>
              </div>

              {taxRates.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">No tax rates configured. Add one below.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The system falls back to the default rate above (currently {form.vat_rate}%).
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {taxRates.map((tr: any) => (
                    <div key={tr.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{tr.name}</span>
                          <span className="font-mono text-sm">{tr.rate}%</span>
                          <span className="text-xs text-muted-foreground">{tr.type}</span>
                          {tr.isDefault && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Default</span>
                          )}
                        </div>
                        {tr.appliesToItemTypes.length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Applies to: {tr.appliesToItemTypes.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Switch
                          checked={tr.isActive}
                          onCheckedChange={async (v) => {
                            await updateTaxRate(tr.id, { isActive: v });
                            await refreshRates();
                            toast.success(v ? "Tax rate activated" : "Tax rate deactivated");
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 text-destructive"
                          onClick={async () => {
                            if (tr.isDefault) { toast.error("Cannot delete default tax rate"); return; }
                            const res = await deleteTaxRate(tr.id);
                            if ("error" in res) { toast.error(res.error as string); return; }
                            await refreshRates();
                            toast.success("Tax rate deleted");
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showNewTaxRate ? (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input value={newTaxRate.name} onChange={(e) => setNewTaxRate((p) => ({ ...p, name: e.target.value }))} placeholder="VAT" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rate (%)</Label>
                      <Input type="number" value={newTaxRate.rate} onChange={(e) => setNewTaxRate((p) => ({ ...p, rate: e.target.value }))} placeholder="13" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Type</Label>
                      <Input value={newTaxRate.type} onChange={(e) => setNewTaxRate((p) => ({ ...p, type: e.target.value }))} placeholder="VAT" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Applies to (comma separated)</Label>
                      <Input
                        value={newTaxRate.appliesToItemTypes}
                        onChange={(e) => setNewTaxRate((p) => ({ ...p, appliesToItemTypes: e.target.value }))}
                        placeholder="Leave blank for all items"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Switch
                        checked={newTaxRate.isDefault}
                        onCheckedChange={(v) => setNewTaxRate((p) => ({ ...p, isDefault: v }))}
                      />
                      Set as default
                    </label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowNewTaxRate(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        disabled={creatingTaxRate}
                        onClick={async () => {
                          setCreatingTaxRate(true);
                          const res = await createTaxRate({
                            name: newTaxRate.name,
                            rate: parseFloat(newTaxRate.rate) || 0,
                            type: newTaxRate.type,
                            isDefault: newTaxRate.isDefault,
                            appliesToItemTypes: newTaxRate.appliesToItemTypes
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          });
                          setCreatingTaxRate(false);
                          if ("error" in res) { toast.error(res.error as string); return; }
                          setShowNewTaxRate(false);
                          setNewTaxRate({ name: "VAT", rate: "13", type: "VAT", isDefault: false, appliesToItemTypes: "" });
                          await refreshRates();
                          toast.success("Tax rate created");
                        }}
                      >
                        {creatingTaxRate ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Create
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowNewTaxRate(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Add Tax Rate
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer message lands on the printed bill, so show it in context. */}
        <aside className="w-full xl:w-[320px] xl:flex-shrink-0 xl:sticky xl:top-4">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs text-muted-foreground">Receipt Preview</p>
              <div className="mx-auto w-full space-y-1 rounded-lg border bg-muted/30 p-4 font-mono text-xs">
                <p className="text-center font-bold">{form.restaurant_name || "Your Restaurant"}</p>
                {form.restaurant_address && <p className="text-center text-[10px]">{form.restaurant_address}</p>}
                {form.pan_number && <p className="text-center text-[10px]">PAN: {form.pan_number}</p>}
                {form.vat_registered && form.vat_number && (
                  <p className="text-center text-[10px]">VAT: {form.vat_number}</p>
                )}
                <div className="my-2 border-b" />
                <p className="text-center text-[10px] italic text-muted-foreground">Items will appear here</p>
                <div className="flex justify-between text-[10px]">
                  <span>VAT ({form.vat_rate}%)</span>
                  <span>—</span>
                </div>
                <div className="my-2 border-b" />
                {form.bill_footer_message && (
                  <p className="text-center text-[10px]">{form.bill_footer_message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
