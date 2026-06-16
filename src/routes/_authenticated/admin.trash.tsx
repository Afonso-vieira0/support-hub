import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/status-badge";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { type TicketStatus } from "@/lib/statuses";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getTrashTickets, restoreTickets, hardDeleteTickets } from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/admin/trash")({
  component: AdminTrashPage,
});

function AdminTrashPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fetcher = useServerFn(getTrashTickets);
  const restore = useServerFn(restoreTickets);
  const hardDel = useServerFn(hardDeleteTickets);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-trash"],
    enabled: isAdmin,
    queryFn: () => fetcher(),
  });

  if (!isAdmin) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;

  const tickets = data?.tickets ?? [];
  const profById = new Map((data?.profiles ?? []).map((p: any) => [p.id, p]));
  const allSelected = tickets.length > 0 && tickets.every((t: any) => selected.has(t.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(tickets.map((t: any) => t.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      const res = await restore({ data: { ids: Array.from(selected) } });
      toast.success(`${res.count} ticket(s) restaurado(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-trash"] });
      qc.invalidateQueries({ queryKey: ["tickets-list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  };

  const onPurge = async () => {
    setBusy(true);
    try {
      const res = await hardDel({ data: { ids: Array.from(selected) } });
      toast.success(`${res.count} ticket(s) apagados definitivamente`);
      setSelected(new Set());
      setPurgeOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-trash"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lixo</h1>
          <p className="text-sm text-muted-foreground">{tickets.length} ticket(s) apagado(s)</p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRestore} disabled={busy}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restaurar ({selected.size})
            </Button>
            <Button variant="destructive" onClick={() => setPurgeOpen(true)} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Apagar definitivamente
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" /> Tickets no lixo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sem tickets apagados.</p>
          ) : (
            <div className="divide-y">
              <div className="flex items-center gap-3 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                <span>Selecionar todos</span>
              </div>
              {tickets.map((t: any) => {
                const deletedBy = t.deleted_by ? profById.get(t.deleted_by) as any : null;
                return (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} />
                    <Link to="/admin/tickets/$id" params={{ id: t.id }} className="flex flex-1 items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-lg">{categoryIcon(t.category as any)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                          <p className="truncate text-sm font-medium">{t.device_name}</p>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.brand} {t.model} · {categoryLabel(t.category as any)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Apagado {new Date(t.deleted_at).toLocaleString("pt-PT")}
                          {deletedBy && <> por <span className="font-medium text-foreground">{deletedBy.full_name ?? deletedBy.email}</span></>}
                          {t.delete_reason && <> · "{t.delete_reason}"</>}
                        </p>
                      </div>
                      <StatusBadge status={t.status as TicketStatus} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar definitivamente {selected.size} ticket(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Mensagens, anexos e métricas associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onPurge} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "A apagar…" : "Apagar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}