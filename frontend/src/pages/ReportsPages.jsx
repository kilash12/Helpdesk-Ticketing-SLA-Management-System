import { useEffect, useState } from "react";
import client from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { fmtDate } from "@/lib/tickets";

export function ReportsPage() {
  const [dash, setDash] = useState(null);
  const [agents, setAgents] = useState([]);
  const [sla, setSla] = useState(null);
  const [trends, setTrends] = useState([]);
  useEffect(() => {
    Promise.all([
      client.get("/reports/dashboard/"),
      client.get("/reports/agent-performance/"),
      client.get("/reports/sla-summary/"),
      client.get("/reports/ticket-trends/"),
    ]).then(([d, a, s, t]) => { setDash(d.data); setAgents(a.data); setSla(s.data); setTrends(t.data); });
  }, []);

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div>
        <div className="font-mono text-xs uppercase text-muted-foreground">Analytics</div>
        <h1 className="font-display text-3xl font-bold">Reports</h1>
      </div>

      {dash && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Tickets by priority</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dash.by_priority}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="priority" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--foreground))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ticket trends</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {sla && (
        <Card>
          <CardHeader><CardTitle>SLA summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <Stat label="Active" v={sla.total_active} />
              <Stat label="FR Warned" v={sla.warned_first_response} tone="warn" />
              <Stat label="Res Warned" v={sla.warned_resolution} tone="warn" />
              <Stat label="FR Breached" v={sla.breached_first_response} tone="danger" />
              <Stat label="Res Breached" v={sla.breached_resolution} tone="danger" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Agent performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Agent</th><th className="text-left px-4 py-2">Assigned</th><th className="text-left px-4 py-2">Resolved</th><th className="text-left px-4 py-2">Avg rating</th></tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-border" data-testid={`agent-row-${a.id}`}>
                  <td className="px-4 py-2">{a.full_name || a.email}</td>
                  <td className="px-4 py-2 font-mono">{a.total}</td>
                  <td className="px-4 py-2 font-mono">{a.resolved}</td>
                  <td className="px-4 py-2 font-mono">{a.avg_rating ? a.avg_rating.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, v, tone = "default" }) {
  const cls = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div><div className="text-[10px] uppercase font-mono text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-bold ${cls}`}>{v}</div>
    </div>
  );
}

export function AuditLogsPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { client.get("/audit-logs/?ordering=-created_at&page_size=50").then((r) => setItems(r.data.results || r.data)); }, []);
  return (
    <div className="space-y-6" data-testid="audit-logs-page">
      <div><div className="font-mono text-xs uppercase text-muted-foreground">Admin</div>
        <h1 className="font-display text-3xl font-bold">Audit logs</h1></div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Time</th><th className="text-left px-4 py-2">User</th><th className="text-left px-4 py-2">Action</th><th className="text-left px-4 py-2">Entity</th><th className="text-left px-4 py-2">IP</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-border font-mono text-xs" data-testid={`audit-row-${a.id}`}>
                <td className="px-4 py-2">{fmtDate(a.created_at)}</td>
                <td className="px-4 py-2">{a.user_email || "system"}</td>
                <td className="px-4 py-2">{a.action}</td>
                <td className="px-4 py-2">{a.entity_type}:{a.entity_id}</td>
                <td className="px-4 py-2">{a.ip_address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
