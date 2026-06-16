import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getTechniciansOverview } from "@/lib/performance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/alerts";
import { categoryLabel } from "@/lib/categories";
import { StarRating } from "@/components/star-rating";

export const Route = createFileRoute("/_authenticated/admin/technicians/")({
  component: TechniciansPage,
});

function TechniciansPage() {
  const { isAdmin } = useAuth();
  const fetcher = useServerFn(getTechniciansOverview);
  const { data } = useQuery({ queryKey: ["techs-overview"], enabled: isAdmin, queryFn: () => fetcher() });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Desempenho dos Técnicos</h1>
        <p className="text-sm text-muted-foreground">Visão agregada de todos os técnicos.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Técnicos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Especialização</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Resolvidos</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">T. Resp.</TableHead>
                <TableHead className="text-right">T. Resol.</TableHead>
                <TableHead>Avaliação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((r) => (
                <TableRow key={r.technicianId} className="cursor-pointer">
                  <TableCell>
                    <Link to="/admin/technicians/$id" params={{ id: r.technicianId }} className="font-medium hover:underline">
                      {(r.profile as any)?.full_name ?? (r.profile as any)?.email ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {r.categories.length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
                      r.categories.slice(0, 3).map((c: string) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{categoryLabel(c as any)}</Badge>
                      ))}
                  </TableCell>
                  <TableCell className="text-right">{r.active}</TableCell>
                  <TableCell className="text-right">{r.resolved}</TableCell>
                  <TableCell className="text-right">{r.clients}</TableCell>
                  <TableCell className="text-right">{(r.resolutionRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{formatDuration(r.avgFirstResponse)}</TableCell>
                  <TableCell className="text-right">{formatDuration(r.avgResolution)}</TableCell>
                  <TableCell>
                    {r.ratingsCount > 0 ? <StarRating value={Math.round(r.avgRating)} readOnly size={14} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}