import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type TicketCategory } from "@/lib/categories";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tickets/new")({
  component: NewTicketPage,
});

function NewTicketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [device_name, setDeviceName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState<TicketCategory>("hardware");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { data: created, error } = await supabase
      .from("tickets")
      .insert({ client_id: user.id, device_name, brand, model, category, description })
      .select("id")
      .single();
    if (error || !created) {
      setLoading(false);
      return toast.error(error?.message ?? "Erro ao criar ticket");
    }
    if (file) {
      const path = `${created.id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("ticket-attachments").upload(path, file);
      if (!up.error) {
        await supabase.from("attachments").insert({
          ticket_id: created.id,
          uploader_id: user.id,
          file_name: file.name,
          file_path: path,
          mime_type: file.type,
          size_bytes: file.size,
        });
      }
    }
    setLoading(false);
    toast.success("Ticket criado!");
    navigate({ to: "/tickets/$id", params: { id: created.id } });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novo ticket</h1>
        <p className="text-sm text-muted-foreground">Descreva o problema com o seu dispositivo.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Detalhes</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="dn">Nome do dispositivo</Label>
                <Input id="dn" required value={device_name} onChange={(e) => setDeviceName(e.target.value)} placeholder="Ex.: Portátil de trabalho" />
              </div>
              <div className="space-y-2"><Label htmlFor="b">Marca</Label><Input id="b" required value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Dell" /></div>
              <div className="space-y-2"><Label htmlFor="m">Modelo</Label><Input id="m" required value={model} onChange={(e) => setModel(e.target.value)} placeholder="XPS 13" /></div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="d">Descrição do problema</Label>
                <Textarea id="d" required rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva detalhadamente o problema..." />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="f">Anexo (opcional)</Label>
                <Input id="f" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/tickets" })}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar ticket</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}