"use client";

import { Building2, ChevronDown, Minus, Percent, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";

/**
 * Split Bill and Discounts -- the two exception paths of a checkout.
 *
 * Both used to sit expanded between the bill and the payment entry, which on a
 * single column pushed Payment down to sixth place. They are collapsed by
 * default now: the Discounts card even shipped its own "No Discount" switch
 * defaulted on, which was the tell that most checkouts never touch it.
 */
export function DiscountPanel({
  splitCount,
  onSplitCountChange,
  splitResult,
  onSplit,
  discountInput,
  onDiscountInputChange,
  discountReason,
  onDiscountReasonChange,
  onApplyDiscount,
  couponCode,
  onCouponCodeChange,
  onApplyCoupon,
  appliedCoupon,
  corpAccounts,
  selectedCorpAccount,
  onApplyCorporate,
}: {
  splitCount: number;
  onSplitCountChange: (count: number) => void;
  splitResult: { label: string; amount: number }[] | null;
  onSplit: () => void;
  discountInput: string;
  onDiscountInputChange: (value: string) => void;
  discountReason: string;
  onDiscountReasonChange: (value: string) => void;
  onApplyDiscount: () => void;
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void;
  appliedCoupon: any;
  corpAccounts: any[];
  selectedCorpAccount: any;
  onApplyCorporate: (accountId: string) => void;
}) {
  const activeCorpAccounts = corpAccounts.filter((a: any) => a.isActive);

  return (
    <div className="space-y-3">
      <Section title="Split Bill" hint={splitResult ? `${splitResult.length} ways` : undefined}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onSplitCountChange(Math.max(2, splitCount - 1))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="min-w-[2rem] text-center font-semibold">{splitCount}</span>
          <Button variant="outline" size="sm" onClick={() => onSplitCountChange(Math.min(10, splitCount + 1))}>
            <Plus className="h-3 w-3" />
          </Button>
          <span className="ml-1 text-sm text-muted-foreground">equal split</span>
          <Button size="sm" onClick={onSplit} className="ml-auto">
            Calculate
          </Button>
        </div>
        {splitResult && (
          <div className="space-y-1 rounded bg-muted/50 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Split amounts ({splitResult.length} ways):
            </p>
            {splitResult.map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{s.label}</span>
                <span className="font-medium">{formatCurrency(s.amount)}</span>
              </div>
            ))}
            <Separator className="my-1" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total</span>
              <span>{formatCurrency(splitResult.reduce((s, r) => s + r.amount, 0))}</span>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Discounts"
        hint={appliedCoupon ? `Coupon ${appliedCoupon.coupon}` : selectedCorpAccount?.companyName}
      >
        <Tabs defaultValue="discount">
          <TabsList className="mb-2 w-full">
            <TabsTrigger value="discount" className="flex-1 text-xs">
              <Percent className="mr-1 h-3 w-3" />Discount
            </TabsTrigger>
            <TabsTrigger value="coupon" className="flex-1 text-xs">
              <Tag className="mr-1 h-3 w-3" />Coupon
            </TabsTrigger>
            <TabsTrigger value="corporate" className="flex-1 text-xs">
              <Building2 className="mr-1 h-3 w-3" />Corporate
            </TabsTrigger>
          </TabsList>
          <TabsContent value="discount" className="m-0 space-y-2">
            <Input
              type="number"
              placeholder="Discount amount"
              value={discountInput}
              onChange={(e) => onDiscountInputChange(e.target.value)}
            />
            <Input
              placeholder="Reason (optional)"
              value={discountReason}
              onChange={(e) => onDiscountReasonChange(e.target.value)}
            />
            <Button size="sm" className="w-full" onClick={onApplyDiscount}>
              Apply Discount
            </Button>
          </TabsContent>
          <TabsContent value="coupon" className="m-0 space-y-2">
            <Input
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
            />
            <Button size="sm" className="w-full" onClick={onApplyCoupon}>
              Apply Coupon
            </Button>
            {appliedCoupon && (
              <p className="text-xs text-success">
                Coupon {appliedCoupon.coupon}: {formatCurrency(appliedCoupon.discount)} off
              </p>
            )}
          </TabsContent>
          <TabsContent value="corporate" className="m-0 space-y-2">
            <p className="text-xs text-muted-foreground">Select corporate account:</p>
            <div className="flex flex-wrap gap-1">
              {activeCorpAccounts.map((a: any) => (
                <Button key={a.id} variant="outline" size="sm" onClick={() => onApplyCorporate(a.id)}>
                  {a.companyName}
                </Button>
              ))}
              {activeCorpAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No active corporate accounts</p>
              )}
            </div>
            {selectedCorpAccount && (
              <p className="text-xs text-success">Assigned: {selectedCorpAccount.companyName}</p>
            )}
          </TabsContent>
        </Tabs>
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 p-4 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
