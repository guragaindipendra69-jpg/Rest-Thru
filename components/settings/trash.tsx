"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { getTrashItems } from "@/lib/actions/settings-pages";

export default function TrashPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "VOID_INVOICE">("ALL");
  const [loading, setLoading] = useState(true);

  const load = (f: "ALL" | "VOID_INVOICE") => {
    setLoading(true);
    getTrashItems(f)
      .then((res: any) => {
        if (res.error) { toast.error(res.error); return; }
        setRows(res.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trash</h1>

      <div className="flex gap-2">
        {([["ALL", "All"], ["VOID_INVOICE", "Void Invoice"]] as const).map(([v, l]) => (
          <Button
            key={v}
            variant={filter === v ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(v)}
          >
            {l}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-medium">No Trash found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Voided invoices and cancelled orders appear here.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium w-12">SN</th>
                  <th className="p-3 font-medium">Particular</th>
                  <th className="p-3 font-medium w-36">Type</th>
                  <th className="p-3 font-medium w-28">Amount</th>
                  <th className="p-3 font-medium w-32">Deleted By</th>
                  <th className="p-3 font-medium w-44">Deleted At</th>
                  <th className="p-3 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{r.particular}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={r.type === "Void Invoice" ? "text-destructive border-destructive/40" : ""}
                      >
                        {r.type}
                      </Badge>
                    </td>
                    <td className="p-3 line-through text-muted-foreground">
                      {formatCurrency(r.amount ?? 0)}
                    </td>
                    <td className="p-3">{r.deletedBy}</td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {r.deletedAt
                        ? new Date(r.deletedAt).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Voided and cancelled records are kept permanently as an audit trail — nothing here is
        purged automatically, and these entries cannot be restored.
      </p>
    </div>
  );
}
