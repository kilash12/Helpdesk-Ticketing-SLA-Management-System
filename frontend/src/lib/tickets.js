import { format, formatDistanceToNow } from "date-fns";

export const STATUS_LABELS = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting_customer: "Waiting for Customer",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

export const STATUS_COLORS = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  assigned: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  waiting_customer: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  escalated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  reopened: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

export const PRIORITY_COLORS = {
  low: "bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  medium: "bg-blue-50 text-blue-700 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  high: "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  critical: "bg-red-50 text-red-800 border border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

export const PRIORITIES = ["low", "medium", "high", "critical"];
export const STATUSES = Object.keys(STATUS_LABELS);

export function fmtDate(iso) {
  if (!iso) return "—";
  try { return format(new Date(iso), "PP p"); } catch { return iso; }
}
export function fmtRelative(iso) {
  if (!iso) return "—";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return iso; }
}

/** Returns { label, tone: 'ok' | 'warn' | 'breach' | 'none', ms } */
export function slaState(dueIso, respondedIso, totalMinutes) {
  if (!dueIso) return { label: "—", tone: "none", ms: 0 };
  if (respondedIso) return { label: "Met", tone: "ok", ms: 0 };
  const due = new Date(dueIso).getTime();
  const now = Date.now();
  const remaining = due - now;
  if (remaining <= 0) return { label: `Breached ${formatDistanceToNow(new Date(due))} ago`, tone: "breach", ms: remaining };
  const totalMs = (totalMinutes || 60) * 60 * 1000;
  const pct = remaining / totalMs;
  const label = `${Math.floor(remaining / 60000)}m left`;
  if (pct < 0.2) return { label, tone: "warn", ms: remaining };
  return { label, tone: "ok", ms: remaining };
}
