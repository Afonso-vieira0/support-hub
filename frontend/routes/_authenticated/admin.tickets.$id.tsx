import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getTicketFullView } from "@/lib/activity.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ACTIVITY_LABELS, ACTIVITY_COLORS, formatDuration } from "@/lib/alerts";
import { categoryLabel } from "@/lib/categories";
import { StarRating } from "@/components/star-rating";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/tickets/$id")({
  component: AdminTicketView,
});

function AdminTicketView() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const fetcher = useServerFn(getTicketFullView);
  const { data } = useQuery({
    queryKey: ["admin-ticket-full", id],
    enabled: isAdmin,
    queryFn: () => fetcher({ data: { ticketId: id } }),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;
  if (!data?.ticket) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const t = data.ticket;
  const m = data.metrics ?? ({} as any);
  const profById = new Map((data.profiles ?? []).map((p: any) => [p.id, p]));
  const client = profById.get(t.client_id) as any;
  const tech = t.technician_id ? (profById.get(t.technician_id) as any) : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/admin/activity"><ArrowLeft className="mr-2 h-4 w-4" /> Centro de Atividades</Link></Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>#{t.ticket_number} · {t.device_name}</CardTitle>
              <CardDescription>{t.brand} {t.model} · {categoryLabel(t.category as any)}</CardDescription>
            </div>
            <StatusBadge status={t.status as any} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <Info label="Cliente" value={client?.full_name ?? client?.email ?? "—"} />
          <Info label="Técnico" value={tech?.full_name ?? tech?.email ?? "Por atribuir"} />
          <Info label="Criado" value={new Date(t.created_at).toLocaleString("pt-PT")} />
          <Info label="Resolvido" value={t.resolved_at ? new Date(t.resolved_at).toLocaleString("pt-PT") : "—"} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tempo até 1ª resposta" value={formatDuration(m.time_to_first_response_seconds)} />
        <Kpi label="Tempo total de resolução" value={formatDuration(m.total_resolution_seconds)} />
        <Kpi label="Espera do cliente" value={formatDuration(m.client_wait_seconds)} />
        <Kpi label="Espera do técnico" value={formatDuration(m.tech_wait_seconds)} />
        <Kpi label="Mensagens trocadas" value={String(m.messages_count ?? 0)} />
        <Kpi label="1ª resposta em" value={m.first_response_at ? new Date(m.first_response_at).toLocaleString("pt-PT") : "—"} />
        <Kpi label="Última msg cliente" value={m.last_client_message_at ? new Date(m.last_client_message_at).toLocaleString("pt-PT") : "—"} />
        <Kpi label="Última msg técnico" value={m.last_tech_message_at ? new Date(m.last_tech_message_at).toLocaleString("pt-PT") : "—"} />
      </div>

      {data.rating && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Avaliação do cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <StarRating value={data.rating.stars} readOnly />
              <Badge variant={data.rating.solved ? "default" : "destructive"}>
                {data.rating.solved ? "Problema resolvido" : "Não resolvido"}
              </Badge>
            </div>
            {data.rating.comment && <p className="text-sm">{data.rating.comment}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Linha do tempo</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 border-l pl-4">
            {data.events.map((e: any) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="w-32 shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-PT")}</span>
                <Badge className={ACTIVITY_COLORS[e.type] ?? "bg-muted"}>{ACTIVITY_LABELS[e.type] ?? e.type}</Badge>
                {e.from_value && e.to_value && (
                  <span className="text-xs text-muted-foreground">{e.from_value} → {e.to_value}</span>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Mensagens ({data.messages.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.messages.map((msg: any) => {
            const sender = profById.get(msg.sender_id) as any;
            return (
              <div key={msg.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{sender?.full_name ?? sender?.email ?? "—"}</span>
                  <span>{new Date(msg.created_at).toLocaleString("pt-PT")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{msg.content}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </CardContent></Card>
  );
}