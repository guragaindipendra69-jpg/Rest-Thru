"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, MessageSquare, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getSupportTickets, createSupportTicket } from "@/lib/actions/settings-pages";
import { TicketChat } from "@/components/shared/ticket-chat";
import { useAuthStore } from "@/store/auth-store";

const STATUS_TONE: Record<string, string> = {
  OPEN: "text-warning-strong border-warning/40",
  IN_PROGRESS: "text-info border-info/40",
  RESOLVED: "text-success border-success/40",
  CLOSED: "text-muted-foreground",
};

export default function SupportPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Opening a ticket shows the thread. Support replies were previously
  // write-only: the superadmin console could answer a ticket and the owner had
  // no surface that rendered the answer, so this page showed a status badge
  // changing with no visible reason.
  const [openTicket, setOpenTicket] = useState<any | null>(null);

  const load = () =>
    getSupportTickets()
      .then((res: any) => {
        if (res.error) { toast.error(res.error); return; }
        setTickets(res.data);
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSaving(true);
    const res: any = await createSupportTicket({ subject, message });
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Feedback sent — we'll get back to you.");
    setOpen(false);
    setSubject("");
    setMessage("");
    load();
  };

  if (openTicket) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">{openTicket.subject}</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              #{openTicket.id.slice(-8).toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_TONE[openTicket.status] ?? ""}>
              {openTicket.status.replace("_", " ")}
            </Badge>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { setOpenTicket(null); load(); }}>
              <ArrowLeft className="w-4 h-4" /> All tickets
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 border-b bg-muted/30">
            <p className="text-sm whitespace-pre-wrap">{openTicket.message}</p>
          </CardContent>
          {/* Fixed height so the thread scrolls inside the card rather than
              pushing the composer below the fold on a long conversation. */}
          <CardContent className="p-0 h-[26rem]">
            <TicketChat ticketId={openTicket.id} currentUserId={user?.id ?? ""} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Support &amp; Feedback</h1>
        <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Give Feedback
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-medium">No Support &amp; Feedback found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Raise a ticket and it will appear here with its status.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium w-12">SN</th>
                  <th className="p-3 font-medium w-40">Ticket No.</th>
                  <th className="p-3 font-medium">Subject</th>
                  <th className="p-3 font-medium w-44">Reported At</th>
                  <th className="p-3 font-medium w-32">Status</th>
                  <th className="p-3 font-medium w-28 text-right">Thread</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setOpenTicket(t)}
                  >
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    {/* Tickets have no human-facing number, so the id tail stands in. */}
                    <td className="p-3 font-mono text-xs">#{t.id.slice(-8).toUpperCase()}</td>
                    <td className="p-3">{t.subject}</td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={STATUS_TONE[t.status] ?? ""}>
                        {t.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t.replyCount > 0 ? t.replyCount : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Give Feedback</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the issue or idea…"
                className="w-full min-h-[130px] rounded-md border bg-background p-3 text-sm resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !subject.trim() || !message.trim()} onClick={submit}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
