import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    let ticketId: string | undefined;
    let type: string | undefined;

    if (body.record) {
      const newRecord = body.record;
      const oldRecord = body.old_record;
      const wasJustAssigned =
        newRecord.technician_id &&
        newRecord.technician_id !== oldRecord?.technician_id;

      if (!wasJustAssigned) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      ticketId = newRecord.id;
      type = "assigned";
    } else {
      ticketId = body.ticketId;
      type = body.type;
    }

    if (!ticketId || !type) {
      throw new Error("ticketId e type são obrigatórios.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, ticket_number, device_name, category, status, client_id, technician_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error("Ticket não encontrado.");
    }

    let recipientId: string | null = null;
    let subject = "";
    let html = "";

    if (type === "assigned") {
      recipientId = ticket.technician_id;
      subject = `Novo ticket atribuído: #${ticket.ticket_number}`;
      html = `<p>Foi-lhe atribuído um novo ticket de suporte:</p>
        <p><strong>#${ticket.ticket_number}</strong> — ${ticket.device_name} (${ticket.category})</p>
        <p>Acesse o SupportHub para responder.</p>`;
    } else if (type === "reminder") {
      recipientId = ticket.technician_id;
      subject = `Lembrete: ticket #${ticket.ticket_number} à espera de resposta`;
      html = `<p>O ticket <strong>#${ticket.ticket_number}</strong> (${ticket.device_name}) está à espera da sua resposta.</p>
        <p>Acesse o SupportHub para responder.</p>`;
    } else {
      throw new Error("Tipo de notificação inválido.");
    }

    if (!recipientId) {
      throw new Error("Este ticket não tem técnico atribuído.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", recipientId)
      .single();

    if (profileError || !profile?.email) {
      throw new Error("Não foi possível encontrar o email do destinatário.");
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SupportHub <onboarding@resend.dev>",
        to: [profile.email],
        subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      throw new Error(`Erro ao enviar email: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
