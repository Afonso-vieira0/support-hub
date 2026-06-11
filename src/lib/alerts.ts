export const ALERT_THRESHOLDS = {
  techMaxActive: 10,
  slowFirstResponseSeconds: 4 * 3600,
  lowRatingAvg: 3,
  lowRatingMinCount: 3,
  stalledTicketHours: 24,
  slaAtRiskHours: 48,
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h}h`;
  const d = Math.round(seconds / 86400);
  return `${d}d`;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  ticket_created: "Ticket criado",
  ticket_assigned: "Ticket atribuído",
  ticket_reassigned: "Ticket reatribuído",
  first_response: "Primeira resposta",
  client_replied: "Cliente respondeu",
  technician_replied: "Técnico respondeu",
  status_changed: "Estado alterado",
  ticket_resolved: "Ticket resolvido",
  ticket_closed: "Ticket fechado",
  rating_received: "Avaliação recebida",
  user_login: "Sessão iniciada",
};

export const ACTIVITY_COLORS: Record<string, string> = {
  ticket_created: "bg-info/15 text-info",
  ticket_assigned: "bg-primary/15 text-primary",
  ticket_reassigned: "bg-primary/15 text-primary",
  first_response: "bg-accent/30 text-accent-foreground",
  client_replied: "bg-secondary text-secondary-foreground",
  technician_replied: "bg-accent/30 text-accent-foreground",
  status_changed: "bg-warning/15 text-warning",
  ticket_resolved: "bg-success/15 text-success",
  ticket_closed: "bg-muted text-muted-foreground",
  rating_received: "bg-primary/15 text-primary",
  user_login: "bg-muted text-muted-foreground",
};