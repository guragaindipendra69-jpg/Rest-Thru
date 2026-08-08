"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Download } from "lucide-react";
import { formatBSDate, formatBillNo, formatInvoiceNo } from "@/lib/format";
import { useAuthStore } from "@/store/auth-store";
import { formatReceiptHTML, printReceipt, downloadReceiptPdf } from "@/lib/printing";
import { toast } from "sonner";

/** Pulls the plain-text invoice out of the printable HTML for the on-screen preview. */
function extractPreText(html: string): string {
  const match = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!match) return "";
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

interface ReceiptRestaurant {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  phoneNumber?: string;
  websiteUrl?: string | null;
  vatRegistered?: boolean;
  taxPercentage?: number;
  panNumber?: string | null;
  vatNumber?: string | null;
}

interface BillData {
  billNumber?: string;
  subtotal: number;
  taxAmount?: number;
  taxableAmount?: number;
  serviceCharge?: number;
  discountAmount?: number;
  totalAmount: number;
  amountPaid?: number;
  change?: number;
  paymentMethod?: string;
  status?: string;
  createdAt?: string;
  settledAt?: string;
  /** Populated by settleOrder/getBill/createBillDraft alongside the bill. */
  orderNo?: string | null;
  tableNo?: string | null;
  customerName?: string | null;
  waiterName?: string | null;
  restaurant?: ReceiptRestaurant;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReceiptItem[];
  bill?: BillData;
  orderId?: string;
  tableName?: string;
  /** Raw order type (DINE_IN / DELIVERY / …); rendered human-readable. */
  orderType?: string;
}

export default function BillReceiptDialog({
  open,
  onOpenChange,
  items,
  bill,
  orderId,
  tableName,
  orderType,
}: Props) {
  const ORDER_TYPE_LABELS: Record<string, string> = {
    DINE_IN: "Dine In",
    TAKEAWAY: "Take away",
    DELIVERY: "Delivery",
    PICKUP: "Pick up",
  };
  const orderTypeLabel = orderType
    ? ORDER_TYPE_LABELS[orderType.toUpperCase()] ?? orderType
    : "";
  const { restaurant: storeRestaurant } = useAuthStore();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [printLoading, setPrintLoading] = useState(false);

  // The bill carries its own restaurant snapshot (settleOrder/getBill/createBillDraft
  // all attach one) — prefer that over the session-wide store since it's fetched
  // fresh alongside the bill.
  const restaurant: ReceiptRestaurant = bill?.restaurant || (storeRestaurant as any) || {};

  const addrStr = [restaurant.street, restaurant.city, restaurant.state]
    .filter(Boolean)
    .join(", ");
  const phoneStr = restaurant.phoneNumber || "";

  const billDate = bill?.settledAt || bill?.createdAt || new Date().toISOString();
  const dateObj = new Date(billDate);
  const adDateStr = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const bsDateStr = formatBSDate(dateObj);
  const timeStr = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const billNumber = bill?.billNumber || orderId || "N/A";
  const invoiceNo = bill?.billNumber ? formatInvoiceNo(bill.billNumber, dateObj) : "N/A";
  const billNo = bill?.billNumber ? formatBillNo(bill.billNumber) : billNumber;

  const subtotal = bill?.subtotal ?? 0;
  const discountAmount = bill?.discountAmount ?? 0;
  const discountPercent = subtotal > 0 && discountAmount > 0 ? (discountAmount / subtotal) * 100 : undefined;
  const totalAmount = bill?.totalAmount ?? 0;
  // Bills are settled to the paisa; the printed invoice rounds to the nearest
  // rupee and shows the difference so the two numbers reconcile on paper.
  const roundedTotal = Math.round(totalAmount);
  const roundOff = roundedTotal - totalAmount;
  const orderNoStr = bill?.orderNo
    ? `ORD-${bill.orderNo.toString().padStart(5, "0")}`
    : orderId
    ? `ORD-${orderId.toString().padStart(5, "0")}`
    : null;
  const tableNoStr = bill?.tableNo || tableName || (orderTypeLabel ? orderTypeLabel : null);

  // Single source of truth so the saved copy matches the printed one exactly.
  const buildReceiptHtml = () =>
    formatReceiptHTML({
      restaurantName: restaurant.name || "Restaurant",
      address: addrStr,
      phone: phoneStr,
      panNumber: restaurant.panNumber,
      vatRegistered: restaurant.vatRegistered,
      vatNumber: restaurant.vatNumber,
      taxPercentage: restaurant.taxPercentage,
      invoiceNo,
      billNo,
      adDate: adDateStr,
      bsDate: bsDateStr,
      time: timeStr,
      tableNo: tableNoStr,
      orderNo: orderNoStr,
      customerName: bill?.customerName || undefined,
      waiterName: bill?.waiterName,
      items,
      subtotal,
      discountAmount,
      discountPercent,
      taxableAmount: bill?.taxableAmount,
      taxAmount: bill?.taxAmount ?? 0,
      serviceCharge: bill?.serviceCharge,
      roundOff,
      totalAmount,
      amountPaid: bill?.amountPaid ?? 0,
      change: bill?.change ?? 0,
      paymentMethod: bill?.paymentMethod || "N/A",
      websiteUrl: restaurant.websiteUrl || undefined,
    });

  const handlePrint = () => {
    setPrintLoading(true);
    if (!printReceipt(buildReceiptHtml())) {
      toast.error("Couldn't open the printer — check your browser's print settings.");
    }
    setTimeout(() => setPrintLoading(false), 1000);
  };

  const handleDownload = () => {
    const name = `bill-${billNumber}`;
    if (downloadReceiptPdf(buildReceiptHtml(), name)) {
      toast.success("Bill downloaded");
    } else {
      toast.error("Couldn't download the bill.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">Bill Receipt</DialogTitle>
        <div className="bg-gradient-to-b from-primary/5 to-background p-6">
          {/* Receipt preview — extracted straight from the same HTML the printer
              and download get, so what's on screen can never drift from paper. */}
          <div
            ref={receiptRef}
            className="bg-white rounded-xl shadow-lg p-4 mx-auto overflow-x-auto"
            style={{ maxWidth: "320px" }}
          >
            <pre className="text-black text-[10px] leading-[1.35] font-mono whitespace-pre">
              {extractPreText(buildReceiptHtml())}
              {bill?.status === "PAID" ? "\n\n*** PAID ***" : ""}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handlePrint}
              disabled={printLoading}
            >
              {printLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
