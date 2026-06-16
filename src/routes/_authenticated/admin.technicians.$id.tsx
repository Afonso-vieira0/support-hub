import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getTechnicianProfile } from "@/lib/performance.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { formatDuration } from "@/lib/alerts";
import { categoryLabel } from "@/lib/categories";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/technicians/$id")({
  component: TechProfilePage,
});

type Range = "7d" | "30d" | "6m" | "1y" | "all";

function TechProfilePage() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const fetcher = useServerFn(getTechnicianProfile);
  const { data } = useQuery({
    queryKey: ["tech-profile", id, range],
    enabled: isAdmin,
    queryFn: () => fetcher({ data: { technicianId: id, range } }),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const { profile, specs, stats, monthly, ratings } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{(profile as any)?.full_name ?? (profile as any)?.email ?? "Técnico"}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {specs.map((c: string) => <Badge key={c} variant="secondary">{categoryLabel(c as any)}</Badge>)}
          </div>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="7d">7 dias</TabsTrigger>
            <TabsTrigger value="30d">30 dias</TabsTrigger>
            <TabsTrigger value="6m">6 meses</TabsTrigger>
            <TabsTrigger value="1y">1 ano</TabsTrigger>
            <TabsTrigger value="all">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tickets recebidos" value={stats.total} />
        <Kpi label="Resolvidos" value={stats.resolved + stats.closed} />
        <Kpi label="Clientes ajudados" value={stats.clients} />
        <Kpi label="Taxa de sucesso" value={`${(stats.resolutionRate * 100).toFixed(0)}%`} />
        <Kpi label="Tempo médio resposta" value={formatDuration(stats.avgFirstResponse)} />
        <Kpi label="Tempo médio resolução" value={formatDuration(stats.avgResolution)} />
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground">Avaliação média</p>
            <div className="mt-2 flex items-center gap-2">
              <StarRating value={Math.round(stats.avgRating)} readOnly size={18} />
              <span className="text-sm font-medium">{stats.avgRating.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">({stats.ratingsCount})</span>
            </div>
          </CardContent>
        </Card>
        <Kpi label="Ativos" value={stats.active} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tickets resolvidos por mês">
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Bar dataKey="resolved" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Tempo médio de resposta (s)">
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="avgFirstResponse" stroke="hsl(var(--info))" strokeWidth={2} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Tempo médio de resolução (s)">
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="avgResolution" stroke="hsl(var(--warning))" strokeWidth={2} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Avaliação média por mês">
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis domain={[0, 5]} fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="avgRating" stroke="hsl(var(--success))" strokeWidth={2} />
          </LineChart>
        </ChartCard>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Comentários dos clientes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ratings.length === 0 && <p className="text-sm text-muted-foreground">Sem avaliações ainda.</p>}
          {ratings.slice(0, 20).map((r: any) => (
            <div key={r.ticket_id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <StarRating value={r.stars} readOnly size={14} />
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-PT")}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card><CardContent className="p-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </CardContent></Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}