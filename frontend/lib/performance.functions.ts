import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ALERT_THRESHOLDS } from "./alerts";

const RangeEnum = z.enum(["7d", "30d", "6m", "1y", "all"]);
type Range = z.infer<typeof RangeEnum>;

function rangeStart(r: Range): Date | null {
  const now = Date.now();
  switch (r) {
    case "7d": return new Date(now - 7 * 86400_000);
    case "30d": return new Date(now - 30 * 86400_000);
    case "6m": return new Date(now - 182 * 86400_000);
    case "1y": return new Date(now - 365 * 86400_000);
    case "all": return null;
  }
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Apenas administradores.");
  }
}

function avg(nums: number[]): number {
  const valid = nums.filter((n) => typeof n === "number" && !isNaN(n));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

function aggregateTech(techId: string, tickets: any[], metrics: any[], ratings: any[]) {
  const mine = tickets.filter((t) => t.technician_id === techId);
  const ids = new Set(mine.map((t) => t.id));
  const mineMetrics = metrics.filter((m) => ids.has(m.ticket_id));
  const mineRatings = ratings.filter((r) => r.technician_id === techId);
  const active = mine.filter((t) => !["resolved", "closed"].includes(t.status));
  const resolved = mine.filter((t) => t.status === "resolved");
  const closed = mine.filter((t) => t.status === "closed");
  const clients = new Set(mine.map((t) => t.client_id)).size;
  return {
    technicianId: techId,
    total: mine.length,
    active: active.length,
    resolved: resolved.length,
    closed: closed.length,
    clients,
    resolutionRate: mine.length ? (resolved.length + closed.length) / mine.length : 0,
    avgFirstResponse: avg(mineMetrics.map((m) => m.time_to_first_response_seconds).filter((x) => x != null)),
    avgResolution: avg(mineMetrics.map((m) => m.total_resolution_seconds).filter((x) => x != null)),
    avgRating: avg(mineRatings.map((r) => r.stars)),
    ratingsCount: mineRatings.length,
  };
}

export const getTechniciansOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: techRoles }, { data: tickets }, { data: metrics }, { data: ratings }, { data: profiles }, { data: specs }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("user_id").eq("role", "technician"),
        supabaseAdmin.from("tickets").select("id, status, technician_id, client_id, created_at, resolved_at, category"),
        supabaseAdmin.from("ticket_metrics").select("ticket_id, time_to_first_response_seconds, total_resolution_seconds"),
        supabaseAdmin.from("ticket_ratings").select("technician_id, stars, solved"),
        supabaseAdmin.from("profiles").select("id, full_name, email, avatar_url"),
        supabaseAdmin.from("technician_specializations").select("technician_id, category"),
      ]);
    const techIds = (techRoles ?? []).map((r: any) => r.user_id);
    const rows = techIds.map((id) => {
      const stats = aggregateTech(id, tickets ?? [], metrics ?? [], ratings ?? []);
      const profile = (profiles ?? []).find((p: any) => p.id === id);
      const categories = (specs ?? []).filter((s: any) => s.technician_id === id).map((s: any) => s.category);
      return { ...stats, profile, categories };
    });
    return { rows };
  });

export const getTechnicianProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { technicianId: string; range?: Range }) =>
    z.object({ technicianId: z.string().uuid(), range: RangeEnum.optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const range = data.range ?? "30d";
    const since = rangeStart(range);
    let tq = supabaseAdmin
      .from("tickets")
      .select("id, status, technician_id, client_id, created_at, resolved_at, category")
      .eq("technician_id", data.technicianId);
    if (since) tq = tq.gte("created_at", since.toISOString());
    const { data: tickets } = await tq;
    const ids = (tickets ?? []).map((t: any) => t.id);
    const [{ data: metrics }, { data: ratings }, { data: profile }, { data: specs }] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("ticket_metrics").select("*").in("ticket_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin.from("ticket_ratings").select("stars, solved, created_at, comment, ticket_id").eq("technician_id", data.technicianId),
      supabaseAdmin.from("profiles").select("*").eq("id", data.technicianId).maybeSingle(),
      supabaseAdmin.from("technician_specializations").select("category").eq("technician_id", data.technicianId),
    ]);
    const stats = aggregateTech(data.technicianId, tickets ?? [], metrics ?? [], ratings ?? []);
    // monthly series
    const series: Record<string, { resolved: number; firstResp: number[]; resolution: number[]; rating: number[] }> = {};
    (tickets ?? []).forEach((t: any) => {
      const k = new Date(t.created_at).toISOString().slice(0, 7);
      series[k] ??= { resolved: 0, firstResp: [], resolution: [] , rating: []};
      if (t.status === "resolved" || t.status === "closed") series[k].resolved += 1;
      const m = (metrics ?? []).find((mm: any) => mm.ticket_id === t.id);
      if (m?.time_to_first_response_seconds != null) series[k].firstResp.push(m.time_to_first_response_seconds);
      if (m?.total_resolution_seconds != null) series[k].resolution.push(m.total_resolution_seconds);
    });
    (ratings ?? []).forEach((r: any) => {
      const k = new Date(r.created_at).toISOString().slice(0, 7);
      series[k] ??= { resolved: 0, firstResp: [], resolution: [], rating: [] };
      series[k].rating.push(r.stars);
    });
    const monthly = Object.entries(series)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        month: k,
        resolved: v.resolved,
        avgFirstResponse: Math.round(avg(v.firstResp)),
        avgResolution: Math.round(avg(v.resolution)),
        avgRating: Number(avg(v.rating).toFixed(2)),
      }));
    return { profile, specs: (specs ?? []).map((s: any) => s.category), stats, monthly, ratings: ratings ?? [] };
  });

export const compareTechnicians = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; range?: Range }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(6), range: RangeEnum.optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = rangeStart(data.range ?? "30d");
    let tq = supabaseAdmin.from("tickets").select("*").in("technician_id", data.ids);
    if (since) tq = tq.gte("created_at", since.toISOString());
    const [{ data: tickets }, { data: metrics }, { data: ratings }, { data: profiles }] = await Promise.all([
      tq,
      supabaseAdmin.from("ticket_metrics").select("*"),
      supabaseAdmin.from("ticket_ratings").select("*").in("technician_id", data.ids),
      supabaseAdmin.from("profiles").select("id, full_name, email").in("id", data.ids),
    ]);
    const rows = data.ids.map((id) => ({
      ...aggregateTech(id, tickets ?? [], metrics ?? [], ratings ?? []),
      profile: (profiles ?? []).find((p: any) => p.id === id),
    }));
    return { rows };
  });

export const getTechnicianRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: Range }) => z.object({ range: RangeEnum.optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = rangeStart(data.range ?? "30d");
    const [{ data: techRoles }, ticketsRes, { data: metrics }, { data: ratings }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "technician"),
      since
        ? supabaseAdmin.from("tickets").select("*").gte("created_at", since.toISOString())
        : supabaseAdmin.from("tickets").select("*"),
      supabaseAdmin.from("ticket_metrics").select("*"),
      supabaseAdmin.from("ticket_ratings").select("*"),
      supabaseAdmin.from("profiles").select("id, full_name, email, avatar_url"),
    ]);
    const tickets = ticketsRes.data ?? [];
    const techIds = (techRoles ?? []).map((r: any) => r.user_id);
    const rows = techIds.map((id) => {
      const stats = aggregateTech(id, tickets, metrics ?? [], ratings ?? []);
      const profile = (profiles ?? []).find((p: any) => p.id === id);
      const score =
        stats.resolved * 10 +
        stats.clients * 2 +
        (stats.avgRating || 0) * 20 +
        stats.resolutionRate * 50 -
        (stats.avgFirstResponse ? stats.avgFirstResponse / 3600 : 0);
      return { ...stats, profile, score };
    }).sort((a, b) => b.score - a.score);
    return { rows };
  });

export const getAdminAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: tickets }, { data: metrics }, { data: ratings }, { data: profiles }, { data: messages }] = await Promise.all([
      supabaseAdmin.from("tickets").select("id, status, technician_id, client_id, created_at, device_name, ticket_number"),
      supabaseAdmin.from("ticket_metrics").select("*").gte("updated_at", since30),
      supabaseAdmin.from("ticket_ratings").select("*").gte("created_at", since30),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
      supabaseAdmin.from("messages").select("ticket_id, created_at"),
    ]);
    const profById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    // technicians overload
    const techActive = new Map<string, number>();
    (tickets ?? []).forEach((t: any) => {
      if (t.technician_id && !["resolved", "closed"].includes(t.status)) {
        techActive.set(t.technician_id, (techActive.get(t.technician_id) ?? 0) + 1);
      }
    });
    const overloaded = [...techActive.entries()]
      .filter(([, n]) => n > ALERT_THRESHOLDS.techMaxActive)
      .map(([id, n]) => ({ technicianId: id, profile: profById.get(id), active: n }));
    // low rated
    const ratingsByTech = new Map<string, number[]>();
    (ratings ?? []).forEach((r: any) => {
      if (!r.technician_id) return;
      const arr = ratingsByTech.get(r.technician_id) ?? [];
      arr.push(r.stars);
      ratingsByTech.set(r.technician_id, arr);
    });
    const lowRated = [...ratingsByTech.entries()]
      .filter(([, arr]) => arr.length >= ALERT_THRESHOLDS.lowRatingMinCount && avg(arr) < ALERT_THRESHOLDS.lowRatingAvg)
      .map(([id, arr]) => ({ technicianId: id, profile: profById.get(id), avg: Number(avg(arr).toFixed(2)), count: arr.length }));
    // slow response
    const respByTech = new Map<string, number[]>();
    (metrics ?? []).forEach((m: any) => {
      const t = (tickets ?? []).find((tt: any) => tt.id === m.ticket_id);
      if (!t?.technician_id || m.time_to_first_response_seconds == null) return;
      const arr = respByTech.get(t.technician_id) ?? [];
      arr.push(m.time_to_first_response_seconds);
      respByTech.set(t.technician_id, arr);
    });
    const slowResponders = [...respByTech.entries()]
      .filter(([, arr]) => avg(arr) > ALERT_THRESHOLDS.slowFirstResponseSeconds)
      .map(([id, arr]) => ({ technicianId: id, profile: profById.get(id), avgSeconds: Math.round(avg(arr)) }));
    // stalled tickets
    const lastMsgByTicket = new Map<string, string>();
    (messages ?? []).forEach((m: any) => {
      const prev = lastMsgByTicket.get(m.ticket_id);
      if (!prev || m.created_at > prev) lastMsgByTicket.set(m.ticket_id, m.created_at);
    });
    const now = Date.now();
    const stalled = (tickets ?? [])
      .filter((t: any) => !["resolved", "closed"].includes(t.status))
      .map((t: any) => {
        const last = lastMsgByTicket.get(t.id) ?? t.created_at;
        const hours = (now - new Date(last).getTime()) / 3600_000;
        return { ticket: t, lastActivityHours: Math.round(hours) };
      })
      .filter((x) => x.lastActivityHours > ALERT_THRESHOLDS.stalledTicketHours);
    const slaAtRisk = (tickets ?? [])
      .filter((t: any) => !["resolved", "closed"].includes(t.status))
      .map((t: any) => ({ ticket: t, openHours: Math.round((now - new Date(t.created_at).getTime()) / 3600_000) }))
      .filter((x) => x.openHours > ALERT_THRESHOLDS.slaAtRiskHours);
    return { overloaded, lowRated, slowResponders, stalled, slaAtRisk };
  });

export const getExecutiveDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: tickets }, { data: metrics }, { data: ratings }, { data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("tickets").select("id, status, category, technician_id, client_id, created_at, resolved_at"),
      supabaseAdmin.from("ticket_metrics").select("*"),
      supabaseAdmin.from("ticket_ratings").select("stars, created_at, technician_id"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const resolvedToday = (tickets ?? []).filter((t: any) => t.resolved_at && new Date(t.resolved_at) >= today).length;
    const active = (tickets ?? []).filter((t: any) => !["resolved", "closed"].includes(t.status)).length;
    const pending = (tickets ?? []).filter((t: any) => t.status === "new" || t.status === "assigned").length;
    const clients = new Set((roles ?? []).filter((r: any) => r.role === "client").map((r: any) => r.user_id)).size;
    const techs = new Set((roles ?? []).filter((r: any) => r.role === "technician").map((r: any) => r.user_id)).size;
    const avgRating = avg((ratings ?? []).map((r: any) => r.stars));
    const avgFirstResponse = avg((metrics ?? []).map((m: any) => m.time_to_first_response_seconds).filter((x: any) => x != null));
    const avgResolution = avg((metrics ?? []).map((m: any) => m.total_resolution_seconds).filter((x: any) => x != null));
    // 12 months series
    const byMonth: Record<string, { created: number; resolved: number }> = {};
    const byCat: Record<string, number> = {};
    (tickets ?? []).forEach((t: any) => {
      const k = new Date(t.created_at).toISOString().slice(0, 7);
      byMonth[k] ??= { created: 0, resolved: 0 };
      byMonth[k].created += 1;
      if (t.status === "resolved" || t.status === "closed") byMonth[k].resolved += 1;
      byCat[t.category] = (byCat[t.category] ?? 0) + 1;
    });
    const monthly = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
    const categories = Object.entries(byCat).map(([category, value]) => ({ category, value }));
    // ratings monthly
    const ratingMonthly: Record<string, number[]> = {};
    (ratings ?? []).forEach((r: any) => {
      const k = new Date(r.created_at).toISOString().slice(0, 7);
      (ratingMonthly[k] ??= []).push(r.stars);
    });
    const ratingsSeries = Object.entries(ratingMonthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, arr]) => ({ month, avg: Number(avg(arr).toFixed(2)) }));
    // productivity by tech
    const prodByTech = new Map<string, number>();
    (tickets ?? []).forEach((t: any) => {
      if (t.technician_id && (t.status === "resolved" || t.status === "closed"))
        prodByTech.set(t.technician_id, (prodByTech.get(t.technician_id) ?? 0) + 1);
    });
    const productivity = [...prodByTech.entries()].map(([id, n]) => ({
      name: (profiles ?? []).find((p: any) => p.id === id)?.full_name ?? "—",
      resolved: n,
    })).sort((a, b) => b.resolved - a.resolved).slice(0, 10);
    return {
      kpis: { active, resolvedToday, pending, clients, techs, avgRating: Number(avgRating.toFixed(2)), avgFirstResponse: Math.round(avgFirstResponse), avgResolution: Math.round(avgResolution) },
      monthly, categories, ratingsSeries, productivity,
    };
  });