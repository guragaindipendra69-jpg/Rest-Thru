"use client";

import {
  Banknote,
  CreditCard,
  Loader2,
  Smartphone,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format";

// Selected-method fills. Each repeats itself as its own hover, because the
// Button `default` variant ships `hover:bg-primary-hover` and would otherwise
// snap the chosen wallet back to green mid-hover. All four clear 4.5:1
// against the white label they carry.
const PAYMENT_METHODS = [
  { id: "CASH", label: "Cash", Icon: Banknote, color: "bg-primary hover:bg-primary-hover" },
  { id: "ESEWA", label: "eSewa", Icon: Smartphone, color: "bg-success-strong hover:bg-success-strong" },
  { id: "KHALTI", label: "Khalti", Icon: Wallet, color: "bg-brand-strong hover:bg-brand-strong" },
  { id: "FONEPAY", label: "Fonepay", Icon: CreditCard, color: "bg-info-strong hover:bg-info-strong" },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

/**
 * Tender entry: method, wallet QR, cash received, running balance and settle.
 *
 * Sticky from `xl` up so the cashier can scroll the itemised bill on the left
 * without losing the Due figure and the Pay button out of the top of the frame.
 */
export function PaymentPanel({
  bill,
  payMethod,
  onPayMethodChange,
  amountReceived,
  onAmountReceivedChange,
  remainingDue,
  changeValue,
  isProcessing,
  paymentQR,
  showQR,
  pendingWalletPayments,
  verifyingPaymentId,
  onGenerateQR,
  onManualVerify,
  onRecordPayment,
  onQuickSettle,
}: {
  bill: any;
  payMethod: string;
  onPayMethodChange: (method: string) => void;
  amountReceived: string;
  onAmountReceivedChange: (value: string) => void;
  remainingDue: number;
  changeValue: number;
  isProcessing: boolean;
  paymentQR: { qrDataUrl: string; ref: string } | null;
  showQR: boolean;
  pendingWalletPayments: any[];
  verifyingPaymentId: string | null;
  onGenerateQR: () => void;
  onManualVerify: (paymentId: string) => void;
  onRecordPayment: () => void;
  onQuickSettle: () => void;
}) {
  return (
    <Card className="xl:sticky xl:top-20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Method</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((pm) => {
              const Icon = pm.Icon;
              return (
                <Button
                  key={pm.id}
                  variant={payMethod === pm.id ? "default" : "outline"}
                  size="lg"
                  onClick={() => onPayMethodChange(pm.id)}
                  className={`justify-start gap-2 py-3 text-sm ${payMethod === pm.id ? pm.color : ""}`}
                >
                  <Icon className="w-5 h-5" />
                  {pm.label}
                </Button>
              );
            })}
          </div>
        </div>

        {payMethod !== "CASH" && payMethod !== "CORPORATE" && (
          <div>
            <Button variant="outline" size="sm" className="mb-2 w-full" onClick={onGenerateQR}>
              <Smartphone className="mr-1 h-3 w-3" /> Generate QR
            </Button>
            {showQR && paymentQR && (
              <div className="flex flex-col items-center rounded bg-muted/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={paymentQR.qrDataUrl} alt="Payment QR" className="h-40 w-40" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan to pay {formatCurrency(remainingDue)} via {payMethod}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">Ref: {paymentQR.ref}</p>
                {pendingWalletPayments.length === 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    Waiting for payment...
                  </div>
                )}
              </div>
            )}
            {pendingWalletPayments.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted-foreground">Pending wallet payments:</p>
                {pendingWalletPayments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded bg-muted/30 p-1.5 text-xs">
                    <span>{p.method} — {formatCurrency(p.amount)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => onManualVerify(p.id)}
                      disabled={verifyingPaymentId === p.id}
                    >
                      {verifyingPaymentId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {payMethod === "CASH" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Amount Received</p>
            <Input
              type="number"
              placeholder={remainingDue.toFixed(2)}
              value={amountReceived}
              onChange={(e) => onAmountReceivedChange(e.target.value)}
              className="text-lg font-semibold"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {QUICK_AMOUNTS.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => onAmountReceivedChange(amt.toString())}
                  className="text-xs"
                >
                  {formatCurrency(amt)}
                </Button>
              ))}
            </div>
            {changeValue > 0 && (
              <div className="mt-2 rounded border border-success/20 bg-success/10 p-2 text-center">
                <p className="text-xs text-muted-foreground">Change to return</p>
                <p className="text-lg font-bold text-success">{formatCurrency(changeValue)}</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1 rounded bg-muted/50 p-3">
          <div className="flex justify-between text-sm">
            <span>Total</span>
            <span>{formatCurrency(bill.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Paid</span>
            <span>{formatCurrency(bill.amountPaid)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base font-semibold">
            <span>Due</span>
            <span className={remainingDue <= 0 ? "text-success" : "text-destructive"}>
              {formatCurrency(remainingDue)}
            </span>
          </div>
        </div>

        {bill.payments?.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Tender History</p>
            <div className="space-y-1">
              {bill.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between rounded bg-muted/30 p-1.5 text-xs">
                  <span>{p.method}</span>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {remainingDue > 0 && (
          <SettleDialog
            label={
              payMethod === "CASH" && amountReceived
                ? `Pay ${formatCurrency(Math.min(parseFloat(amountReceived) || remainingDue, remainingDue))}`
                : `Pay ${formatCurrency(remainingDue)}`
            }
            description={`Receive ${formatCurrency(remainingDue)} via ${payMethod}? This action cannot be undone.`}
            isProcessing={isProcessing}
            onConfirm={payMethod === "CASH" ? onRecordPayment : onQuickSettle}
          />
        )}

        {remainingDue <= 0 && bill.status !== "PAID" && (
          <SettleDialog
            label="Confirm Payment"
            description={`Confirm final payment of ${formatCurrency(remainingDue)} via ${payMethod}? This action cannot be undone.`}
            isProcessing={isProcessing}
            onConfirm={onQuickSettle}
          />
        )}

        {bill.status === "PAID" && (
          <div className="rounded bg-success/10 p-2 text-center">
            <p className="text-sm font-semibold text-success">Payment Complete</p>
            <p className="mt-1 text-xs text-muted-foreground">Change: {formatCurrency(bill.change)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettleDialog({
  label,
  description,
  isProcessing,
  onConfirm,
}: {
  label: string;
  description: string;
  isProcessing: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="w-full gap-1" size="lg" disabled={isProcessing}>
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settle Payment?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Settle</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
