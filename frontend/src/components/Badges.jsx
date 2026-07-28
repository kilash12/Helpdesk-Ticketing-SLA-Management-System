import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS } from "@/lib/tickets";

export function StatusBadge({ status }) {
  return (
    <Badge className={`${STATUS_COLORS[status] || ""} border-none font-medium`} data-testid={`status-${status}`}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <Badge className={`${PRIORITY_COLORS[priority] || ""} font-mono uppercase text-[10px] tracking-widest`} data-testid={`priority-${priority}`}>
      {priority}
    </Badge>
  );
}
