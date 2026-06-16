import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPartDetail } from "@/lib/inventory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/inventory/$id")({
  component: PartDetail,
});

function PartDetail() {
  const { id } = Route.useParams();
  const { isAdmin, isTechnician } = useAuth();
  const fetcher = useServerFn(getPartDetail);
  const { data } = useQuery({
    queryKey: ["part", id],
    enabled: isAdmin || isTechnician,
    queryFn: () => fetcher({ data: { id } }),
  });

  if (!isAdmin && !isTechnician) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  const p = data.part as any;

  return (
    <div className="space-y-4">
      <Link to="/admin/inventory"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Inventário</Button></Link>
      <Card>
        <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
          <Info label="SKU" value={p.sku} />
          <Info label="Categoria" value={p.category} />
          <Info label="Stock" value={`${p.quantity} ${p.unit}`} />
          <Info label="Mínimo" value={String(p.min_quantity)} />
          <Info label="Custo" value={`€ ${Number(p.unit_cost).toFixed(2)}`} />
          <Info label="Localização" value={p.location ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Movimentos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.movements ?? []).map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("pt-PT")}</TableCell>
                  <TableCell className={`text-right font-semibold ${m.delta < 0 ? "text-destructive" : "text-success"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</TableCell>
                  <TableCell className="text-xs">{m.reason}</TableCell>
                  <TableCell className="text-xs">
                    {m.ticket_id ? <Link to="/tickets/$id" params={{ id: m.ticket_id }} className="hover:underline">#{m.ticket_id.slice(0, 8)}</Link> : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.notes ?? ""}</TableCell>
                </TableRow>
              ))}
              {(data.movements ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">Sem movimentos.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
  );
}