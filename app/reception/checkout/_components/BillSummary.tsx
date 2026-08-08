"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-success",
  HELD: "bg-warning",
};

/** What the guest owes and why. The first thing the cashier reads. */
export function BillSummary({ bill }: { bill: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{bill.billNumber}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {bill.order?.table ? `Table ${bill.order.table.tableNumber}` : "Takeaway"} ·{" "}
              {bill.order?.orderType} · {bill.order?.items?.length || 0} items
            </p>
          </div>
          <Badge className={STATUS_TONE[bill.status] ?? "bg-info"}>{bill.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/*
          max-height + overflow on one element, not a ScrollArea: the Radix
          viewport is `h-full`, which resolves to auto inside a max-height-only
          Root, so it would grow past the cap and get clipped by the Root's
          `overflow-hidden` with no scrollbar to recover the hidden items.
        */}
        <div className="max-h-[300px] overflow-y-auto">
          <div className="space-y-2">
            {bill.order?.items?.map((item: any) => (
              <div key={item.id} className="flex justify-between gap-3 py-1 text-sm">
                <span className="min-w-0">
                  {item.quantity}x {item.menuItemName}
                </span>
                <span className="flex-shrink-0 font-medium">
                  {formatCurrency(item.pricePerUnit * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Separator className="my-3" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(bill.subtotal)}</span>
          </div>
          {bill.discountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{formatCurrency(bill.discountAmount)}</span>
            </div>
          )}
          {bill.serviceCharge > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Service Charge</span>
              <span>{formatCurrency(bill.serviceCharge)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCurrency(bill.totalAmount)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
