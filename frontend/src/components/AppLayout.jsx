import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, TicketCheck, Users, Building2, ShieldAlert,
  BarChart3, ScrollText, LogOut, Bell, Plus, Settings, Inbox, AlertTriangle, Star, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import client from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "sonner";
import { fmtRelative } from "@/lib/tickets";

function navFor(role) {
  if (role === "customer") return [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/tickets/new", icon: Plus, label: "New Ticket", testid: "nav-new-ticket" },
    { to: "/tickets", icon: TicketCheck, label: "My Tickets", testid: "nav-my-tickets" },
  ];
  if (role === "agent") return [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/tickets?assigned=me", icon: TicketCheck, label: "Assigned to Me", testid: "nav-assigned" },
    { to: "/tickets?unassigned=1", icon: Inbox, label: "Unassigned Queue", testid: "nav-unassigned" },
    { to: "/tickets?sla_breach=true", icon: AlertTriangle, label: "SLA Watch", testid: "nav-sla-watch" },
    { to: "/tickets?status=escalated", icon: ShieldAlert, label: "Escalated", testid: "nav-escalated" },
  ];
  // admin
  return [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/tickets", icon: TicketCheck, label: "All Tickets", testid: "nav-all-tickets" },
    { to: "/users", icon: Users, label: "Users & Agents", testid: "nav-users" },
    { to: "/departments", icon: Building2, label: "Departments", testid: "nav-departments" },
    { to: "/sla", icon: Settings, label: "SLA Configuration", testid: "nav-sla" },
    { to: "/reports", icon: BarChart3, label: "Reports", testid: "nav-reports" },
    { to: "/audit", icon: ScrollText, label: "Audit Logs", testid: "nav-audit" },
  ];
}

function NotificationBell() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const [list, c] = await Promise.all([
        client.get("/notifications/?ordering=-created_at&page_size=15"),
        client.get("/notifications/unread-count/"),
      ]);
      setItems(list.data.results || list.data);
      setCount(c.data.unread_count || 0);
    } catch (e) {}
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    // SSE
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/events/notifications/`;
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener("notification", (evt) => {
      try {
        const n = JSON.parse(evt.data);
        toast(n.title, { description: n.body });
        load();
      } catch {}
    });
    es.onerror = () => { es.close(); };
    return () => { clearInterval(iv); es.close(); };
  }, []);

  const markAll = async () => {
    await client.post("/notifications/mark-all-read/");
    load();
  };
  const markOne = async (id) => {
    await client.post(`/notifications/${id}/mark-read/`);
    load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notif-bell">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-mono">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[520px] overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <Button variant="ghost" size="sm" onClick={markAll} data-testid="notif-mark-all">Mark all read</Button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground p-4 text-center">You're all caught up.</div>
        )}
        {items.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => markOne(n.id)}
            data-testid={`notif-item-${n.id}`}
            className={`flex flex-col items-start gap-0.5 py-2 ${!n.is_read ? "bg-muted/40" : ""}`}
          >
            <div className="flex items-center gap-2 w-full">
              {!n.is_read && <span className="h-2 w-2 rounded-full bg-red-500"></span>}
              <span className="font-medium text-sm">{n.title}</span>
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{fmtRelative(n.created_at)}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const items = navFor(user?.role || "customer");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      <Toaster position="top-right" richColors closeButton />
      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-64 bg-card border-r border-border z-40
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        transition-transform duration-200
        flex flex-col
      `}>
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-foreground text-background flex items-center justify-center font-mono font-bold">H</div>
            <div>
              <div className="font-display font-bold text-base leading-tight">Helpdesk</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">SLA Console</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {items.map((it) => (
            <NavLink
              to={it.to}
              key={it.to}
              data-testid={it.testid}
              end={it.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                hover:bg-muted transition-colors duration-100
                ${isActive ? "bg-foreground text-background hover:bg-foreground" : "text-foreground"}
              `}
            >
              <it.icon className="h-4 w-4" />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-mono text-xs">
              {(user?.full_name || user?.email || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.full_name || user?.email}</div>
              <Badge variant="outline" className="text-[10px] mt-0.5 font-mono">{user?.role}</Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); nav("/login"); }} data-testid="logout-btn">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between h-14 px-4 lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(v => !v)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
