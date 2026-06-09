import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { ACTIVE_STATUSES, type TicketStatus } from "@/lib/statuses";
import { Ticket, CheckCircle2, Clock, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, profile, isAdmin, isTechnician, isClient, primaryRole } = useAuth();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["dashboard-tickets", user?.id, primaryRole],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, device_name, category, status, priority, created_at, resolved_at, client_id, technician_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = {
    total: tickets.length,
    active: tickets.filter((t) => ACTIVE_STATUSES.includes(t.status as TicketStatus)).length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
    new: tickets.filter((t) => t.status === "new").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Olá, {profile?.full_name?.split(" ")[0] ?? "👋"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Visão geral do sistema" : isTechnician ? "Os seus tickets atribuídos" : "Os seus pedidos de suporte"}
          </p>
        </div>
        {(isClient || isAdmin) && (
          <Button asChild>
            <Link to="/tickets/new"><Plus className="mr-2 h-4 w-4" /> Novo ticket</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Ticket} label="Total" value={stats.total} tone="primary" />
        <StatCard icon={AlertCircle} label="Novos" value={stats.new} tone="info" />
        <StatCard icon={Clock} label="Ativos" value={stats.active} tone="warning" />
        <StatCard icon={CheckCircle2} label="Resolvidos" value={stats.resolved} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tickets recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : tickets.length === 0 ? (
            <div className="py-10 text-center">
              <Ticket className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">Sem tickets para mostrar.</p>
            </div>
          ) : (
            <div className="divide-y">
              {tickets.slice(0, 10).map((t) => (
                <Link
                  key={t.id}
                  to="/tickets/$id"
                  params={{ id: t.id }}
                  className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-lg">
                    {categoryIcon(t.category as any)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.device_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{categoryLabel(t.category as any)}</p>
                  </div>
                  <StatusBadge status={t.status as TicketStatus} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "primary" | "info" | "warning" | "success" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}