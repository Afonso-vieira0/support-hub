import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { STATUSES, type TicketStatus } from "@/lib/statuses";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { ArrowLeft, Send, Paperclip, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { softDeleteTickets } from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  component: TicketDetailPage,
});

function TicketDetailPage() {
  const { id } = Route.useParams();
  const { user, isAdmin, isTechnician } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const softDelete = useServerFn(softDeleteTickets);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: parties } = useQuery({
    queryKey: ["ticket-parties", ticket?.client_id, ticket?.technician_id],
    enabled: !!ticket,
    queryFn: async () => {
      const ids = [ticket!.client_id, ticket!.technician_id].filter(Boolean) as string[];
      if (ids.length === 0) return {};
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const m: Record<string, { full_name: string | null; email: string | null }> = {};
      (data ?? []).forEach((p) => (m[p.id] = p));
      return m;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("ticket_id", id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["attachments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("id, file_name, file_path, mime_type, created_at, uploader_id")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ticket-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `ticket_id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages", id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({ ticket_id: id, sender_id: user.id, content: text.trim() });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  };

  const changeStatus = async (status: TicketStatus) => {
    const { error } = await supabase.from("tickets").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Estado atualizado");
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await softDelete({ data: { ids: [id], reason: deleteReason.trim() || undefined } });
      toast.success("Ticket movido para o lixo");
      queryClient.invalidateQueries({ queryKey: ["tickets-list"] });
      navigate({ to: "/tickets" });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao apagar");
      setDeleting(false);
    }
  };

  const uploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    const path = `${id}/${Date.now()}-${f.name}`;
    const up = await supabase.storage.from("ticket-attachments").upload(path, f);
    if (up.error) return toast.error(up.error.message);
    await supabase.from("attachments").insert({
      ticket_id: id,
      uploader_id: user.id,
      file_name: f.name,
      file_path: path,
      mime_type: f.type,
      size_bytes: f.size,
    });
    queryClient.invalidateQueries({ queryKey: ["attachments", id] });
    toast.success("Anexo enviado");
    e.target.value = "";
  };

  const downloadAttachment = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("ticket-attachments").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao descarregar");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  };

  if (!ticket) {
    return <p className="text-sm text-muted-foreground">A carregar…</p>;
  }

  const canManage = isAdmin || (isTechnician && ticket.technician_id === user?.id);
  const canDelete = canManage;
  const showRateCta =
    !isAdmin && !isTechnician &&
    ticket.client_id === user?.id &&
    (ticket.status === "resolved" || ticket.status === "closed");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/tickets" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Apagar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar este ticket?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vai para o lixo e pode ser restaurado por um administrador.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea placeholder="Motivo (opcional)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} disabled={deleting}>
                  {deleting ? "A apagar…" : "Apagar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {showRateCta && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-warning" />
              <div>
                <p className="text-sm font-medium">O seu ticket foi resolvido</p>
                <p className="text-xs text-muted-foreground">Avalie o atendimento do técnico.</p>
              </div>
            </div>
            <Button onClick={() => navigate({ to: "/tickets/$id/rate", params: { id } })}>Avaliar atendimento</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="flex h-[70vh] min-h-[500px] flex-col">
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{categoryIcon(ticket.category as any)}</span>
                  <CardTitle className="truncate">{ticket.device_name}</CardTitle>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  #{ticket.ticket_number} · {ticket.brand} {ticket.model} · {categoryLabel(ticket.category as any)}
                </p>
              </div>
              <StatusBadge status={ticket.status as TicketStatus} />
            </div>
          </CardHeader>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Descrição inicial</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{ticket.description}</p>
            </div>
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              const sender = parties?.[m.sender_id];
              return (
                <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-[10px]">
                      {(sender?.full_name ?? sender?.email ?? "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(m.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t p-3">
            <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border hover:bg-accent">
              <Paperclip className="h-4 w-4" />
              <input type="file" className="hidden" onChange={uploadAttachment} />
            </label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem..." disabled={sending} />
            <Button type="submit" size="icon" disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Informação</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Cliente" value={parties?.[ticket.client_id]?.full_name ?? parties?.[ticket.client_id]?.email ?? "—"} />
              <Row label="Técnico" value={ticket.technician_id ? parties?.[ticket.technician_id]?.full_name ?? "Atribuído" : "Por atribuir"} />
              <Row label="Criado" value={new Date(ticket.created_at).toLocaleString("pt-PT")} />
              {ticket.resolved_at && <Row label="Resolvido" value={new Date(ticket.resolved_at).toLocaleString("pt-PT")} />}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Alterar estado</CardTitle></CardHeader>
              <CardContent>
                <Select value={ticket.status} onValueChange={(v) => changeStatus(v as TicketStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Anexos ({attachments.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {attachments.length === 0 && <p className="text-xs text-muted-foreground">Sem anexos.</p>}
              {attachments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => downloadAttachment(a.file_path, a.file_name)}
                  className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{a.file_name}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}