import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listUsersWithRoles, setUserRole, setTechnicianSpecializations } from "@/lib/admin.functions";
import { CATEGORIES, categoryLabel, type TicketCategory } from "@/lib/categories";
import type { AppRole } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Settings, Shield, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  technician: "Técnico",
  client: "Cliente",
};

function AdminUsersPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fnList = useServerFn(listUsersWithRoles);
  const fnRole = useServerFn(setUserRole);
  const fnSpec = useServerFn(setTechnicianSpecializations);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () => fnList(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const toggleRole = async (userId: string, role: AppRole, has: boolean) => {
    try {
      await fnRole({ data: { userId, role, action: has ? "remove" : "add" } });
      toast.success("Papel atualizado");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    }
  };

  const profiles = data?.profiles ?? [];
  const rolesMap = new Map<string, AppRole[]>();
  (data?.roles ?? []).forEach((r) => {
    const cur = rolesMap.get(r.user_id) ?? [];
    cur.push(r.role as AppRole);
    rolesMap.set(r.user_id, cur);
  });
  const specsMap = new Map<string, TicketCategory[]>();
  (data?.specs ?? []).forEach((s: any) => {
    const cur = specsMap.get(s.technician_id) ?? [];
    cur.push(s.category as TicketCategory);
    specsMap.set(s.technician_id, cur);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilizadores</h1>
        <p className="text-sm text-muted-foreground">Gerir papéis e especializações.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />{profiles.length} utilizadores</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {profiles.map((p: any) => {
              const userRoles = rolesMap.get(p.id) ?? [];
              const isTech = userRoles.includes("technician");
              const specs = specsMap.get(p.id) ?? [];
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.full_name ?? "Sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {userRoles.map((r) => (
                      <Badge key={r} variant={r === "super_admin" || r === "admin" ? "default" : "secondary"}>
                        <Shield className="mr-1 h-3 w-3" />{ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><Settings className="mr-2 h-3.5 w-3.5" />Gerir</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{p.full_name ?? p.email}</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-sm font-medium">Papéis</p>
                          <div className="space-y-2">
                            {(["admin", "technician", "client"] as AppRole[]).map((r) => {
                              const has = userRoles.includes(r);
                              return (
                                <label key={r} className="flex items-center gap-3 rounded-md border p-2">
                                  <Checkbox checked={has} onCheckedChange={() => toggleRole(p.id, r, has)} />
                                  <span className="text-sm">{ROLE_LABELS[r]}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        {isTech && (
                          <div>
                            <p className="mb-2 text-sm font-medium">Especializações</p>
                            <SpecEditor
                              userId={p.id}
                              current={specs}
                              onSave={async (cats) => {
                                try {
                                  await fnSpec({ data: { technicianId: p.id, categories: cats } });
                                  toast.success("Especializações atualizadas");
                                  refresh();
                                } catch (e: any) {
                                  toast.error(e.message ?? "Erro");
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SpecEditor({ userId, current, onSave }: { userId: string; current: TicketCategory[]; onSave: (cats: TicketCategory[]) => void }) {
  const [selected, setSelected] = useState<TicketCategory[]>(current);
  useEffect(() => setSelected(current), [userId]);
  const toggle = (c: TicketCategory) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => (
          <label key={c.value} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <Checkbox checked={selected.includes(c.value)} onCheckedChange={() => toggle(c.value)} />
            <span>{c.icon} {c.label}</span>
          </label>
        ))}
      </div>
      <Button size="sm" className="w-full" onClick={() => onSave(selected)}>Guardar</Button>
    </div>
  );
}