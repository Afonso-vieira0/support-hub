export type TicketStatus =
  | "new"
  | "assigned"
  | "in_analysis"
  | "in_resolution"
  | "awaiting_client"
  | "resolved"
  | "closed";

export const STATUSES: { value: TicketStatus; label: string; color: string }[] = [
  { value: "new", label: "Novo", color: "bg-info text-info-foreground" },
  { value: "assigned", label: "Atribuído", color: "bg-primary text-primary-foreground" },
  { value: "in_analysis", label: "Em análise", color: "bg-accent text-accent-foreground" },
  { value: "in_resolution", label: "Em resolução", color: "bg-warning text-warning-foreground" },
  { value: "awaiting_client", label: "Aguarda cliente", color: "bg-secondary text-secondary-foreground" },
  { value: "resolved", label: "Resolvido", color: "bg-success text-success-foreground" },
  { value: "closed", label: "Fechado", color: "bg-muted text-muted-foreground" },
];

export const statusLabel = (s: TicketStatus) =>
  STATUSES.find((x) => x.value === s)?.label ?? s;

export const statusColor = (s: TicketStatus) =>
  STATUSES.find((x) => x.value === s)?.color ?? "bg-muted text-muted-foreground";

export const ACTIVE_STATUSES: TicketStatus[] = [
  "new",
  "assigned",
  "in_analysis",
  "in_resolution",
  "awaiting_client",
];