import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getTechniciansOverview, compareTechnicians } from "@/lib/performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/alerts";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/compare")({
  component: ComparePage,
});

function ComparePage() {
  const { isAdmin } = useAuth();
  const overview = useServerFn(getTechniciansOverview);
  const compare = useServerFn(compareTechnicians);
  const [selected, setSelected] = useState<string[]>([]);

  const { data: all } = useQuery({ queryKey: ["techs-overview-min"], enabled: isAdmin, queryFn: () => overview() });
  const { data: cmp } = useQuery({
    queryKey: ["compare", selected.join(",")],
    enabled: isAdmin && selected.length >= 2,
    queryFn: () => compare({ data: { ids: selected, range: "30d" } }),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;

  const toggle = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 6 ? [...s, id] : s);

  const chartData = (cmp?.rows ?? []).map((r) => ({
    name: (r.profile as any)?.full_name ?? "—",
    Resolvidos: r.resolved,
    Clientes: r.clients,
    "Avaliação×10": Math.round((r.avgRating ?? 0) * 10),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comparar Técnicos</h1>
        <p className="text-sm text-muted-foreground">Selecione 2 a 6 técnicos para comparar (últimos 30 dias).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Selecionar</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(all?.rows ?? []).map((r) => (
            <Button
              key={r.technicianId}
              size="sm"
              variant={selected.includes(r.technicianId) ? "default" : "outline"}
              onClick={() => toggle(r.technicianId)}
            >
              {(r.profile as any)?.full_name ?? (r.profile as any)?.email ?? "—"}
            </Button>
          ))}
        </CardContent>
      </Card>

      {cmp && cmp.rows.length >= 2 && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Comparação</CardTitle></CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Resolvidos" fill="hsl(var(--primary))" radius={4} />
                  <Bar dataKey="Clientes" fill="hsl(var(--info))" radius={4} />
                  <Bar dataKey="Avaliação×10" fill="hsl(var(--success))" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-right">Resolvidos</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead className="text-right">Avaliação</TableHead>
                  <TableHead className="text-right">T. Resposta</TableHead>
                  <TableHead className="text-right">T. Resolução</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {cmp.rows.map((r) => (
                    <TableRow key={r.technicianId}>
                      <TableCell className="font-medium">{(r.profile as any)?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.resolved}</TableCell>
                      <TableCell className="text-right">{r.clients}</TableCell>
                      <TableCell className="text-right">{r.avgRating.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatDuration(r.avgFirstResponse)}</TableCell>
                      <TableCell className="text-right">{formatDuration(r.avgResolution)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}