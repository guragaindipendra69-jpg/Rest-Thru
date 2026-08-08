"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getActivityLogPage } from "@/lib/actions/settings-pages";

export default function ActivityLogPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: { actionType?: string; query?: string }) => {
      setLoading(true);
      const res: any = await getActivityLogPage({
        actionType: opts?.actionType ?? type,
        query: opts?.query ?? query,
      });
      setLoading(false);
      if (res.error) { toast.error(res.error); return; }
      setRows(res.data.logs);
      // Keep the full type list from the unfiltered load so filtering doesn't
      // shrink the options down to whatever is currently on screen.
      setTypes((prev) => (prev.length ? prev : res.data.actionTypes));
    },
    [type, query]
  );

  useEffect(() => { load({ actionType: "ALL", query: "" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Activity Log</h1>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          />
        </div>
        <select
          className="h-10 rounded-md border border-border-control bg-background px-3 text-sm"
          value={type}
          onChange={(e) => { setType(e.target.value); load({ actionType: e.target.value }); }}
        >
          <option value="ALL">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline" onClick={() => load()}>Filter</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No activity recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium w-12">SN</th>
                  <th className="p-3 font-medium w-44">Date</th>
                  <th className="p-3 font-medium w-40">Type</th>
                  <th className="p-3 font-medium">Description</th>
                  <th className="p-3 font-medium w-36">Performed By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="font-normal">{r.actionType}</Badge>
                    </td>
                    <td className="p-3">{r.description}</td>
                    <td className="p-3">{r.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
