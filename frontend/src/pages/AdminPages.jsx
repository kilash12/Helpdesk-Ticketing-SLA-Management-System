import { useEffect, useState } from "react";
import client, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export function DepartmentsPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(false);
  const load = () => client.get("/departments/").then((r) => setItems(r.data.results || r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    try { await client.post("/departments/", { name, description: desc, is_active: true }); setOpen(false); setName(""); setDesc(""); load(); toast.success("Created"); }
    catch (e) { toast.error(formatApiError(e.response?.data)); }
  };
  const del = async (id) => {
    try { await client.delete(`/departments/${id}/`); load(); toast.success("Deleted"); }
    catch (e) { toast.error(formatApiError(e.response?.data)); }
  };
  const toggle = async (d) => { await client.patch(`/departments/${d.id}/`, { is_active: !d.is_active }); load(); };

  return (
    <div className="space-y-6" data-testid="departments-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase text-muted-foreground">Admin</div>
          <h1 className="font-display text-3xl font-bold">Departments</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="dept-create-btn"><Plus className="h-4 w-4 mr-2" />New department</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New department</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="dept-name-input" /></div>
              <div><Label>Description</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="dept-desc-input" /></div>
            </div>
            <DialogFooter><Button onClick={create} data-testid="dept-save-btn">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Description</th><th className="text-left px-4 py-2">Status</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-t border-border" data-testid={`dept-row-${d.id}`}>
                <td className="px-4 py-2 font-medium">{d.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{d.description || "—"}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggle(d)} data-testid={`dept-toggle-${d.id}`}>
                    <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "Active" : "Inactive"}</Badge>
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => del(d.id)} data-testid={`dept-delete-${d.id}`}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function UsersPage() {
  const [items, setItems] = useState([]);
  const [depts, setDepts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "agent", department: "", is_active: true });
  const [err, setErr] = useState(null);

  const load = () => client.get("/users/").then((r) => setItems(r.data.results || r.data));
  useEffect(() => { load(); client.get("/departments/").then((r) => setDepts(r.data.results || r.data)); }, []);

  const create = async () => {
    setErr(null);
    try {
      await client.post("/users/", { ...form, department: form.department ? Number(form.department) : null });
      setOpen(false); load(); toast.success("User created");
      setForm({ email: "", full_name: "", password: "", role: "agent", department: "", is_active: true });
    } catch (e) { setErr(formatApiError(e.response?.data)); }
  };

  const toggle = async (u) => { await client.patch(`/users/${u.id}/`, { is_active: !u.is_active }); load(); };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase text-muted-foreground">Admin</div>
          <h1 className="font-display text-3xl font-bold">Users & Agents</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="user-create-btn"><Plus className="h-4 w-4 mr-2" />New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" /></div>
              <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="user-name-input" /></div>
              <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department (agents)</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger data-testid="user-dept-select"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => (<SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            </div>
            <DialogFooter><Button onClick={create} data-testid="user-save-btn">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr><th className="text-left px-4 py-2">Email</th><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Role</th><th className="text-left px-4 py-2">Dept</th><th className="text-left px-4 py-2">Active</th></tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-t border-border" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-2 font-medium">{u.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.full_name || "—"}</td>
                <td className="px-4 py-2 font-mono uppercase text-xs">{u.role}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.department_name || "—"}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggle(u)} data-testid={`user-toggle-${u.id}`}>
                    <Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Yes" : "No"}</Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function SLAConfigPage() {
  const [items, setItems] = useState([]);
  const load = () => client.get("/sla-rules/").then((r) => setItems(r.data.results || r.data));
  useEffect(() => { load(); }, []);
  const update = async (id, patch) => {
    try { await client.patch(`/sla-rules/${id}/`, patch); load(); toast.success("Saved"); }
    catch (e) { toast.error(formatApiError(e.response?.data)); }
  };
  return (
    <div className="space-y-6" data-testid="sla-config-page">
      <div>
        <div className="font-mono text-xs uppercase text-muted-foreground">Admin</div>
        <h1 className="font-display text-3xl font-bold">SLA Configuration</h1>
        <div className="text-sm text-muted-foreground mt-1">Set First-Response and Resolution targets in minutes, per priority.</div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((r) => (
          <Card key={r.id} data-testid={`sla-card-${r.priority}`}>
            <CardHeader className="pb-2"><CardTitle className="font-mono uppercase text-sm">{r.priority}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">First response (min)</Label>
                  <Input type="number" defaultValue={r.first_response_minutes}
                    onBlur={(e) => update(r.id, { first_response_minutes: Number(e.target.value) })}
                    data-testid={`sla-fr-${r.priority}`} />
                </div>
                <div><Label className="text-xs">Resolution (min)</Label>
                  <Input type="number" defaultValue={r.resolution_minutes}
                    onBlur={(e) => update(r.id, { resolution_minutes: Number(e.target.value) })}
                    data-testid={`sla-res-${r.priority}`} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => update(r.id, { is_active: !r.is_active })} data-testid={`sla-toggle-${r.priority}`}>
                  <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
