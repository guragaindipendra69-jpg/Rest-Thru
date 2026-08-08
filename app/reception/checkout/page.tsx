"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Banknote,
  Pause,
  Printer,
  Send,
  Loader2,
  Search,
  DollarSign,
  RotateCcw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsolePage } from "@/components/shared/console-page";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import {
  getPendingBills,
  getBill,
  createBillDraft,
  recordPayment,
  holdBill,
  resumeHeldBill,
  popCashDrawer,
  splitBill,
  applyDiscountToBill,
  applyCouponToBill,
  applyCorporateAccountToBill,
} from "@/lib/actions/bills";
import { getOrdersWithItems } from "@/lib/actions/dashboard";
import {
  getCorporateAccounts,
  getCustomerByPhone,
} from "@/lib/actions/crm";
import {
  generatePaymentQR,
  verifyPayment,
  getPendingWalletPayments,
} from "@/lib/actions/payments";
import { formatReceiptHTML, printReceipt } from "@/lib/printing";
import { formatBSDate, formatBillNo, formatInvoiceNo } from "@/lib/format";
import ScannerInput from "@/components/dashboard/scanner-input";
import { OrderQueue } from "./_components/OrderQueue";
import { BillSummary } from "./_components/BillSummary";
import { PaymentPanel } from "./_components/PaymentPanel";
import { DiscountPanel } from "./_components/DiscountPanel";

type BillWithRelations = any;

export default function CheckoutPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id;

  const [pendingBills, setPendingBills] = useState<BillWithRelations[]>([]);
  const [unbilledOrders, setUnbilledOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBill, setActiveBill] = useState<BillWithRelations | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitResult, setSplitResult] = useState<{ label: string; amount: number }[] | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | "DINE_IN" | "TAKEAWAY">("all");
  const [discountInput, setDiscountInput] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [corpAccounts, setCorpAccounts] = useState<any[]>([]);
  const [selectedCorpAccount, setSelectedCorpAccount] = useState<any>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<any>(null);
  const [paymentQR, setPaymentQR] = useState<{ qrDataUrl: string; ref: string } | null>(null);
  const [pendingWalletPayments, setPendingWalletPayments] = useState<any[]>([]);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [billsRes, orders, corpRes] = await Promise.all([
      getPendingBills(),
      getOrdersWithItems(50),
      getCorporateAccounts(),
    ]);
    if ("data" in billsRes && billsRes.data) setPendingBills(billsRes.data);
    if (orders) setUnbilledOrders(orders);
    if ("data" in corpRes && corpRes.data) setCorpAccounts(corpRes.data);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    refresh();
  }, [restaurantId, refresh]);

  const readyToBillOrders = useMemo(() => {
    return unbilledOrders.filter((o: any) => {
      if (!["READY", "SERVED"].includes(o.status)) return false;
      if (o.bills?.length > 0) return false;
      if (orderTypeFilter !== "all" && o.orderType !== orderTypeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const orderMatch = o.orderId?.toLowerCase().includes(q);
        const tableMatch = o.table?.tableNumber?.toString().includes(q);
        const nameMatch = o.customerName?.toLowerCase().includes(q);
        if (!orderMatch && !tableMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [unbilledOrders, orderTypeFilter, searchQuery]);

  const heldBills = useMemo(
    () => pendingBills.filter((b: any) => b.status === "HELD"),
    [pendingBills]
  );

  const activePendingBills = useMemo(
    () => pendingBills.filter((b: any) => b.status === "PENDING"),
    [pendingBills]
  );

  const handleSelectOrder = async (order: any) => {
    const result = await createBillDraft(order.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if ("data" in result) setActiveBill(result.data);
    setAmountReceived("");
    setPayMethod("CASH");
    setSplitResult(null);
  };

  const handleResumeHeld = async (bill: any) => {
    const result = await resumeHeldBill(bill.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if ("data" in result) setActiveBill(result.data);
    setAmountReceived("");
    setPayMethod("CASH");
    setSplitResult(null);
    refresh();
  };

  const handleSelectPending = (bill: any) => {
    setActiveBill(bill);
    setAmountReceived("");
    setPayMethod("CASH");
    setSplitResult(null);
  };

  const handleHold = async () => {
    if (!activeBill) return;
    const result = await holdBill(activeBill.id);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Bill parked");
    setActiveBill(null);
    refresh();
  };

  const handleRecordPayment = async () => {
    if (!activeBill) return;
    const amount = parseFloat(amountReceived) || activeBill.totalAmount;
    if (amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setIsProcessing(true);
    const result = await recordPayment({
      billId: activeBill.id,
      method: payMethod,
      amount: Math.min(amount, activeBill.totalAmount - activeBill.amountPaid),
      reference: payMethod !== "CASH" ? `txn-${Date.now()}` : undefined,
    });
    setIsProcessing(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if (!("data" in result)) return;

    const updatedBill: any = result.data;
    setActiveBill(updatedBill);

    if (updatedBill.status === "PAID") {
      toast.success(
        `Payment complete — change: ${formatCurrency(updatedBill.change)}`
      );
      setActiveBill(null);
      refresh();
    } else {
      toast.success(`Payment recorded (${formatCurrency(updatedBill.amountPaid)} of ${formatCurrency(updatedBill.totalAmount)})`);
    }
  };

  const handleQuickSettle = async () => {
    if (!activeBill) return;

    setIsProcessing(true);
    const result = await recordPayment({
      billId: activeBill.id,
      method: payMethod,
      amount: activeBill.totalAmount - activeBill.amountPaid,
      reference: payMethod !== "CASH" ? `txn-${Date.now()}` : undefined,
    });
    setIsProcessing(false);

    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    if (!("data" in result)) return;

    const updatedBill: any = result.data;
    if (updatedBill.status === "PAID") {
      toast.success(`Bill settled — ${formatCurrency(updatedBill.totalAmount)} (${payMethod})`);
      setActiveBill(null);
      refresh();
    } else {
      toast.success(`Partial payment recorded`);
      setActiveBill(result.data);
    }
  };

  const handleCashDrawerPop = async () => {
    const result = await popCashDrawer();
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Cash drawer pop logged");
  };

  const handleSplit = async () => {
    if (!activeBill || splitCount < 2) return;
    const result = await splitBill({
      billId: activeBill.id,
      splits: Array.from({ length: splitCount }, (_, i) => ({
        label: `Split ${i + 1}`,
      })),
    }) as any;
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.data) setSplitResult(result.data.splits);
  };

  const handleApplyDiscount = async () => {
    if (!activeBill) return;
    const amt = parseFloat(discountInput);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid discount amount"); return; }
    const result: any = await applyDiscountToBill(activeBill.id, amt, discountReason || undefined);
    if (result.error) { toast.error(result.error); return; }
    setActiveBill((prev: any) => prev ? { ...prev, discountAmount: result.data.discountAmount, totalAmount: result.data.totalAmount } : prev);
    toast.success(`Discount of ${formatCurrency(amt)} applied`);
  };

  const handleApplyCoupon = async () => {
    if (!activeBill || !couponCode) return;
    const result: any = await applyCouponToBill(activeBill.id, couponCode);
    if (result.error) { toast.error(result.error); return; }
    setAppliedCoupon(result.data);
    setActiveBill((prev: any) => prev ? { ...prev, discountAmount: result.data.discount, totalAmount: result.data.bill.totalAmount } : prev);
    toast.success(`Coupon ${couponCode.toUpperCase()} applied — ${formatCurrency(result.data.discount)} off`);
  };

  const handleApplyCorporate = async (accountId: string) => {
    if (!activeBill) return;
    const result: any = await applyCorporateAccountToBill(activeBill.id, accountId);
    if (result.error) { toast.error(result.error); return; }
    setSelectedCorpAccount(corpAccounts.find((a: any) => a.id === accountId));
    toast.success("Corporate account assigned");
  };

  const handleLookupCustomer = async () => {
    if (!customerPhone) return;
    const result: any = await getCustomerByPhone(customerPhone);
    if (result.error) { toast.error(result.error); return; }
    if (!result.data) { toast.error("Customer not found"); return; }
    setFoundCustomer(result.data);
    toast.success(`Found: ${result.data.name} (${result.data.loyaltyPoints} pts)`);
  };

  const handlePrintReceipt = () => {
    if (!activeBill) return;
    const items = (activeBill.order?.items || []).map((i: any) => ({
      name: i.menuItemName,
      qty: i.quantity,
      price: i.pricePerUnit,
      total: i.pricePerUnit * i.quantity,
    }));
    const r = restaurant as any;
    const billDate = activeBill.settledAt || activeBill.createdAt || new Date();
    const dateObj = new Date(billDate);
    const totalAmount = activeBill.totalAmount ?? 0;
    const roundedTotal = Math.round(totalAmount);
    const table = activeBill.order?.table;
    const html = formatReceiptHTML({
      restaurantName: r?.name || "Restaurant",
      address: [r?.street, r?.city, r?.state].filter(Boolean).join(", "),
      phone: r?.phoneNumber || "",
      panNumber: r?.panNumber,
      vatRegistered: r?.vatRegistered,
      vatNumber: r?.vatNumber,
      taxPercentage: r?.taxPercentage,
      invoiceNo: formatInvoiceNo(activeBill.billNumber, dateObj),
      billNo: formatBillNo(activeBill.billNumber),
      adDate: dateObj.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
      bsDate: formatBSDate(dateObj),
      time: dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      tableNo: table ? table.name || `T${table.tableNumber}` : null,
      orderNo: activeBill.order?.orderId ? `ORD-${activeBill.order.orderId.toString().padStart(5, "0")}` : null,
      customerName: activeBill.order?.customerName || undefined,
      items,
      subtotal: activeBill.subtotal,
      discountAmount: activeBill.discountAmount,
      taxableAmount: activeBill.taxableAmount,
      taxAmount: activeBill.taxAmount,
      serviceCharge: activeBill.serviceCharge,
      roundOff: roundedTotal - totalAmount,
      totalAmount,
      amountPaid: activeBill.amountPaid,
      change: activeBill.change,
      paymentMethod: activeBill.paymentMethod,
      websiteUrl: r?.websiteUrl || undefined,
    });
    if (!printReceipt(html)) {
      toast.error("Couldn't open the printer — check your browser's print settings.");
    }
  };

  const handleScannerBarcode = (barcode: string) => {
    setSearchQuery(barcode);
    toast.info(`Scanned: ${barcode}`);
  };

  const handleGenerateQR = async () => {
    if (!activeBill) return;
    const due = remainingDue;
    if (due <= 0) { toast.error("No amount due"); return; }
    const result: any = await generatePaymentQR({ billId: activeBill.id, method: payMethod, amount: due });
    if (result.error) { toast.error(result.error); return; }
    setPaymentQR(result.data);
    setShowQR(true);
  };

  const handleManualVerify = async (paymentId: string) => {
    setVerifyingPaymentId(paymentId);
    const result: any = await verifyPayment(paymentId);
    setVerifyingPaymentId(null);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Payment verified");
    const billRes: any = await getBill(activeBill!.id);
    if (!("error" in billRes) && billRes.data) setActiveBill(billRes.data);
    refresh();
  };

  const handleRefreshWalletStatus = async () => {
    if (!activeBill) return;
    const result: any = await getPendingWalletPayments(activeBill.id);
    if (!("error" in result) && result.data) setPendingWalletPayments(result.data);
  };

  useEffect(() => {
    if (!activeBill) { setPaymentQR(null); setShowQR(false); setPendingWalletPayments([]); return; }
    handleRefreshWalletStatus();
    const interval = setInterval(handleRefreshWalletStatus, 8_000);
    return () => clearInterval(interval);
  }, [activeBill?.id]);

  const remainingDue = activeBill
    ? Math.max(0, activeBill.totalAmount - activeBill.amountPaid)
    : 0;

  const changeValue = amountReceived
    ? Math.max(0, parseFloat(amountReceived) - remainingDue)
    : 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeBill) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "Enter") {
        e.preventDefault();
        if (remainingDue > 0) {
          if (payMethod === "CASH") handleRecordPayment();
          else handleQuickSettle();
        } else if (activeBill.status !== "PAID") {
          handleQuickSettle();
        }
      }
      if (ctrl && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        handleHold();
      }
      if (ctrl && e.key === "p" && e.shiftKey) {
        e.preventDefault();
        handlePrintReceipt();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeBill, remainingDue, payMethod]);

  if (loading && pendingBills.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ConsolePage>
      <ScannerInput onScan={handleScannerBarcode} />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Cashier Checkout</h1>
            <Badge className="bg-primary text-primary-foreground text-base px-3 py-1">
              {readyToBillOrders.length + activePendingBills.length} Pending
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCashDrawerPop}>
              <DollarSign className="w-4 h-4 mr-1" /> Pop Drawer
            </Button>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RotateCcw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </header>

      {/*
        Two columns from 768px up. It was `grid-cols-1 xl:grid-cols-3`, so every
        tablet -- reception's actual device -- collapsed to one column.
      */}
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:p-6 xl:grid-cols-3">
        <OrderQueue
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          orderTypeFilter={orderTypeFilter}
          onOrderTypeChange={setOrderTypeFilter}
          heldBills={heldBills}
          pendingBills={activePendingBills}
          readyToBillOrders={readyToBillOrders}
          onResumeHeld={handleResumeHeld}
          onSelectPending={handleSelectPending}
          onSelectOrder={handleSelectOrder}
        />

        <div className="md:col-span-1 xl:col-span-2">
          {activeBill ? (
            /*
              Flex stack below `xl`, so the DOM order IS the reading order:
              bill, then payment, then the rest. Only at `xl` does it become two
              columns, and the explicit col/row starts put Payment back on the
              right without a second render path.
            */
            <div className="flex flex-col gap-4 xl:grid xl:grid-cols-5">
              <div className="xl:col-span-3 xl:col-start-1 xl:row-start-1">
                <BillSummary bill={activeBill} />
              </div>

              <div className="xl:col-span-2 xl:col-start-4 xl:row-span-4 xl:row-start-1">
                <PaymentPanel
                  bill={activeBill}
                  payMethod={payMethod}
                  onPayMethodChange={setPayMethod}
                  amountReceived={amountReceived}
                  onAmountReceivedChange={setAmountReceived}
                  remainingDue={remainingDue}
                  changeValue={changeValue}
                  isProcessing={isProcessing}
                  paymentQR={paymentQR}
                  showQR={showQR}
                  pendingWalletPayments={pendingWalletPayments}
                  verifyingPaymentId={verifyingPaymentId}
                  onGenerateQR={handleGenerateQR}
                  onManualVerify={handleManualVerify}
                  onRecordPayment={handleRecordPayment}
                  onQuickSettle={handleQuickSettle}
                />
              </div>

              <div className="xl:col-span-3 xl:col-start-1 xl:row-start-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1 text-sm">
                      <Users className="w-4 h-4" /> Customer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Phone number"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                      <Button variant="outline" size="sm" onClick={handleLookupCustomer}>
                        <Search className="w-3 h-3" />
                      </Button>
                    </div>
                    {foundCustomer && (
                      <div className="mt-2 space-y-0.5 rounded bg-muted/30 p-2 text-xs">
                        <p className="font-medium">{foundCustomer.name}</p>
                        <p className="text-muted-foreground">{foundCustomer.phone}</p>
                        <p className="text-primary">{foundCustomer.loyaltyPoints} loyalty points</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="xl:col-span-3 xl:col-start-1 xl:row-start-3">
                <DiscountPanel
                  splitCount={splitCount}
                  onSplitCountChange={setSplitCount}
                  splitResult={splitResult}
                  onSplit={handleSplit}
                  discountInput={discountInput}
                  onDiscountInputChange={setDiscountInput}
                  discountReason={discountReason}
                  onDiscountReasonChange={setDiscountReason}
                  onApplyDiscount={handleApplyDiscount}
                  couponCode={couponCode}
                  onCouponCodeChange={setCouponCode}
                  onApplyCoupon={handleApplyCoupon}
                  appliedCoupon={appliedCoupon}
                  corpAccounts={corpAccounts}
                  selectedCorpAccount={selectedCorpAccount}
                  onApplyCorporate={handleApplyCorporate}
                />
              </div>

              <div className="flex flex-wrap gap-2 xl:col-span-3 xl:col-start-1 xl:row-start-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={activeBill.status === "PAID"}
                      className="flex-1"
                    >
                      <Pause className="mr-1 h-4 w-4" /> Park Bill
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Park Bill?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This bill will be held. You can resume it later from the Parked Bills list.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleHold}>Park Bill</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" className="flex-1" onClick={handlePrintReceipt}>
                  <Printer className="mr-1 h-4 w-4" /> Print
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" className="flex-1" disabled>
                        <Send className="mr-1 h-4 w-4" /> Send Digital
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Digital receipts — coming soon</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
              <Banknote className="mb-4 h-16 w-16 text-muted-foreground/60" />
              <h2 className="mb-2 text-xl font-semibold text-muted-foreground">No Active Checkout</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Select an order from the queue to start billing. Ready-to-bill orders appear
                automatically when their food is marked &quot;Served&quot;.
              </p>
            </div>
          )}
        </div>
      </div>
    </ConsolePage>
  );
}

