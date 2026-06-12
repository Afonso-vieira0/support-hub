import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { listParts, getTicketParts, usePartsOnTicket, removeTicketPart } from "@/lib/inventory.functions";

export function TicketPartsCard({ ticketId, canEdit }: { ticketId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const fetchUsed = useServerFn(getTicketParts);
  const fetchParts = useServerFn(listParts);
  const useParts = useServerFn(usePartsOnTicket);
  const removePart = useServerFn(removeTicketPart);
  const [partId, setPartId] = useState<string>("");
  const [qty, setQty] = useState(1);

  const { data: used } = useQuery({
    queryKey: ["ticket-parts", ticketId],
    queryFn: () => fetchUsed({ data: { ticketId } }),
  });
  const { data: parts } = useQuery({
    queryKey: ["inventory-options"],
    enabled: canEdit,
    queryFn: () => fetchParts({ data: {} }),
  });

  const add = async () => {
    if (!partId || qty < 1) return toast.error("Escolhe uma peça e quantidade.");
    try {
      await useParts({ data: { ticketId, items: [{ partId, quantity: qty }] } });
      toast.success("Peça registada");
      setPartId(""); setQty(1);
      qc.invalidateQueries({ queryKey: ["ticket-parts", ticketId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta peça e devolver ao stock?")) return;
    try {
      await removePart({ data: { id } });
      qc.invalidateQueries({ queryKey: ["ticket-parts", ticketId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const rows = (used?.rows ?? []) as any[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Package className="h-4 w-4" /> Peças usadas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma peça registada.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.inventory_parts?.name ?? "Peça"}</p>
              <p className="text-xs text-muted-foreground">{r.inventory_parts?.sku} · {r.quantity} {r.inventory_parts?.unit ?? "un"}</p>
            </div>
            {canEdit && (
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="space-y-2 border-t pt-3">
            <Select value={partId} onValueChange={setPartId}>
              <SelectTrigger><SelectValue placeholder="Escolher peça…" /></SelectTrigger>
              <SelectContent>
                {(parts?.parts ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.quantity < 1}>
                    {p.name} · stock {p.quantity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-20" />
              <Button onClick={add} className="flex-1"><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}