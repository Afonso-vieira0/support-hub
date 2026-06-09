import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { adminStats } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { STATUSES, statusLabel } from "@/lib/statuses";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/stats")({
  component: StatsPage,
});

const COLORS = ["hsl(217 91% 60%)", "hsl(142 76% 45%)", "hsl(38 92% 60%)", "hsl(199 89% 55%)", "hsl(0 84% 60%)", "hsl(280 70% 60%)", "hsl(160 60% 50%)"];

function StatsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const fn = useServerFn(adminStats);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data } = useQuery({ queryKey: ["admin-stats"], enabled: isAdmin, queryFn: () => fn() });

  const tickets = data?.tickets ?? [];
  const byCategory = CATEGORIES.map((c, i) => ({ name: c.label, value: tickets.filter((t: any) => t.category === c.value).length, color: COLORS[i % COLORS.length] }));
  const byStatus = STATUSES.map((s) => ({ name: s.label, value: tickets.filter((t: any) => t.status === s.value).length }));

  const days: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days[d.toISOString().slice(0, 10)] = 0;
  }
  tickets.forEach((t: any) => {
    const k = t.created_at.slice(0, 10);
    if (k in days) days[k]++;
  });
  const timeline = Object.entries(days).map(([k, v]) => ({ date: k.slice(5), tickets: v }));

  const resolved = tickets.filter((t: any) => t.resolved_at);
  const avgHours = resolved.length === 0 ? 0 : resolved.reduce((acc: number, t: any) => acc + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3.6e6, 0) / resolved.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Visão analítica do suporte.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total de tickets" value={tickets.length} />
        <Kpi label="Resolvidos" value={resolved.length} />
        <Kpi label="Tempo médio (h)" value={avgHours.toFixed(1)} />
        <Kpi label="Técnicos" value={new Set((data?.roles ?? []).filter((r: any) => r.role === "technician").map((r: any) => r.user_id)).size} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tickets por categoria</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory.filter((c) => c.value > 0)} dataKey="value" nameKey="name" outerRadius={90} label>
                  {byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tickets por estado</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStatus}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(217 91% 60%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Tickets criados (últimos 14 dias)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="tickets" stroke="hsl(217 91% 60%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}