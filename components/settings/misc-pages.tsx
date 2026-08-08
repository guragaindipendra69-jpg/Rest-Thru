"use client";

import { useEffect, useState } from "react";
import { Banknote, QrCode, Smartphone, Printer as PrinterIcon, Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth-store";
import { getSettingsData, upsertSettings, getActiveSubscription } from "@/lib/actions/settings";
import { getBillingUsage } from "@/lib/actions/settings-pages";

/* ────────────────────────────── Integrations ───────────────────────────── */

/**
 * Payment gateways, credentials included.
 *
 * The owner Settings index used to carry a second copy of this list with the
 * merchant-id and secret fields on it, while this page showed toggle-only cards
 * writing to a different key (`integration_*`). Nothing downstream reads either
 * store -- the method list at checkout is a literal -- so the two were free to
 * disagree about whether a gateway was on, and did. This is now the only place a
 * gateway is switched on and configured, keyed on the `*_config` columns that
 * already exist in the settings row.
 */
const GATEWAYS: Array<{
  configKey: string;
  name: string;
  kind: string;
  Icon: typeof Banknote;
  blurb: string;
  fields: Array<{ key: string; label: string; secret?: boolean }>;
}> = [
  {
    configKey: "esewa_config",
    name: "eSewa",
    kind: "Digital wallet",
    Icon: Smartphone,
    blurb:
      "Accept eSewa wallet payments from the checkout screen and the guest-facing menu.",
    fields: [
      { key: "merchant_id", label: "Merchant ID" },
      { key: "secret", label: "Secret Key", secret: true },
    ],
  },
  {
    configKey: "khalti_config",
    name: "Khalti",
    kind: "Digital wallet",
    Icon: Banknote,
    blurb:
      "Enable direct digital bank payments with a secure and reliable payment system.",
    fields: [
      { key: "api_key", label: "API Key" },
      { key: "secret", label: "Secret Key", secret: true },
    ],
  },
  {
    configKey: "fonepay_config",
    name: "Fonepay",
    kind: "Dynamic QR",
    Icon: QrCode,
    blurb:
      "Accept mobile banking and QR payments from multiple partnered banks and wallets.",
    fields: [
      { key: "merchant_id", label: "Merchant ID" },
      { key: "secret", label: "Secret Key", secret: true },
    ],
  },
];

const EMPTY_CONFIG = { enabled: false } as Record<string, any>;

export function IntegrationsPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = (restaurant as any)?.id;
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    getSettingsData(restaurantId)
      .then((res: any) => setSettings(res?.data ?? {}))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const configOf = (configKey: string) => settings[configKey] ?? EMPTY_CONFIG;

  /** Local edit only -- credentials are persisted by the per-gateway Save. */
  const patch = (configKey: string, next: Record<string, any>) =>
    setSettings((p) => ({ ...p, [configKey]: { ...configOf(configKey), ...next } }));

  const save = async (configKey: string, next?: Record<string, any>) => {
    if (!restaurantId) return;
    const payload = { ...configOf(configKey), ...next };
    setBusy(configKey);
    const res: any = await upsertSettings(restaurantId, { [configKey]: payload });
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    setSettings((p) => ({ ...p, [configKey]: payload }));
    toast.success("Payment settings saved");
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Switch a payment gateway on and enter its merchant credentials.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium mb-3">Payment Methods</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GATEWAYS.map(({ configKey, name, kind, Icon, blurb, fields }) => {
            const config = configOf(configKey);
            const enabled = !!config.enabled;
            return (
              <Card key={configKey}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Icon className="w-5 h-5" />
                    </span>
                    {busy === configKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => save(configKey, { enabled: v })}
                      />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-xs text-primary">{kind}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{blurb}</p>
                  <Badge variant="outline" className={enabled ? "text-success border-success/40" : ""}>
                    {enabled ? "Connected" : "Not connected"}
                  </Badge>

                  {/* Credentials only once the gateway is on -- an off gateway
                      has nothing to authenticate. */}
                  {enabled && (
                    <div className="space-y-3 border-t pt-3">
                      {fields.map((f) => (
                        <div key={f.key} className="space-y-1.5">
                          <Label className="text-xs">{f.label}</Label>
                          <Input
                            type={f.secret ? "password" : "text"}
                            value={config[f.key] ?? ""}
                            onChange={(e) => patch(configKey, { [f.key]: e.target.value })}
                            placeholder={f.label}
                          />
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={busy === configKey}
                        onClick={() => save(configKey)}
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save credentials
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Cash is not a gateway and has nothing to configure, but leaving it
              off the list reads as "cash is not accepted". */}
          <Card className="opacity-70">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <Banknote className="w-5 h-5" />
                </span>
                <Switch checked disabled />
              </div>
              <div>
                <p className="font-semibold">Cash</p>
                <p className="text-xs text-primary">Always available</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Cash is accepted at every till and cannot be switched off.
              </p>
              <Badge variant="outline" className="text-success border-success/40">Connected</Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Enabling a gateway makes it selectable at checkout. If you do not have merchant
        credentials yet, contact us from Support &amp; Feedback to go live.
      </p>
    </div>
  );
}

/* ──────────────────────────────── Printer ──────────────────────────────── */

export function PrinterPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = (restaurant as any)?.id;
  const [s, setS] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    getSettingsData(restaurantId)
      .then((res: any) => setS(res?.data ?? {}))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const save = async () => {
    if (!restaurantId) return;
    setSaving(true);
    const res: any = await upsertSettings(restaurantId, {
      printer_paper_width: s.printer_paper_width ?? "80mm",
      printer_auto_print_bill: !!s.printer_auto_print_bill,
      printer_auto_print_kot: !!s.printer_auto_print_kot,
      printer_open_drawer: !!s.printer_open_drawer,
    });
    setSaving(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success("Printer settings saved");
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Printer</h1>
        <Button size="sm" className="gap-2" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PrinterIcon className="w-4 h-4" />
            <h2 className="font-semibold">Paper &amp; Behaviour</h2>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>Paper Width</Label>
            <select
              className="h-10 w-full rounded-md border border-border-control bg-background px-3 text-sm"
              value={s.printer_paper_width ?? "80mm"}
              onChange={(e) => setS((p) => ({ ...p, printer_paper_width: e.target.value }))}
            >
              <option value="58mm">58 mm</option>
              <option value="80mm">80 mm</option>
              <option value="A4">A4</option>
            </select>
          </div>

          {[
            ["printer_auto_print_bill", "Auto-print bill on checkout", "Send the bill to the printer as soon as a table is settled."],
            ["printer_auto_print_kot", "Auto-print KOT on order", "Print the kitchen docket the moment an order is confirmed."],
            ["printer_open_drawer", "Open cash drawer on cash payment", "Pulse the drawer when a bill is settled in cash."],
          ].map(([key, label, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4 border-t pt-4">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={!!s[key]}
                onCheckedChange={(v) => setS((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Printing goes through your browser&apos;s print dialog, so any printer installed on
        this computer works — including thermal printers. Choose the matching paper size in
        the browser dialog the first time; it will be remembered.
      </p>
    </div>
  );
}

/* ───────────────────────────── Release Notes ───────────────────────────── */

const RELEASES: Array<{ version: string; date: string; items: string[] }> = [
  {
    version: "Table-grouped orders & one-bill checkout",
    date: "Aug 2026",
    items: [
      "Live Orders now groups every unpaid round onto one table card.",
      "A table's rounds settle as a single bill — no more one bill per round.",
      "New full-page checkout with estimate invoice and tender/change.",
      "Bills download as real PDFs.",
      "Invoice and KOT layouts are now configurable under Order Setting.",
    ],
  },
  {
    version: "Nepali tax invoice",
    date: "Aug 2026",
    items: [
      "Bills render as a Nepali-style tax invoice with Bikram Sambat dates.",
      "PAN/VAT numbers print when set under Tax & VAT.",
      "VAT is carved out of menu-inclusive prices rather than added on top.",
    ],
  },
];

export function ReleaseNotesPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Release Notes</h1>
      <div className="space-y-4">
        {RELEASES.map((r) => (
          <Card key={r.version}>
            <CardContent className="p-5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-semibold">{r.version}</h2>
                <span className="text-xs text-muted-foreground">{r.date}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {r.items.map((i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── Notifications ───────────────────────────── */

const NOTIFICATION_EVENTS: Array<{ key: string; title: string; blurb: string }> = [
  { key: "new_orders", title: "New Orders", blurb: "New orders and KOTs created, plus orders placed from the digital menu." },
  { key: "order_edits", title: "Order Edits", blurb: "Items changed on an open order." },
  { key: "cancellations", title: "Cancellations", blurb: "Orders that get cancelled or voided." },
  { key: "order_ready", title: "Order Ready", blurb: "Kitchen marks food ready to serve." },
  { key: "bill_settled", title: "Bill Settled", blurb: "A table is checked out and paid." },
  { key: "low_stock", title: "Low Stock", blurb: "An inventory item drops below its reorder level." },
];

export function NotificationsPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = (restaurant as any)?.id;
  const [s, setS] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    getSettingsData(restaurantId)
      .then((res: any) => setS(res?.data ?? {}))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  // Events default to on — a restaurant that has never opened this page should
  // still hear about new orders.
  const enabled = (key: string) => s[`notify_${key}`] ?? true;
  const priority = (key: string) => s[`notify_${key}_priority`] ?? "NORMAL";

  const save = async () => {
    if (!restaurantId) return;
    setSaving(true);
    const patch: Record<string, any> = {};
    for (const e of NOTIFICATION_EVENTS) {
      patch[`notify_${e.key}`] = enabled(e.key);
      patch[`notify_${e.key}_priority`] = priority(e.key);
    }
    const res: any = await upsertSettings(restaurantId, patch);
    setSaving(false);
    if (res?.error) { toast.error(res.error); return; }
    toast.success("Notification settings saved");
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Choose which events raise an alert, and how loudly.
          </p>
        </div>
        <Button size="sm" className="gap-2" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <div className="space-y-3">
        {NOTIFICATION_EVENTS.map((e) => (
          <Card key={e.key}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.blurb}</p>
                </div>
                <Switch
                  checked={enabled(e.key)}
                  onCheckedChange={(v) => setS((p) => ({ ...p, [`notify_${e.key}`]: v }))}
                />
              </div>
              {enabled(e.key) && (
                <div className="flex items-center gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground w-16">Priority</span>
                  {(["LOW", "NORMAL", "HIGH"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={priority(e.key) === p ? "default" : "outline"}
                      onClick={() => setS((prev) => ({ ...prev, [`notify_${e.key}_priority`]: p }))}
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Billing & Subscription ────────────────────────── */

export function BillingPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = (restaurant as any)?.id;
  const [sub, setSub] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    Promise.all([getActiveSubscription(restaurantId), getBillingUsage()])
      .then(([s, u]: any[]) => {
        setSub(s?.data ?? null);
        if (u?.data) setUsage(u.data);
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  const plan = sub?.plan;
  const expiry = sub?.endDate ? new Date(sub.endDate) : null;
  const daysLeft = expiry
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Billing &amp; Subscription</h1>

      <Card className="max-w-md">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <Badge className="bg-primary">{plan?.name ?? "No active plan"}</Badge>
            {daysLeft !== null && (
              <span className="font-semibold">{daysLeft} Days Remaining</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Current Plan</p>
              <p className="font-medium">{plan?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Active Since</p>
              <p className="font-medium">
                {sub?.startDate
                  ? new Date(sub.startDate).toLocaleDateString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {usage && (
        <div>
          <p className="text-sm font-medium mb-3">Usage Details</p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {([
              ["Members", usage.members, usage.limits.members],
              ["Tables", usage.tables, usage.limits.tables],
              ["Dishes", usage.dishes, usage.limits.dishes],
              ["Customers", usage.customers, usage.limits.customers],
              ["Spaces", usage.spaces, usage.limits.spaces],
            ] as Array<[string, number, number]>).map(([label, used, limit]) => {
              const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              return (
                <Card key={label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold mt-1">
                      {used}/{limit || "∞"}
                    </p>
                    <div className="h-1 rounded bg-muted mt-2 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tax and VAT settings live under Restaurant Details → Billing &amp; Tax.
      </p>
    </div>
  );
}
