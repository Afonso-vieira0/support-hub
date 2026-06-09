import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["super_admin", "admin", "technician", "client"]);
const CategoryEnum = z.enum([
  "hardware","software","networks","printers","operating_systems","mobile_devices","others",
]);

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Apenas administradores podem executar esta ação.");
  }
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }, { data: specs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, avatar_url, created_at").order("created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("technician_specializations").select("technician_id, category"),
    ]);
    return { profiles: profiles ?? [], roles: roles ?? [], specs: specs ?? [] };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: z.infer<typeof RoleEnum>; action: "add" | "remove" }) =>
    z.object({ userId: z.string().uuid(), role: RoleEnum, action: z.enum(["add","remove"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "add") {
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      if (data.role === "super_admin") throw new Error("Não é possível remover Super Admin.");
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setTechnicianSpecializations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { technicianId: string; categories: z.infer<typeof CategoryEnum>[] }) =>
    z.object({ technicianId: z.string().uuid(), categories: z.array(CategoryEnum) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("technician_specializations").delete().eq("technician_id", data.technicianId);
    if (data.categories.length > 0) {
      const rows = data.categories.map((c) => ({ technician_id: data.technicianId, category: c }));
      const { error } = await supabaseAdmin.from("technician_specializations").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: tickets }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("tickets").select("id, status, category, technician_id, client_id, created_at, resolved_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    return { tickets: tickets ?? [], roles: roles ?? [] };
  });