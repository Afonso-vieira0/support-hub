import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

const SKU_RE = /^[A-Za-z0-9._-]{1,40}$/;

export type PartInput = {
  id?: string;
  sku: string;
  name: string;
  category: string;
  unit?: string;
  quantity?: number;
  min_quantity?: number;
  unit_cost?: number;
  location?: string | null;
  notes?: string | null;
};

export const listParts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; lowStockOnly?: boolean } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inventory_parts")
      .select("*")
      .is("archived_at", null)
      .order("name");
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = data.lowStockOnly
      ? (rows ?? []).filter((r: any) => r.quantity <= r.min_quantity)
      : (rows ?? []);
    return { parts: filtered };
  });

export const upsertPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PartInput) => {
    if (!input.sku || !SKU_RE.test(input.sku)) throw new Error("SKU inválido.");
    if (!input.name || input.name.length > 120) throw new Error("Nome inválido.");
    if (input.quantity != null && (input.quantity < 0 || input.quantity > 1_000_000)) throw new Error("Quantidade inválida.");
    if (input.min_quantity != null && (input.min_quantity < 0 || input.min_quantity > 1_000_000)) throw new Error("Mínimo inválido.");
    if (input.unit_cost != null && (input.unit_cost < 0 || input.unit_cost > 1_000_000)) throw new Error("Custo inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = {
      sku: data.sku,
      name: data.name,
      category: data.category,
      unit: data.unit ?? "un",
      quantity: data.quantity ?? 0,
      min_quantity: data.min_quantity ?? 0,
      unit_cost: data.unit_cost ?? 0,
      location: data.location ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("inventory_parts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("inventory_parts").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    // initial movement for opening stock
    if (payload.quantity > 0) {
      await context.supabase.from("inventory_movements").insert({
        part_id: row.id, actor_id: context.userId, delta: payload.quantity, reason: "initial", notes: "Stock inicial",
      });
    }
    return { id: row.id };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { partId: string; delta: number; reason: "purchase" | "adjustment" | "return"; notes?: string }) => {
    if (!input.partId) throw new Error("Peça em falta.");
    if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error("Quantidade inválida.");
    if (Math.abs(input.delta) > 100000) throw new Error("Quantidade demasiado alta.");
    if (!["purchase", "adjustment", "return"].includes(input.reason)) throw new Error("Motivo inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: part, error: e0 } = await supabaseAdmin.from("inventory_parts").select("*").eq("id", data.partId).single();
    if (e0 || !part) throw new Error("Peça não encontrada.");
    const newQty = part.quantity + data.delta;
    if (newQty < 0) throw new Error("Stock não pode ficar negativo.");
    const { error: e1 } = await supabaseAdmin.from("inventory_parts").update({
      quantity: newQty,
      low_stock_notified_at: newQty > part.min_quantity ? null : part.low_stock_notified_at,
      updated_at: new Date().toISOString(),
    }).eq("id", data.partId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin.from("inventory_movements").insert({
      part_id: data.partId, actor_id: context.userId, delta: data.delta, reason: data.reason, notes: data.notes ?? null,
    });
    if (e2) throw new Error(e2.message);
    return { quantity: newQty };
  });

export const deletePart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("inventory_parts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const usePartsOnTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string; items: Array<{ partId: string; quantity: number }> }) => {
    if (!input.ticketId) throw new Error("Ticket em falta.");
    if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Sem peças.");
    for (const it of input.items) {
      if (!it.partId || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 1000) {
        throw new Error("Quantidade inválida.");
      }
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // RLS enforces admin or assigned technician
    const rows = data.items.map((it) => ({
      ticket_id: data.ticketId,
      part_id: it.partId,
      quantity: it.quantity,
      actor_id: context.userId,
    }));
    const { error } = await context.supabase.from("ticket_parts_used").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });

export const removeTicketPart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ticket_parts_used").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTicketParts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ticket_parts_used")
      .select("id, part_id, quantity, created_at, actor_id, inventory_parts(name, sku, unit, unit_cost)")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getPartDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: part, error } = await context.supabase.from("inventory_parts").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: movements } = await context.supabase
      .from("inventory_movements")
      .select("id, delta, reason, notes, created_at, ticket_id, actor_id")
      .eq("part_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);
    return { part, movements: movements ?? [] };
  });

export const getInventoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: parts } = await context.supabase
      .from("inventory_parts")
      .select("id, quantity, min_quantity, unit_cost")
      .is("archived_at", null);
    const totalValue = (parts ?? []).reduce((s: number, p: any) => s + Number(p.unit_cost) * p.quantity, 0);
    const lowStock = (parts ?? []).filter((p: any) => p.quantity <= p.min_quantity).length;
    const { data: top } = await context.supabase.rpc("inventory_top_consumed", { _days: 30, _limit: 5 });
    return { totalValue, lowStock, partsCount: parts?.length ?? 0, topConsumed: top ?? [] };
  });

export const exportInventoryXlsx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const ExcelJS = (await import("exceljs")).default;

    const { data: parts } = await context.supabase
      .from("inventory_parts").select("*").is("archived_at", null).order("name");
    const { data: movements } = await context.supabase
      .from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(2000);
    const { data: used } = await context.supabase
      .from("ticket_parts_used")
      .select("id, quantity, created_at, ticket_id, part_id, tickets(ticket_number, device_name, technician_id), inventory_parts(name, sku)")
      .order("created_at", { ascending: false }).limit(2000);

    const wb = new ExcelJS.Workbook();
    wb.creator = "SupportHub";
    wb.created = new Date();

    const s1 = wb.addWorksheet("Peças");
    s1.columns = [
      { header: "SKU", key: "sku", width: 16 },
      { header: "Nome", key: "name", width: 30 },
      { header: "Categoria", key: "category", width: 14 },
      { header: "Unidade", key: "unit", width: 10 },
      { header: "Stock", key: "quantity", width: 10 },
      { header: "Mínimo", key: "min_quantity", width: 10 },
      { header: "Custo unit.", key: "unit_cost", width: 12 },
      { header: "Valor total", key: "total", width: 14 },
      { header: "Localização", key: "location", width: 18 },
    ];
    s1.getRow(1).font = { bold: true };
    (parts ?? []).forEach((p: any) =>
      s1.addRow({ ...p, total: Number(p.unit_cost) * p.quantity }),
    );

    const s2 = wb.addWorksheet("Movimentos");
    s2.columns = [
      { header: "Data", key: "created_at", width: 20 },
      { header: "Peça", key: "part_id", width: 36 },
      { header: "Delta", key: "delta", width: 8 },
      { header: "Motivo", key: "reason", width: 14 },
      { header: "Ticket", key: "ticket_id", width: 36 },
      { header: "Notas", key: "notes", width: 30 },
    ];
    s2.getRow(1).font = { bold: true };
    (movements ?? []).forEach((m: any) => s2.addRow(m));

    const s3 = wb.addWorksheet("Consumos");
    s3.columns = [
      { header: "Data", key: "created_at", width: 20 },
      { header: "Ticket", key: "ticket_number", width: 12 },
      { header: "Dispositivo", key: "device_name", width: 24 },
      { header: "Peça", key: "part_name", width: 28 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "Qtd", key: "quantity", width: 8 },
    ];
    s3.getRow(1).font = { bold: true };
    (used ?? []).forEach((u: any) => s3.addRow({
      created_at: u.created_at,
      ticket_number: u.tickets?.ticket_number,
      device_name: u.tickets?.device_name,
      part_name: u.inventory_parts?.name,
      sku: u.inventory_parts?.sku,
      quantity: u.quantity,
    }));

    const buf = await wb.xlsx.writeBuffer();
    // base64 encode
    const u8 = new Uint8Array(buf as ArrayBuffer);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const base64 = btoa(bin);
    return { base64, filename: `inventario-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.xlsx` };
  });