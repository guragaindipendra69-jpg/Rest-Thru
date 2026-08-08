"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getUsersAndRoles, setUserActive } from "@/lib/actions/settings-pages";

const ROLE_LABELS: Record<string, string> = {
  RESTAURANT_OWNER: "Owner",
  MANAGER: "Manager",
  RECEPTIONIST: "Reception",
  WAITER: "Server",
  KITCHEN: "Kitchen",
  STAFF: "Staff",
};

export default function UsersRolePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    getUsersAndRoles()
      .then((res: any) => {
        if (res.error) { toast.error(res.error); return; }
        setData(res.data);
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const toggle = async (userId: string, next: boolean) => {
    setBusy(userId);
    const res: any = await setUserActive(userId, next);
    setBusy(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success(next ? "User activated" : "User deactivated");
    load();
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!data) return <p className="text-sm text-muted-foreground">Couldn&apos;t load users.</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Users Role</h1>

      <div>
        <p className="text-sm font-medium mb-3">Default Roles</p>
        <div className="flex flex-wrap gap-3">
          {data.roles.map((r: any) => (
            <Card key={r.role} className="w-[190px]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <p className="font-medium text-sm">{ROLE_LABELS[r.role] ?? r.role}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total User: {String(r.count).padStart(2, "0")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-3">Members</p>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {data.users.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium w-32">Role</th>
                    <th className="p-3 font-medium w-40">Last Login</th>
                    <th className="p-3 font-medium w-24">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u: any) => (
                    <tr key={u.id} className="border-t">
                      <td className="p-3">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{u.email}</td>
                      <td className="p-3">
                        <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString("en-GB", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : "Never"}
                      </td>
                      <td className="p-3">
                        {busy === u.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Switch checked={u.isActive} onCheckedChange={(v) => toggle(u.id, v)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground mt-2">
          Roles are assigned when a user is created under Staff Management. Deactivating a
          user blocks their sign-in immediately.
        </p>
      </div>
    </div>
  );
}
