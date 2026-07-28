import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PRIORITIES } from "@/lib/tickets";

export default function CreateTicketPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({ subject: "", description: "", department: "", priority: "medium" });
  const [file, setFile] = useState(null);
  const [depts, setDepts] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    client.get("/departments/?is_active=true").then((r) => {
      const list = r.data.results || r.data;
      setDepts(list);
      if (list.length && !form.department) setForm((f) => ({ ...f, department: String(list[0].id) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await client.post("/tickets/", {
        subject: form.subject,
        description: form.description,
        department: Number(form.department),
        priority: form.priority,
      });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        try { await client.post(`/tickets/${data.id}/attachments/`, fd); } catch (e) {}
      }
      nav(`/tickets/${data.id}`);
    } catch (e) {
      setErr(formatApiError(e.response?.data));
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto animate-in-fade" data-testid="create-ticket-page">
      <div className="mb-6">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">New</div>
        <h1 className="font-display text-3xl font-bold">Create a ticket</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>Ticket details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="new-ticket-subject" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={6} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="new-ticket-description" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger data-testid="new-ticket-department"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => (<SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger data-testid="new-ticket-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (<SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Attachment (optional, max 10 MB)</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".jpg,.jpeg,.png,.pdf,.docx,.txt,.csv" data-testid="new-ticket-attachment" />
            </div>
            {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" type="button" onClick={() => nav(-1)} data-testid="new-ticket-cancel">Cancel</Button>
              <Button type="submit" disabled={loading} data-testid="new-ticket-submit">{loading ? "Creating..." : "Create ticket"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
