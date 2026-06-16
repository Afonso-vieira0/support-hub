import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getActivityFeed } from "@/lib/activity.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_LABELS, ACTIVITY_COLORS } from "@/lib/alerts";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const { isAdmin } = useAuth();
  const fetchFeed = useServerFn(getActivityFeed);
  const qc = useQueryClient();
  const [hours, setHours] = useState(72);
  const [type, setType] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["activity-feed", hours, type],
    enabled: isAdmin,
    queryFn: () => fetchFeed({ data: { sinceHours: hours, types: type === "all" ? undefined : [type], limit: 200 } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, () => {
        qc.invalidateQueries({ queryKey: ["activity-feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito a administradores.</p>;

  const actors = new Map((data?.actors ?? []).map((a: any) => [a.id, a]));
  const tickets = new Map((data?.tickets ?? []).map((t: any) => [t.id, t]));
  const grouped: Record<string, any[]> = {};
  (data?.events ?? []).forEach((e) => {
    const day = new Date(e.created_at).toLocaleDateString("pt-PT");
    (grouped[day] ??= []).push(e);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centro de Atividades</h1>
          <p className="text-sm text-muted-foreground">Monitorização em tempo real de toda a operação.</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="72">Últimos 3 dias</SelectItem>
              <SelectItem value="168">Últimos 7 dias</SelectItem>
              <SelectItem value="720">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              {Object.entries(ACTIVITY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.keys(grouped).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem atividade no período selecionado.</p>
          )}
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{day}</p>
              <ol className="space-y-2 border-l pl-4">
                {items.map((e: any) => {
                  const actor = actors.get(e.actor_id);
                  const ticket = tickets.get(e.ticket_id);
                  const t = new Date(e.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={e.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 w-12 shrink-0 text-xs text-muted-foreground">{t}</span>
                      <Badge className={ACTIVITY_COLORS[e.type] ?? "bg-muted"}>{ACTIVITY_LABELS[e.type] ?? e.type}</Badge>
                      <div className="min-w-0 flex-1">
                        {actor && <span className="font-medium">{(actor as any).full_name ?? (actor as any).email}</span>}
                        {ticket && (
                          <>
                            {" · "}
                            <Link to="/admin/tickets/$id" params={{ id: ticket.id }} className="text-primary hover:underline">
                              #{ticket.ticket_number} {ticket.device_name}
                            </Link>
                          </>
                        )}
                        {e.from_value && e.to_value && (
                          <span className="text-xs text-muted-foreground"> · {e.from_value} → {e.to_value}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}