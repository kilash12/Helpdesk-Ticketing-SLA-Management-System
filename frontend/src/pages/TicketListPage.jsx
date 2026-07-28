import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { PRIORITIES, STATUSES, fmtRelative } from "@/lib/tickets";
import { Plus, Search } from "lucide-react";

export default function TicketListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const page = Number(params.get("page") || 1);

  const load = async () => {
    setLoading(true);
    const q = new URLSearchParams(params);
    // synth "assigned=me" and "unassigned=1"
    if (q.get("assigned") === "me" && user) { q.delete("assigned"); q.set("assigned_agent", String(user.id)); }
    if (q.get("unassigned") === "1") { q.delete("unassigned"); q.set("assigned_agent__isnull", "true"); }
    q.set("page", String(page));
    try {
      const { data } = await client.get(`/tickets/?${q.toString()}`);
      setItems(data.results || data);
      setCount(data.count ?? (data.results?.length || data.length || 0));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.toString(), user?.id]);
  useEffect(() => { client.get("/departments/").then((r) => setDepts(r.data.results || r.data)); }, []);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (!v || v === "any") p.delete(k); else p.set(k, v);
    p.delete("page");
    setParams(p);
  };

  return (
    <div className="space-y-6 animate-in-fade" data-testid="ticket-list-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tickets</div>
          <h1 className="font-display text-3xl font-bold">
            {user?.role === "customer" ? "My tickets" : "Ticket queue"}
          </h1>
        </div>
        {user?.role === "customer" && (
          <Button asChild><Link to="/tickets/new" data-testid="list-new-ticket-btn"><Plus className="h-4 w-4 mr-2" />New</Link></Button>
        )}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input placeholder="Search subject or ticket #..." className="pl-9"
              defaultValue={params.get("search") || ""}
              onKeyDown={(e) => { if (e.key === "Enter") setParam("search", e.currentTarget.value); }}
              data-testid="ticket-search-input" />
          </div>
          <Select value={params.get("status") || "any"} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {STATUSES.map((s) => (<SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={params.get("priority") || "any"} onValueChange={(v) => setParam("priority", v)}>
            <SelectTrigger data-testid="filter-priority"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any priority</SelectItem>
              {PRIORITIES.map((p) => (<SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={params.get("department") || "any"} onValueChange={(v) => setParam("department", v)}>
            <SelectTrigger data-testid="filter-department"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any dept</SelectItem>
              {depts.map((d) => (<SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={params.get("sla_breach") || "any"} onValueChange={(v) => setParam("sla_breach", v === "any" ? null : v)}>
            <SelectTrigger data-testid="filter-sla"><SelectValue placeholder="SLA" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">SLA: all</SelectItem>
              <SelectItem value="true">SLA breached only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-widest">
              <tr>
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Dept</th>
                <th className="px-4 py-2 text-left font-medium">Priority</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Agent</th>
                <th className="px-4 py-2 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>)}
              {!loading && items.length === 0 && (<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No tickets found.</td></tr>)}
              {items.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => window.location.assign(`/tickets/${t.id}`)}
                    data-testid={`ticket-row-${t.id}`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{t.ticket_number}</td>
                  <td className="px-4 py-3 font-medium max-w-md truncate">{t.subject}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.department_name}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{t.assigned_agent_email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{fmtRelative(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Total: {count}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1}
            onClick={() => { const p = new URLSearchParams(params); p.set("page", String(page - 1)); setParams(p); }}
            data-testid="pagination-prev">Prev</Button>
          <div className="px-3 py-1 text-xs font-mono">Page {page}</div>
          <Button variant="outline" size="sm" disabled={items.length < 20}
            onClick={() => { const p = new URLSearchParams(params); p.set("page", String(page + 1)); setParams(p); }}
            data-testid="pagination-next">Next</Button>
        </div>
      </div>
    </div>
  );
}
