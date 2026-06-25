import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getExecutiveDashboard, getAdminAlerts } from "@/lib/performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/alerts";
import { categoryLabel } from "@/lib/categories";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { AlertTriangle, Users, Ticket as TicketIcon, CheckCircle2, Clock, Star, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/executive")({
  component: ExecutivePage,
});

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#64748b"];

function ExecutivePage() {
  const { isAdmin } = useAuth();
  const dash = useServerFn(getExecutiveDashboard);
  const alerts = useServerFn(getAdminAlerts);
  const { data } = useQuery({ queryKey: ["exec-dashboard"], enabled: isAdmin, queryFn: () => dash() });
  const { data: al } = useQuery({ queryKey: ["admin-alerts"], enabled: isAdmin, queryFn: () => alerts() });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const k = data.kpis;
  const catData = data.categories.map((c) => ({ name: categoryLabel(c.category as any), value: c.value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground">Visão global do suporte técnico.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TicketIcon} label="Tickets ativos" value={k.active} tone="primary" />
        <Kpi icon={CheckCircle2} label="Resolvidos hoje" value={k.resolvedToday} tone="success" />
        <Kpi icon={Clock} label="Pendentes" value={k.pending} tone="warning" />
        <Kpi icon={Users} label="Clientes" value={k.clients} tone="info" />
        <Kpi icon={Activity} label="Técnicos ativos" value={k.techs} tone="primary" />
        <Kpi icon={Star} label="Avaliação média" value={k.avgRating || "—"} tone="success" />
        <Kpi icon={Clock} label="T. médio resposta" value={formatDuration(k.avgFirstResponse)} tone="info" />
        <Kpi icon={Clock} label="T. médio resolução" value={formatDuration(k.avgResolution)} tone="warning" />
      </div>

      {al && (al.overloaded.length + al.lowRated.length + al.slowResponders.length + al.stalled.length + al.slaAtRisk.length) > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <CardTitle className="text-sm">Necessita de Atenção</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {al.overloaded.map((o: any) => (
              <Alert key={`o-${o.technicianId}`} text={`${(o.profile as any)?.full_name ?? "Técnico"} tem ${o.active} tickets ativos`} />
            ))}
            {al.lowRated.map((o: any) => (
              <Alert key={`r-${o.technicianId}`} text={`${(o.profile as any)?.full_name ?? "Técnico"} com avaliação média ${o.avg} (${o.count})`} />
            ))}
            {al.slowResponders.map((o: any) => (
              <Alert key={`s-${o.technicianId}`} text={`${(o.profile as any)?.full_name ?? "Técnico"} com resposta média de ${formatDuration(o.avgSeconds)}`} />
            ))}
            {al.stalled.slice(0, 5).map((o: any) => (
              <Alert key={`st-${o.ticket.id}`}>
                <Link to="/admin/tickets/$id" params={{ id: o.ticket.id }} className="hover:underline">
                  #{o.ticket.ticket_number} {o.ticket.device_name}
                </Link>{" "}sem resposta há {o.lastActivityHours}h
              </Alert>
            ))}
            {al.slaAtRisk.slice(0, 5).map((o: any) => (
              <Alert key={`sla-${o.ticket.id}`}>
                <Link to="/admin/tickets/$id" params={{ id: o.ticket.id }} className="hover:underline">
                  #{o.ticket.ticket_number} {o.ticket.device_name}
                </Link>{" "}aberto há {o.openHours}h (SLA em risco)
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tickets criados vs resolvidos">
          <BarChart data={data.monthly}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip /><Legend />
            <Bar dataKey="created" fill="#3b82f6" radius={4} />
            <Bar dataKey="resolved" fill="#22c55e" radius={4} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Tickets por categoria">
          <PieChart>
            <Pie data={catData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
              {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip /><Legend />
          </PieChart>
        </ChartCard>
        <ChartCard title="Produtividade dos técnicos (top 10)">
          <BarChart data={data.productivity} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" fontSize={11} width={120} />
            <Tooltip />
            <Bar dataKey="resolved" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Evolução das avaliações">
          <LineChart data={data.ratingsSeries}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis domain={[0, 5]} fontSize={11} />
            <Tooltip />
            <Line type="monotone" dataKey="avg" stroke="hsl(var(--success))" strokeWidth={2} />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone: string }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
  };
  return (
    <Card><CardContent className="flex items-center gap-3 p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function Alert({ text, children }: { text?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>{children ?? text}</div>
    </div>
  );
}