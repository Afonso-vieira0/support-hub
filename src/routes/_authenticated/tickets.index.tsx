import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryIcon, categoryLabel } from "@/lib/categories";
import { STATUSES, type TicketStatus } from "@/lib/statuses";
import { Plus, Search, Ticket as TicketIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsListPage,
});

function TicketsListPage() {
  const { user, isClient, isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} resultado(s)</p>
        </div>
        {(isClient || isAdmin) && (
          <Button asChild>
            <Link to="/tickets/new"><Plus className="mr-2 h-4 w-4" />Novo ticket</Link>
          </Button>
        )}
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
              {filtered.map((t) => (
                <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}