"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Pencil,
  QrCode as QrIcon,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import {
  STATUS_META,
  STATUS_ORDER,
  tableLabel,
  type TableRow,
  type TableStatus,
} from "./shared";

/**
 * Everything about one table in a side sheet rather than a modal, so the board
 * behind it stays readable — useful when a receptionist is comparing this table
 * against the rest of the room.
 *
 * Status is a row of one-tap targets, not a dropdown: changing state is the
 * single most frequent thing done here and should never cost two clicks.
 */
export default function TableDetailSheet({
  open,
  onOpenChange,
  table,
  restaurantId,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: TableRow | null;
  restaurantId: string;
  onStatusChange: (table: TableRow, status: TableStatus) => Promise<boolean>;
  onEdit: (table: TableRow) => void;
  onDelete: (table: TableRow) => void;
}) {
  const [busy, setBusy] = useState<TableStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Read after mount: NEXT_PUBLIC_APP_URL keeps a QR printed from a laptop
  // pointing at the public domain instead of localhost, and deferring the
  // window fallback avoids a server/client hydration mismatch.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) {
      setShowQr(false);
      setCopied(false);
    }
  }, [open]);

  if (!table) return null;

  const meta = STATUS_META[table.status] ?? STATUS_META.available;
  const qrUrl = `${origin}/r/${restaurantId}/t/${table.id}${
    table.qrCode ? `?k=${table.qrCode}` : ""
  }`;

  const change = async (status: TableStatus) => {
    setBusy(status);
    const ok = await onStatusChange(table, status);
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  };

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${table.number}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-2 text-left">
          <div className="flex flex-wrap items-center gap-2.5">
            <SheetTitle className="text-xl">{tableLabel(table)}</SheetTitle>
            <Badge variant="outline" className={cn("font-medium", meta.badge)}>
              {meta.label}
            </Badge>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono">T{table.number}</span>
            <span className="text-border">·</span>
            <Users className="h-3.5 w-3.5" />
            {table.capacity} seats
            {table.space && (
              <>
                <span className="text-border">·</span>
                {table.space}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="mb-2.5 text-sm font-semibold">Set status</h3>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_ORDER.map((s) => {
                const current = table.status === s;
                const target = STATUS_META[s];
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={current || busy !== null}
                    onClick={() => change(s)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-default",
                      current
                        ? "border-primary bg-primary-light/60"
                        : "border-border bg-card hover:border-primary/30 hover:bg-muted/50 disabled:opacity-50"
                    )}
                  >
                    {busy === s ? (
                      <Loader2 className="h-2.5 w-2.5 flex-shrink-0 animate-spin" />
                    ) : (
                      <span className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", target.dot)} />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {target.label}
                        {current && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            now
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {target.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Guest QR</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQr((v) => !v)}
                className="h-8 gap-1.5 rounded-lg text-muted-foreground"
              >
                <QrIcon className="h-3.5 w-3.5" />
                {showQr ? "Hide" : "Show"}
              </Button>
            </div>

            {showQr && (
              <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
                <div
                  ref={qrRef}
                  className="mx-auto w-fit rounded-xl border border-border bg-white p-3"
                >
                  {origin ? (
                    <QRCode value={qrUrl} size={168} bgColor="#fff" fgColor="#0f172a" level="H" />
                  ) : (
                    <div className="h-[168px] w-[168px] animate-pulse rounded bg-muted" />
                  )}
                </div>
                <p className="break-all text-center text-[11px] text-muted-foreground">
                  {qrUrl}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={copyLink}
                    className="h-9 flex-1 gap-1.5 rounded-lg"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={downloadQr}
                    className="h-9 flex-1 gap-1.5 rounded-lg"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This code is reissued each time the table is cleared, so an old
                  printout stops working after checkout. Reprint from QR codes
                  when you re-sticker.
                </p>
              </div>
            )}
          </section>

          <section className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => onEdit(table)}
              className="flex-1 gap-1.5 rounded-lg"
            >
              <Pencil className="h-4 w-4" /> Edit details
            </Button>
            <Button
              variant="outline"
              onClick={() => onDelete(table)}
              className="gap-1.5 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
