import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryIcon, categoryLabel } from "@/lib/categories";
import { STATUSES, type TicketStatus } from "@/lib/statuses";
import { Plus, Search, Ticket as TicketIcon, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { softDeleteTickets } from "@/lib/tickets.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsListPage,
});

function TicketsListPage() {
  const { user, isClient, isAdmin, isTechnician } = useAuth();
  const queryClient = useQueryClient();
  const softDelete = useServerFn(softDeleteTickets);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_number, device_name, brand, model, category, status, created_at, client_id, technician_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = tickets.filter((t) => {
    if (status !== "all" && t.status !== status) return false;
    if (category !== "all" && t.category !== category) return false;
    if (q && !`${t.device_name} ${t.brand} ${t.model} #${t.ticket_number}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const canDelete = (t: any) => isAdmin || (isTechnician && t.technician_id === user?.id);
  const deletableVisible = filtered.filter(canDelete);
  const showSelection = deletableVisible.length > 0;
  const allSelected = showSelection && deletableVisible.every((t) => selected.has(t.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        deletableVisible.forEach((t) => next.delete(t.id));
        return next;
      }
      const next = new Set(prev);
      deletableVisible.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await softDelete({ data: { ids: Array.from(selected), reason: reason.trim() || undefined } });
      toast.success(`${res.count} ticket(s) movido(s) para o lixo`);
      setSelected(new Set());
      setReason("");
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["tickets-list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao apagar");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} resultado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Apagar selecionados ({selected.size})
            </Button>
          )}
          {(isClient || isAdmin) && (
            <Button asChild>
              <Link to="/tickets/new"><Plus className="mr-2 h-4 w-4" />Novo ticket</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Procurar..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">A carregar…</p>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <TicketIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">Sem tickets.</p>
            </div>
          ) : (
            <div className="divide-y">
              {showSelection && (
                <div className="flex items-center gap-3 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                  <span>Selecionar todos ({deletableVisible.length} apagáveis)</span>
                </div>
              )}
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  {canDelete(t) ? (
                    <Checkbox
                      checked={selected.has(t.id)}
                      onCheckedChange={() => toggleOne(t.id)}
                      aria-label="Selecionar ticket"
                    />
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                  <Link to="/tickets/$id" params={{ id: t.id }} className="flex flex-1 items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-lg">{categoryIcon(t.category as any)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                        <p className="truncate text-sm font-medium">{t.device_name}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{t.brand} {t.model} · {categoryLabel(t.category as any)}</p>
                    </div>
                    <StatusBadge status={t.status as TicketStatus} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {selected.size} ticket(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os tickets vão para o lixo e podem ser restaurados por um administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting ? "A apagar…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}