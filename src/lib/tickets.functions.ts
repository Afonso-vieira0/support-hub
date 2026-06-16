import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

export const softDeleteTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; reason?: string }) => {
    if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("Sem tickets selecionados.");
    if (input.ids.length > 200) throw new Error("Máximo 200 tickets por operação.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS already restricts who can update which tickets (admin or assigned tech).
    const { data: updated, error } = await supabase
      .from("tickets")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId, delete_reason: data.reason ?? null })
      .in("id", data.ids)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { count: updated?.length ?? 0 };
  });

export const restoreTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("Sem tickets selecionados.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("tickets")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { count: updated?.length ?? 0 };
  });

export const hardDeleteTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("Sem tickets selecionados.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tickets").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { count: data.ids.length };
  });

export const getTrashTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: tickets, error } = await context.supabase
      .from("tickets")
      .select("id, ticket_number, device_name, brand, model, category, status, created_at, client_id, technician_id, deleted_at, deleted_by, delete_reason")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((tickets ?? []).flatMap((t: any) => [t.client_id, t.technician_id, t.deleted_by].filter(Boolean))));
    let profiles: any[] = [];
    if (ids.length) {
      const { data } = await context.supabase.from("profiles").select("id, full_name, email").in("id", ids);
      profiles = data ?? [];
    }
    return { tickets: tickets ?? [], profiles };
  });