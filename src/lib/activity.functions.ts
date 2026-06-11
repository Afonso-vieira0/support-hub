import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Apenas administradores.");
  }
}

export const getActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; types?: string[]; technicianId?: string; sinceHours?: number }) =>
    z.object({
      limit: z.number().min(1).max(200).optional(),
      types: z.array(z.string()).optional(),
      technicianId: z.string().uuid().optional(),
      sinceHours: z.number().min(1).max(24 * 30).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("activity_events")
      .select("id, type, from_value, to_value, metadata, created_at, actor_id, ticket_id")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.types?.length) q = q.in("type", data.types as any);
    if (data.sinceHours) {
      const since = new Date(Date.now() - data.sinceHours * 3600 * 1000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data: events } = await q;
    const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))) as string[];
    const ticketIds = Array.from(new Set((events ?? []).map((e) => e.ticket_id).filter(Boolean))) as string[];
    const [{ data: actors }, { data: tickets }] = await Promise.all([
      actorIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] as any[] }),
      ticketIds.length
        ? supabaseAdmin
            .from("tickets")
            .select("id, ticket_number, device_name, technician_id, client_id")
            .in("id", ticketIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    let filtered = events ?? [];
    if (data.technicianId) {
      const tIds = new Set((tickets ?? []).filter((t: any) => t.technician_id === data.technicianId).map((t: any) => t.id));
      filtered = filtered.filter((e) => (e.ticket_id && tIds.has(e.ticket_id)) || e.actor_id === data.technicianId);
    }
    return { events: filtered, actors: actors ?? [], tickets: tickets ?? [] };
  });

export const getTicketFullView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ticket }, { data: metrics }, { data: events }, { data: messages }, { data: history }, { data: rating }] =
      await Promise.all([
        supabaseAdmin.from("tickets").select("*").eq("id", data.ticketId).single(),
        supabaseAdmin.from("ticket_metrics").select("*").eq("ticket_id", data.ticketId).maybeSingle(),
        supabaseAdmin.from("activity_events").select("*").eq("ticket_id", data.ticketId).order("created_at"),
        supabaseAdmin.from("messages").select("*").eq("ticket_id", data.ticketId).order("created_at"),
        supabaseAdmin.from("ticket_history").select("*").eq("ticket_id", data.ticketId).order("created_at"),
        supabaseAdmin.from("ticket_ratings").select("*").eq("ticket_id", data.ticketId).maybeSingle(),
      ]);
    const ids = Array.from(
      new Set([ticket?.client_id, ticket?.technician_id, ...(messages ?? []).map((m: any) => m.sender_id)].filter(Boolean) as string[]),
    );
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };
    return { ticket, metrics, events: events ?? [], messages: messages ?? [], history: history ?? [], rating, profiles: profiles ?? [] };
  });

export const getRatableTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, device_name, status, client_id, technician_id, resolved_at")
      .eq("id", data.ticketId)
      .single();
    if (!t || t.client_id !== context.userId) throw new Error("Não autorizado.");
    if (!["resolved", "closed"].includes(t.status as string)) throw new Error("Ticket ainda não resolvido.");
    const { data: existing } = await supabaseAdmin
      .from("ticket_ratings").select("ticket_id").eq("ticket_id", data.ticketId).maybeSingle();
    let techName: string | null = null;
    if (t.technician_id) {
      const { data: p } = await supabaseAdmin
        .from("profiles").select("full_name, email").eq("id", t.technician_id).maybeSingle();
      techName = p?.full_name ?? p?.email ?? null;
    }
    return { ticket: t, alreadyRated: !!existing, technicianName: techName };
  });

export const submitTicketRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; solved: boolean; stars: number; comment?: string }) =>
    z.object({
      ticketId: z.string().uuid(),
      solved: z.boolean(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets").select("id, client_id, technician_id, status").eq("id", data.ticketId).single();
    if (!t || t.client_id !== context.userId) throw new Error("Não autorizado.");
    if (!["resolved", "closed"].includes(t.status as string)) throw new Error("Ticket ainda não resolvido.");
    const { error } = await supabaseAdmin.from("ticket_ratings").insert({
      ticket_id: data.ticketId,
      client_id: context.userId,
      technician_id: t.technician_id,
      solved: data.solved,
      stars: data.stars,
      comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logUserLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const list = (roles ?? []).map((r: any) => r.role);
    const role = list.includes("super_admin") ? "super_admin"
      : list.includes("admin") ? "admin"
      : list.includes("technician") ? "technician" : "client";
    await supabaseAdmin.from("login_events").insert({ user_id: context.userId, role_snapshot: role });
    if (role === "admin" || role === "super_admin" || role === "technician") {
      await supabaseAdmin.from("activity_events").insert({ actor_id: context.userId, type: "user_login", to_value: role });
    }
    return { ok: true };
  });