import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  listParts, upsertPart, adjustStock, deletePart, exportInventoryXlsx, getInventoryStats,
} from "@/lib/inventory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Download, Plus, ArrowUpDown, Trash2, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const CATS = ["ram", "ssd", "hdd", "psu", "screen", "battery", "cable", "motherboard", "cpu", "gpu", "keyboard", "other"];
const CAT_LABELS: Record<string, string> = {
  ram: "RAM", ssd: "SSD", hdd: "HDD", psu: "Fonte", screen: "Ecrã", battery: "Bateria",
  cable: "Cabo", motherboard: "Motherboard", cpu: "CPU", gpu: "GPU", keyboard: "Teclado", other: "Outro",
};

export const Route = createFileRoute("/_authenticated/admin/inventory/")({
  component: InventoryPage,
});

function InventoryPage() {
  const { isAdmin, isTechnician } = useAuth();
  const qc = useQueryClient();
  const fetchList = useServerFn(listParts);
  const fetchStats = useServerFn(getInventoryStats);
  const exportFn = useServerFn(exportInventoryXlsx);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const { data } = useQuery({
    queryKey: ["inventory", search, lowOnly],
    enabled: isAdmin || isTechnician,
    queryFn: () => fetchList({ data: { search: search || undefined, lowStockOnly: lowOnly } }),
  });
  const { data: stats } = useQuery({
    queryKey: ["inventory-stats"],
    enabled: isAdmin || isTechnician,
    queryFn: () => fetchStats(),
  });

  if (!isAdmin && !isTechnician) return <p className="text-sm text-muted-foreground">Acesso restrito.</p>;

  const onExport = async () => {
    try {
      const { base64, filename } = await exportFn();
      const bin = atob(base64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "Erro a exportar"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventário</h1>
          <p className="text-sm text-muted-foreground">Peças disponíveis para reparações.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" /> Exportar Excel</Button>}
          {isAdmin && <PartDialog onSaved={() => qc.invalidateQueries({ queryKey: ["inventory"] })} />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Package className="h-4 w-4" />} label="Peças" value={String(stats?.partsCount ?? 0)} />
        <Stat icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Abaixo do mínimo" value={String(stats?.lowStock ?? 0)} />
        <Stat label="Valor de stock" value={`€ ${Number(stats?.totalValue ?? 0).toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Peças</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="low" checked={lowOnly} onCheckedChange={setLowOnly} />
              <Label htmlFor="low" className="text-xs">Stock baixo</Label>
            </div>
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Mín.</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead>Localização</TableHead>
                {isAdmin && <TableHead className="w-32 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.parts ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <Link to="/admin/inventory/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.name}</Link>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{CAT_LABELS[p.category] ?? p.category}</Badge></TableCell>
                  <TableCell className="text-right">
                    <StockBadge qty={p.quantity} min={p.min_quantity} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{p.min_quantity}</TableCell>
                  <TableCell className="text-right text-xs">€ {Number(p.unit_cost).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.location ?? "—"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <AdjustDialog part={p} onSaved={() => qc.invalidateQueries({ queryKey: ["inventory"] })} />
                        <PartDialog part={p} onSaved={() => qc.invalidateQueries({ queryKey: ["inventory"] })} />
                        <DeleteBtn id={p.id} onDone={() => qc.invalidateQueries({ queryKey: ["inventory"] })} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(data?.parts ?? []).length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-sm text-muted-foreground py-10">Sem peças.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function StockBadge({ qty, min }: { qty: number; min: number }) {
  const tone = qty <= min ? "bg-destructive/15 text-destructive" : qty <= min * 1.5 ? "bg-warning/15 text-warning" : "bg-success/15 text-success";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{qty}</span>;
}

function PartDialog({ part, onSaved }: { part?: any; onSaved: () => void }) {
  const save = useServerFn(upsertPart);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sku: part?.sku ?? "",
    name: part?.name ?? "",
    category: part?.category ?? "other",
    unit: part?.unit ?? "un",
    quantity: part?.quantity ?? 0,
    min_quantity: part?.min_quantity ?? 0,
    unit_cost: part?.unit_cost ?? 0,
    location: part?.location ?? "",
    notes: part?.notes ?? "",
  });
  const submit = async () => {
    try {
      await save({ data: {
        id: part?.id, sku: form.sku, name: form.name, category: form.category, unit: form.unit,
        quantity: Number(form.quantity), min_quantity: Number(form.min_quantity), unit_cost: Number(form.unit_cost),
        location: form.location || null, notes: form.notes || null,
      }});
      toast.success("Guardado");
      setOpen(false); onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {part
          ? <Button size="sm" variant="ghost">Editar</Button>
          : <Button><Plus className="mr-2 h-4 w-4" /> Nova peça</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{part ? "Editar peça" : "Nova peça"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Categoria">
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Unidade"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          {!part && <Field label="Stock inicial"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value as any })} /></Field>}
          <Field label="Mínimo"><Input type="number" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value as any })} /></Field>
          <Field label="Custo unit. (€)"><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value as any })} /></Field>
          <Field label="Localização"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Notas"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ part, onSaved }: { part: any; onSaved: () => void }) {
  const adjust = useServerFn(adjustStock);
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState<"purchase" | "adjustment" | "return">("purchase");
  const [notes, setNotes] = useState("");
  const submit = async () => {
    try {
      await adjust({ data: { partId: part.id, delta: Number(delta), reason, notes: notes || undefined } });
      toast.success("Stock atualizado"); setOpen(false); onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" title="Ajustar stock"><ArrowUpDown className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajustar stock — {part.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Variação (positivo = entrada, negativo = saída)">
            <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </Field>
          <Field label="Motivo">
            <Select value={reason} onValueChange={(v) => setReason(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Compra</SelectItem>
                <SelectItem value="adjustment">Ajuste</SelectItem>
                <SelectItem value="return">Devolução</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notas"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBtn({ id, onDone }: { id: string; onDone: () => void }) {
  const del = useServerFn(deletePart);
  return (
    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
      onClick={async () => {
        if (!confirm("Arquivar esta peça?")) return;
        try { await del({ data: { id } }); toast.success("Arquivada"); onDone(); }
        catch (e: any) { toast.error(e?.message ?? "Erro"); }
      }}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}