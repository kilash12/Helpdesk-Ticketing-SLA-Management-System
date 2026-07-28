import { useEffect, useState } from "react";
import { slaState } from "@/lib/tickets";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

export function SLATimer({ dueAt, respondedAt, totalMinutes, label }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const s = slaState(dueAt, respondedAt, totalMinutes);
  const tone = s.tone;
  const cls =
    tone === "breach" ? "sla-breach"
    : tone === "warn" ? "sla-warn"
    : tone === "ok" ? "sla-ok"
    : "text-muted-foreground";
  const Icon =
    tone === "breach" ? AlertTriangle
    : tone === "warn" ? AlertTriangle
    : tone === "ok" ? (respondedAt ? CheckCircle2 : Clock)
    : Clock;
  return (
    <div className="flex items-center gap-2" data-testid={`sla-timer-${label?.toLowerCase().replace(/\s+/g,'-')}`}>
      <Icon className={`h-4 w-4 ${cls}`} />
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={`sla-timer text-sm font-medium ${cls}`}>{s.label}</span>
      </div>
    </div>
  );
}
