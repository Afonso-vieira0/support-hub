import { statusColor, statusLabel, type TicketStatus } from "@/lib/statuses";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusColor(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}