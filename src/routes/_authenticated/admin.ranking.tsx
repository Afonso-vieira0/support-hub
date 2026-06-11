import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getTechnicianRanking } from "@/lib/performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/alerts";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ranking")({
  component: RankingPage,
});

type Range = "7d" | "30d" | "6m" | "1y" | "all";
const medals = ["🥇", "🥈", "🥉"];

function RankingPage() {
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const fetcher = useServerFn(getTechnicianRanking);
  const { data } = useQuery({
    queryKey: ["ranking", range],
    enabled: isAdmin,
    queryFn: () => fetcher({ data: { range } }),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Trophy className="h-6 w-6 text-warning" /> Ranking de Técnicos</h1>
          <p className="text-sm text-muted-foreground">Pontuação composta (resolução, satisfação, tempo).</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="6m">6m</TabsTrigger>
            <TabsTrigger value="1y">1a</TabsTrigger>
            <TabsTrigger value="all">Tudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardHeader><CardTitle>Classificação</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-right">Resolvidos</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Avaliação</TableHead>
                <TableHead className="text-right">T. Resposta</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((r, i) => (
                <TableRow key={r.technicianId}>
                  <TableCell className="font-bold">{medals[i] ?? i + 1}</TableCell>
                  <TableCell>
                    <Link to="/admin/technicians/$id" params={{ id: r.technicianId }} className="font-medium hover:underline">
                      {(r.profile as any)?.full_name ?? (r.profile as any)?.email ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{r.resolved}</TableCell>
                  <TableCell className="text-right">{(r.resolutionRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{r.avgRating.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{formatDuration(r.avgFirstResponse)}</TableCell>
                  <TableCell className="text-right">{r.clients}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}