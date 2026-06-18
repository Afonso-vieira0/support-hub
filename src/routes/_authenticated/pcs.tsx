import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Monitor, Activity, Wrench } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pcs")({
  component: PcsPage,
});

type PcStatus = "Ativo" | "Em Manutenção" | "Inativo";
type TicketStatus = "Resolvido" | "Em Andamento" | "Encaminhado";

type Pc = {
  id: string;
  nome: string;
  marca: string;
  processador: string;
  ram: number;
  armazenamento: string;
  so: string;
  usuario: string;
  departamento: string;
  aquisicao: string;
  status: PcStatus;
  serie: string;
  observacoes: string;
};

type PcTicket = {
  numero: string;
  data: string;
  pcId: string;
  nomeComputador: string;
  marca: string;
  usuario: string;
  departamento: string;
  descricao: string;
  diagnostico: string;
  solucao: string;
  status: TicketStatus;
  conclusao: string;
  responsavel: string;
  observacoes: string;
};

const PCS_KEY = "pcs.inventory.v1";
const TICKETS_KEY = "pcs.tickets.v1";
const COUNTER_KEY = "pcs.tickets.counter.v1";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

const STATUSES: PcStatus[] = ["Ativo", "Em Manutenção", "Inativo"];
const TICKET_STATUSES: TicketStatus[] = ["Resolvido", "Em Andamento", "Encaminhado"];

const emptyPc: Pc = {
  id: "", nome: "", marca: "", processador: "", ram: 0, armazenamento: "",
  so: "", usuario: "", departamento: "", aquisicao: "", status: "Ativo",
  serie: "", observacoes: "",
};

function PcsPage() {
  const { isAdmin, isTechnician } = useAuth();
  const [pcs, setPcs] = useState<Pc[]>([]);
  const [tickets, setTickets] = useState<PcTicket[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPcs(load<Pc[]>(PCS_KEY, []));
    setTickets(load<PcTicket[]>(TICKETS_KEY, []));
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) save(PCS_KEY, pcs); }, [pcs, hydrated]);
  useEffect(() => { if (hydrated) save(TICKETS_KEY, tickets); }, [tickets, hydrated]);

  if (!isAdmin && !isTechnician) {
    return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">PCs & Fichas de Manutenção</h1>
        <p className="text-sm text-muted-foreground">Inventário de computadores e tickets de manutenção (guardado localmente).</p>
      </div>
      <Tabs defaultValue="inv" className="w-full">
        <TabsList>
          <TabsTrigger value="inv"><Monitor className="mr-2 h-4 w-4" />Inventário de PCs</TabsTrigger>
          <TabsTrigger value="tk"><Wrench className="mr-2 h-4 w-4" />Fichas de Ticket</TabsTrigger>
        </TabsList>
        <TabsContent value="inv" className="mt-4">
          <PcInventory pcs={pcs} setPcs={setPcs} />
        </TabsContent>
        <TabsContent value="tk" className="mt-4">
          <TicketsSection pcs={pcs} tickets={tickets} setTickets={setTickets} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: PcStatus }) {
  const tone = status === "Ativo" ? "bg-success/15 text-success"
    : status === "Em Manutenção" ? "bg-warning/15 text-warning"
    : "bg-muted text-muted-foreground";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function PcInventory({ pcs, setPcs }: { pcs: Pc[]; setPcs: (v: Pc[]) => void }) {
  const [filter, setFilter] = useState<"todos" | PcStatus>("todos");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    total: pcs.length,
    ativos: pcs.filter((p) => p.status === "Ativo").length,
    manut: pcs.filter((p) => p.status === "Em Manutenção").length,
  }), [pcs]);

  const filtered = pcs.filter((p) => {
    if (filter !== "todos" && p.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return [p.id, p.nome, p.marca, p.usuario, p.departamento, p.serie].some((v) => (v ?? "").toLowerCase().includes(s));
    }
    return true;
  });

  const removePc = (id: string) => {
    if (!confirm("Eliminar este PC?")) return;
    setPcs(pcs.filter((p) => p.id !== id));
    toast.success("PC eliminado");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Monitor className="h-4 w-4" />} label="Total de PCs" value={counts.total} />
        <Stat icon={<Activity className="h-4 w-4 text-success" />} label="PCs Ativos" value={counts.ativos} />
        <Stat icon={<Wrench className="h-4 w-4 text-warning" />} label="Em Manutenção" value={counts.manut} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Computadores</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-56" />
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <PcDialog onSave={(pc) => { setPcs([...pcs, pc]); toast.success("PC adicionado"); }} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Marca/Modelo</TableHead>
                  <TableHead>Processador</TableHead>
                  <TableHead className="text-right">RAM</TableHead>
                  <TableHead>Armaz.</TableHead>
                  <TableHead>SO</TableHead>
                  <TableHead>Utilizador</TableHead>
                  <TableHead>Depart.</TableHead>
                  <TableHead>Aquisição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Nº Série</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.marca}</TableCell>
                    <TableCell className="text-xs">{p.processador}</TableCell>
                    <TableCell className="text-right">{p.ram}</TableCell>
                    <TableCell className="text-xs">{p.armazenamento}</TableCell>
                    <TableCell className="text-xs">{p.so}</TableCell>
                    <TableCell>{p.usuario}</TableCell>
                    <TableCell>{p.departamento}</TableCell>
                    <TableCell className="text-xs">{p.aquisicao}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="font-mono text-xs">{p.serie}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <PcDialog pc={p} onSave={(np) => { setPcs(pcs.map((x) => x.id === p.id ? np : x)); toast.success("PC atualizado"); }} />
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removePc(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-10">Sem PCs.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function PcDialog({ pc, onSave }: { pc?: Pc; onSave: (pc: Pc) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Pc>(pc ?? { ...emptyPc, id: `PC-${Date.now().toString(36).toUpperCase()}` });

  useEffect(() => {
    if (open) setF(pc ?? { ...emptyPc, id: `PC-${Date.now().toString(36).toUpperCase()}` });
  }, [open, pc]);

  const submit = () => {
    if (!f.id.trim() || !f.nome.trim()) { toast.error("ID e Nome são obrigatórios"); return; }
    onSave({ ...f, ram: Number(f.ram) || 0 });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {pc ? <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
            : <Button><Plus className="mr-2 h-4 w-4" />Adicionar PC</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{pc ? "Editar PC" : "Novo PC"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="ID_PC"><Input value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} /></Field>
          <Field label="Nome do Computador"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
          <Field label="Marca/Modelo"><Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></Field>
          <Field label="Processador"><Input value={f.processador} onChange={(e) => setF({ ...f, processador: e.target.value })} /></Field>
          <Field label="RAM (GB)"><Input type="number" value={f.ram} onChange={(e) => setF({ ...f, ram: Number(e.target.value) })} /></Field>
          <Field label="Armazenamento"><Input value={f.armazenamento} onChange={(e) => setF({ ...f, armazenamento: e.target.value })} /></Field>
          <Field label="Sistema Operacional"><Input value={f.so} onChange={(e) => setF({ ...f, so: e.target.value })} /></Field>
          <Field label="Utilizador Responsável"><Input value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} /></Field>
          <Field label="Departamento/Local"><Input value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })} /></Field>
          <Field label="Data de Aquisição"><Input type="date" value={f.aquisicao} onChange={(e) => setF({ ...f, aquisicao: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as PcStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Número de Série"><Input value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} /></Field>
          <div className="sm:col-span-2 md:col-span-3">
            <Field label="Observações"><Textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function nextTicketNumber(): string {
  const n = (load<number>(COUNTER_KEY, 0) ?? 0) + 1;
  save(COUNTER_KEY, n);
  return `TK-${String(n).padStart(5, "0")}`;
}

function TicketsSection({ pcs, tickets, setTickets }: { pcs: Pc[]; tickets: PcTicket[]; setTickets: (v: PcTicket[]) => void }) {
  const blank = (): PcTicket => ({
    numero: "", data: new Date().toISOString().slice(0, 10), pcId: "",
    nomeComputador: "", marca: "", usuario: "", departamento: "",
    descricao: "", diagnostico: "", solucao: "",
    status: "Em Andamento", conclusao: "", responsavel: "", observacoes: "",
  });
  const [form, setForm] = useState<PcTicket>(blank());
  const [editing, setEditing] = useState<string | null>(null);

  const selectPc = (pcId: string) => {
    const pc = pcs.find((p) => p.id === pcId);
    if (!pc) return;
    setForm((f) => ({ ...f, pcId, nomeComputador: pc.nome, marca: pc.marca, usuario: pc.usuario, departamento: pc.departamento }));
  };

  const submit = () => {
    if (!form.pcId) { toast.error("Selecione um PC"); return; }
    if (!form.descricao.trim()) { toast.error("Descrição obrigatória"); return; }
    if (editing) {
      setTickets(tickets.map((t) => t.numero === editing ? form : t));
      toast.success("Ticket atualizado");
    } else {
      const t = { ...form, numero: nextTicketNumber() };
      setTickets([t, ...tickets]);
      toast.success(`Ticket ${t.numero} criado`);
    }
    setForm(blank()); setEditing(null);
  };

  const edit = (t: PcTicket) => { setForm(t); setEditing(t.numero); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const remove = (numero: string) => {
    if (!confirm("Eliminar este ticket?")) return;
    setTickets(tickets.filter((t) => t.numero !== numero));
    if (editing === numero) { setForm(blank()); setEditing(null); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">{editing ? `Editar ${editing}` : "Nova Ficha de Ticket"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Field label="Número do Ticket">
              <Input value={editing ?? "(gerado automaticamente)"} disabled />
            </Field>
            <Field label="Data do Ticket"><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></Field>
            <Field label="PC">
              <Select value={form.pcId} onValueChange={selectPc}>
                <SelectTrigger><SelectValue placeholder="Selecionar PC..." /></SelectTrigger>
                <SelectContent>
                  {pcs.length === 0 && <SelectItem value="__none" disabled>Sem PCs no inventário</SelectItem>}
                  {pcs.map((p) => <SelectItem key={p.id} value={p.id}>{p.id} — {p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nome do Computador"><Input value={form.nomeComputador} disabled /></Field>
            <Field label="Marca/Modelo"><Input value={form.marca} disabled /></Field>
            <Field label="Utilizador"><Input value={form.usuario} disabled /></Field>
            <Field label="Departamento"><Input value={form.departamento} disabled /></Field>
            <Field label="Status Final">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TicketStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Data de Conclusão"><Input type="date" value={form.conclusao} onChange={(e) => setForm({ ...form, conclusao: e.target.value })} /></Field>
            <Field label="Responsável Técnico"><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Descrição do Problema"><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
            <Field label="Diagnóstico"><Textarea rows={3} value={form.diagnostico} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} /></Field>
            <Field label="Solução Aplicada"><Textarea rows={3} value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} /></Field>
            <Field label="Observações Finais"><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            {editing && <Button variant="outline" onClick={() => { setForm(blank()); setEditing(null); }}>Cancelar</Button>}
            <Button onClick={submit}>{editing ? "Guardar" : "Criar Ticket"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tickets registados</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>PC</TableHead>
                  <TableHead>Utilizador</TableHead>
                  <TableHead>Problema</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Conclusão</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.numero}>
                    <TableCell className="font-mono text-xs">{t.numero}</TableCell>
                    <TableCell className="text-xs">{t.data}</TableCell>
                    <TableCell><div className="font-medium">{t.pcId}</div><div className="text-xs text-muted-foreground">{t.nomeComputador}</div></TableCell>
                    <TableCell>{t.usuario}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{t.descricao}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{t.status}</Badge></TableCell>
                    <TableCell>{t.responsavel}</TableCell>
                    <TableCell className="text-xs">{t.conclusao || "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => edit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(t.numero)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {tickets.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-10">Sem tickets.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}