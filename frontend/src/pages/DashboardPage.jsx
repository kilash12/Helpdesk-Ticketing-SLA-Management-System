import { useEffect, useState } from "react";
import client from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Plus, TicketCheck, ShieldAlert, AlertTriangle, Inbox, Clock, CheckCircle2 } from "lucide-react";

function StatCard({ label, value, icon: Icon, tone = "default", testid }) {
  const toneCls = {
    default: "text-foreground",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-600 dark:text-blue-400",
  }[tone];
  return (
    <div className="bg-card p-5" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
          <div className={`font-display text-3xl font-bold mt-2 ${toneCls}`}>{value ?? "—"}</div>
        </div>
        <Icon className={`h-5 w-5 ${toneCls}`} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        if (user?.role !== "customer") {
          const { data } = await client.get("/reports/dashboard/");
          setData(data);
        }
        const list = await client.get("/tickets/?page_size=5&ordering=-created_at");
        setRecent(list.data.results || []);
      } catch (e) {}
    })();
  }, [user?.role]);

  return (
    <div className="space-y-8 animate-in-fade" data-testid="dashboard-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Overview</div>
          <h1 className="font-display text-3xl font-bold">Welcome, {user?.full_name || user?.email}</h1>
        </div>
        {user?.role === "customer" && (
          <Button asChild data-testid="dashboard-new-ticket-btn">
            <Link to="/tickets/new"><Plus className="h-4 w-4 mr-2" />Create Ticket</Link>
          </Button>
        )}
      </div>

      {user?.role !== "customer" && data && (
        <div className="grid-frame grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
          <StatCard label="Total" value={data.total} icon={TicketCheck} testid="stat-total" />
          <StatCard label="Open" value={data.open + data.reopened} icon={Inbox} tone="info" testid="stat-open" />
          <StatCard label="In Progress" value={data.in_progress} icon={Clock} testid="stat-progress" />
          <StatCard label="Waiting Customer" value={data.waiting_customer} icon={Clock} tone="warn" testid="stat-waiting" />
          <StatCard label="Escalated" value={data.escalated} icon={ShieldAlert} tone="danger" testid="stat-escalated" />
          <StatCard label="Resolved" value={data.resolved} icon={CheckCircle2} tone="success" testid="stat-resolved" />
          <StatCard label="Unassigned" value={data.unassigned} icon={Inbox} tone="warn" testid="stat-unassigned" />
          <StatCard label="SLA Breached" value={data.sla_breached} icon={AlertTriangle} tone="danger" testid="stat-sla-breached" />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="font-display">Recent tickets</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/tickets" data-testid="dashboard-view-all-tickets">View all</Link></Button>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No tickets yet.</div>}
          {recent.map((t) => (
            <Link key={t.id} to={`/tickets/${t.id}`} data-testid={`dashboard-recent-ticket-${t.id}`}
              className="flex items-center gap-3 p-4 border-t border-border hover:bg-muted transition-colors">
              <div className="font-mono text-xs text-muted-foreground w-32 shrink-0">{t.ticket_number}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.subject}</div>
                <div className="text-xs text-muted-foreground">{t.department_name} · {t.priority}</div>
              </div>
              <div className="text-xs text-muted-foreground font-mono">{t.status}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
