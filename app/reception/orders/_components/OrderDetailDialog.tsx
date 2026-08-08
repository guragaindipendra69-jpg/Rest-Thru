"use client";

import { Ban, Printer, Receipt, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

import { hasBill, orderPlaceLabel, orderTypeMeta } from "./shared";

export default function OrderDetailDialog({
  open,
  onOpenChange,
  order,
  billingGroup,
  groupItems,
  groupSubtotal,
  groupTotal,
  onVoidItem,
  onVoidOrder,
  onCheckout,
  onShowBill,
  onPrintKot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  billingGroup: any[];
  groupItems: any[];
  groupSubtotal: number;
  groupTotal: number;
  onVoidItem: (item: any) => void;
  onVoidOrder: (order: any) => void;
  onCheckout: () => void;
  onShowBill: () => void;
  onPrintKot: () => void;
}) {
  const billed = hasBill(order);
  const cancelled = order?.status === "CANCELLED";
  const { Icon, label: typeLabel } = orderTypeMeta(order?.orderType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <DialogTitle className="text-xl">
              {order ? orderPlaceLabel(order) : "Order details"}
            </DialogTitle>
            <Badge
              variant="outline"
              className={cn(
                billed && "border-success/40 bg-success/10 text-success",
                cancelled &&
                  "border-destructive/40 bg-destructive/10 text-destructive",
                !billed && !cancelled && "border-warning/40 bg-warning-surface"
              )}
            >
              {billed ? "Billed" : cancelled ? "Cancelled" : "Unpaid"}
            </Badge>
          </div>
          <DialogDescription className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            {typeLabel}
            <span className="text-border">·</span>
            <span className="font-mono">#{order?.orderId}</span>
          </DialogDescription>
        </DialogHeader>

        {order && (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-sm font-semibold">Order items</h3>
                {billingGroup.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    all {billingGroup.length} unpaid rounds on this table (
                    {billingGroup.map((o: any) => `#${o.orderId}`).join(", ")})
                    settle as one bill
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="divide-y divide-border">
                  {groupItems.map((item: any) => {
                    const voided =
                      item.status === "CANCELLED" || item.status === "VOIDED";
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                      >
                        <span className="flex min-w-0 items-baseline gap-2.5">
                          <span className="w-8 flex-shrink-0 text-xs font-semibold tabular-nums text-primary">
                            {item.quantity}&times;
                          </span>
                          <span
                            className={cn(
                              "truncate",
                              voided && "text-muted-foreground line-through"
                            )}
                          >
                            {item.menuItemName}
                          </span>
                        </span>
                        <div className="flex flex-shrink-0 items-center gap-3">
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              voided && "text-muted-foreground line-through"
                            )}
                          >
                            {formatCurrency(item.pricePerUnit * item.quantity)}
                          </span>
                          {!voided && !billed && (
                            <button
                              type="button"
                              onClick={() => onVoidItem(item)}
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title={`Void ${item.menuItemName}`}
                              aria-label={`Void ${item.menuItemName}`}
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5 border-t border-border bg-muted/40 px-3 py-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      {formatCurrency(groupSubtotal)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-xl tabular-nums">
                      {formatCurrency(groupTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {order.specialRequests && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Special requests</h3>
                <p className="rounded-xl border border-warning/30 bg-warning-surface/50 p-3 text-sm">
                  {order.specialRequests}
                </p>
              </section>
            )}

            {/* Billing is all this dialog does — payment is taken on the
                checkout screen, which prices the whole table rather than the
                single round that was tapped. */}
            {!billed && !cancelled && (
              <Button
                className="h-12 w-full gap-2 rounded-xl text-base font-semibold"
                onClick={onCheckout}
              >
                <Wallet className="h-5 w-5" />
                Checkout {formatCurrency(groupTotal)}
              </Button>
            )}

            {billed && (
              <Button
                variant="outline"
                className="h-11 w-full gap-2 rounded-xl"
                onClick={onShowBill}
              >
                <Receipt className="h-4 w-4" /> Show bill
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {/* Reprint — printers jam and kitchens mislay dockets. */}
            {order && !cancelled && (
              <Button
                variant="outline"
                className="gap-1.5 rounded-lg"
                onClick={onPrintKot}
              >
                <Printer className="h-4 w-4" /> Print KOT
              </Button>
            )}
            {/* One destructive action, not two. Void is the audited path — it
                records who and why — so it covers every unbilled order. */}
            {order && !billed && !cancelled && (
              <Button
                variant="outline"
                onClick={() => onVoidOrder(order)}
                className="gap-1.5 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Ban className="h-4 w-4" /> Void order
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
