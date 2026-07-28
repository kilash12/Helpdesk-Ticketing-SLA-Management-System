import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client, { formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { SLATimer } from "@/components/SLATimer";
import { fmtDate, fmtRelative, PRIORITIES, STATUSES } from "@/lib/tickets";
import { AlertTriangle, CheckCircle2, ShieldAlert, Paperclip, Star, Send, Upload, ChevronsUp, Shield, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

function CommentThread({ ticket, canInternal, onReload }) {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("public");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await client.get(`/tickets/${ticket.id}/comments/`);
    setItems(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ticket.id]);
  const submit = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try {
      await client.post(`/tickets/${ticket.id}/comments/`, { message: msg, comment_type: tab });
      setMsg("");
      await load();
      onReload?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {items.length === 0 && (<div className="text-sm text-muted-foreground text-center py-6">No comments yet.</div>)}
        {items.map((c) => (
          <div key={c.id}
            className={`p-4 rounded-md border ${c.comment_type === "internal" ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50" : "border-border bg-card"}`}
            data-testid={`comment-${c.id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center font-mono text-[10px]">
                  {(c.created_by_email || "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium">{c.created_by_name || c.created_by_email}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">{c.created_by_role} · {fmtRelative(c.created_at)}</div>
                </div>
              </div>
              {c.comment_type === "internal" && <Badge className="bg-amber-100 text-amber-800 border border-amber-300">Internal note</Badge>}
            </div>
            <div className="text-sm whitespace-pre-wrap">{c.message}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="public" data-testid="tab-public-reply">Public reply</TabsTrigger>
          {canInternal && <TabsTrigger value="internal" data-testid="tab-internal-note">Internal note</TabsTrigger>}
        </TabsList>
        <TabsContent value={tab} className="mt-3">
          <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)}
            placeholder={tab === "internal" ? "Only visible to agents & admins..." : "Reply to customer..."}
            className={tab === "internal" ? "bg-amber-50 dark:bg-amber-950/20" : ""}
            data-testid={tab === "internal" ? "internal-note-input" : "public-reply-input"} />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} disabled={busy || !msg.trim()} data-testid="submit-comment-btn">
              <Send className="h-4 w-4 mr-2" />Post {tab === "internal" ? "Note" : "Reply"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Attachments({ ticket }) {
  const [items, setItems] = useState([]);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const load = async () => {
    const { data } = await client.get(`/tickets/${ticket.id}/attachments/`);
    setItems(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ticket.id]);
  const upload = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setErr(null);
    try {
      await client.post(`/tickets/${ticket.id}/attachments/`, fd);
      setFile(null);
      await load();
    } catch (e) { setErr(formatApiError(e.response?.data)); }
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && <div className="text-sm text-muted-foreground">No attachments.</div>}
      {items.map((a) => (
        <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer"
           className="flex items-center gap-3 p-3 border border-border rounded-md hover:bg-muted transition-colors"
           data-testid={`attachment-${a.id}`}>
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 truncate">
            <div className="text-sm font-medium truncate">{a.filename}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{(a.size / 1024).toFixed(1)} KB · {a.content_type}</div>
          </div>
        </a>
      ))}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
          accept=".jpg,.jpeg,.png,.pdf,.docx,.txt,.csv"
          data-testid="attachment-file-input" />
        <Button onClick={upload} disabled={!file} data-testid="attachment-upload-btn"><Upload className="h-4 w-4" /></Button>
      </div>
      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
    </div>
  );
}

function FeedbackBlock({ ticket, onSaved }) {
  const [existing, setExisting] = useState(undefined);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    client.get(`/tickets/${ticket.id}/feedback/`).then((r) => setExisting(r.data)).catch(() => setExisting(null));
  }, [ticket.id]);
  if (existing === undefined) return null;
  if (existing) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-1 mb-1">
          {[1,2,3,4,5].map((n) => (
            <Star key={n} className={`h-4 w-4 ${n <= existing.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          ))}
        </div>
        <div className="text-muted-foreground">{existing.comment || "No comment."}</div>
      </div>
    );
  }
  const submit = async () => {
    setBusy(true);
    try {
      await client.post(`/tickets/${ticket.id}/feedback/`, { rating, comment });
      onSaved?.();
      const r = await client.get(`/tickets/${ticket.id}/feedback/`);
      setExisting(r.data);
      toast.success("Thanks for your feedback!");
    } catch (e) {
      toast.error(formatApiError(e.response?.data));
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} data-testid={`feedback-star-${n}`}>
            <Star className={`h-6 w-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <Textarea rows={3} placeholder="Optional comment..." value={comment} onChange={(e) => setComment(e.target.value)}
        data-testid="feedback-comment-input" />
      <Button onClick={submit} disabled={busy} data-testid="feedback-submit-btn">Submit feedback</Button>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState(null);
  const [agents, setAgents] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [escReason, setEscReason] = useState("");
  const [escOpen, setEscOpen] = useState(false);

  const load = async () => {
    try {
      const { data } = await client.get(`/tickets/${id}/`);
      setTicket(data);
    } catch (e) { setErr(formatApiError(e.response?.data)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (user?.role === "admin" && ticket?.department) {
      client.get(`/agents/?department=${ticket.department}`).then((r) => setAgents(r.data));
    }
  }, [user?.role, ticket?.department]);

  const isOwner = user && ticket && ticket.created_by === user.id;
  const canInternal = user && (user.role === "agent" || user.role === "admin");

  const act = async (fn, ...args) => {
    try {
      await fn(...args);
      await load();
      toast.success("Updated");
    } catch (e) { toast.error(formatApiError(e.response?.data)); }
  };

  if (err) return <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>;
  if (!ticket) return <div className="text-muted-foreground">Loading...</div>;

  const doSelfAssign = () => client.post(`/tickets/${ticket.id}/self-assign/`);
  const doAssign = () => client.post(`/tickets/${ticket.id}/assign/`, { agent_id: Number(assignTo) });
  const doStatus = (s) => client.post(`/tickets/${ticket.id}/change-status/`, { status: s });
  const doPriority = (p) => client.post(`/tickets/${ticket.id}/change-priority/`, { priority: p });
  const doEscalate = async () => { await client.post(`/tickets/${ticket.id}/escalate/`, { reason: escReason }); setEscOpen(false); setEscReason(""); };
  const doResolve = () => client.post(`/tickets/${ticket.id}/resolve/`);
  const doClose = () => client.post(`/tickets/${ticket.id}/close/`);
  const doReopen = () => client.post(`/tickets/${ticket.id}/reopen/`);

  return (
    <div className="space-y-6 animate-in-fade" data-testid="ticket-detail-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="font-mono text-xs uppercase text-muted-foreground">{ticket.ticket_number}</div>
          <h1 className="font-display text-3xl font-bold" data-testid="ticket-subject">{ticket.subject}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="text-xs text-muted-foreground">Created {fmtRelative(ticket.created_at)} by {ticket.created_by_email}</span>
          </div>
        </div>
        <Link to="/tickets" className="text-sm text-muted-foreground hover:text-foreground">← Back to list</Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent><div className="whitespace-pre-wrap text-sm">{ticket.description}</div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
            <CardContent><CommentThread ticket={ticket} canInternal={canInternal} onReload={load} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
            <CardContent><Attachments ticket={ticket} /></CardContent>
          </Card>

          {(ticket.status === "resolved" || ticket.status === "closed") && isOwner && (
            <Card>
              <CardHeader><CardTitle>Rate your experience</CardTitle></CardHeader>
              <CardContent><FeedbackBlock ticket={ticket} onSaved={load} /></CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>SLA</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <SLATimer dueAt={ticket.first_response_due_at} respondedAt={ticket.first_responded_at}
                totalMinutes={ticket.sla_first_response_minutes} label="First Response" />
              <SLATimer dueAt={ticket.resolution_due_at} respondedAt={ticket.resolved_at}
                totalMinutes={ticket.sla_resolution_minutes} label="Resolution" />
              {ticket.sla_rule_data && (
                <div className="text-[10px] font-mono text-muted-foreground pt-2 border-t border-border">
                  SLA locked at creation · {ticket.sla_first_response_minutes}m / {ticket.sla_resolution_minutes}m
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span>{ticket.department_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reporter</span><span className="truncate max-w-[60%]">{ticket.created_by_email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Assignee</span><span className="truncate max-w-[60%]">{ticket.assigned_agent_email || "Unassigned"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">First responded</span><span>{fmtDate(ticket.first_responded_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{fmtDate(ticket.resolved_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Closed</span><span>{fmtDate(ticket.closed_at)}</span></div>
            </CardContent>
          </Card>

          {(user?.role === "agent" || user?.role === "admin") && (
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!ticket.assigned_agent && user.role === "agent" && (
                  <Button className="w-full" onClick={() => act(doSelfAssign)} data-testid="self-assign-btn">Self-assign</Button>
                )}
                {user.role === "admin" && (
                  <div className="flex gap-2">
                    <Select value={assignTo} onValueChange={setAssignTo}>
                      <SelectTrigger data-testid="assign-agent-select"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (<SelectItem key={a.id} value={String(a.id)}>{a.email}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => act(doAssign)} disabled={!assignTo} data-testid="assign-btn">Assign</Button>
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground font-mono">Change status</div>
                  <Select onValueChange={(v) => act(doStatus, v)}>
                    <SelectTrigger data-testid="change-status-select"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground font-mono">Change priority</div>
                  <Select onValueChange={(v) => act(doPriority, v)}>
                    <SelectTrigger data-testid="change-priority-select"><SelectValue placeholder="Select priority" /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (<SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Dialog open={escOpen} onOpenChange={setEscOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="escalate-btn"><ChevronsUp className="h-4 w-4 mr-1" />Escalate</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Escalate ticket</DialogTitle></DialogHeader>
                      <Textarea placeholder="Reason for escalation..." value={escReason} onChange={(e) => setEscReason(e.target.value)}
                        data-testid="escalate-reason-input" />
                      <DialogFooter>
                        <Button onClick={() => act(doEscalate)} disabled={!escReason.trim()} data-testid="escalate-confirm-btn">Escalate</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" size="sm" onClick={() => act(doResolve)} data-testid="resolve-btn"><CheckCircle2 className="h-4 w-4 mr-1" />Resolve</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isOwner && (ticket.status === "resolved" || ticket.status === "closed") && (
            <Card><CardContent className="pt-6 space-y-2">
              <Button variant="outline" className="w-full" onClick={() => act(doReopen)} data-testid="reopen-btn">
                <RotateCcw className="h-4 w-4 mr-2" />Reopen ticket
              </Button>
              {ticket.status === "resolved" && (
                <Button variant="outline" className="w-full" onClick={() => act(doClose)} data-testid="close-btn">
                  <XCircle className="h-4 w-4 mr-2" />Close ticket
                </Button>
              )}
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}
