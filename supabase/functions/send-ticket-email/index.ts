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

    const recipients: { email: string; subject: string; html: string }[] = [];

    if (type === "assigned") {
      if (ticket.technician_id) {
        const { data: techProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", ticket.technician_id)
          .single();
        if (techProfile?.email) {
          recipients.push({
            email: techProfile.email,
            subject: `Novo ticket atribuído: #${ticket.ticket_number}`,
            html: `<p>Foi-lhe atribuído um novo ticket de suporte:</p>
              <p><strong>#${ticket.ticket_number}</strong> — ${ticket.device_name} (${ticket.category})</p>
              <p>Acesse o SupportHub para responder.</p>`,
          });
        }
      }

      if (ticket.client_id) {
        const { data: clientProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", ticket.client_id)
          .single();
        if (clientProfile?.email) {
          recipients.push({
            email: clientProfile.email,
            subject: `Um técnico foi atribuído ao seu ticket #${ticket.ticket_number}`,
            html: `<p>Tem um técnico à espera para ajudar com o seu ticket:</p>
              <p><strong>#${ticket.ticket_number}</strong> — ${ticket.device_name}</p>
              <p>Acesse o SupportHub para acompanhar.</p>`,
          });
        }
      }
    } else if (type === "reminder") {
      if (ticket.client_id) {
        const { data: clientProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", ticket.client_id)
          .single();
        if (clientProfile?.email) {
          recipients.push({
            email: clientProfile.email,
            subject: `O técnico está à espera da sua resposta - ticket #${ticket.ticket_number}`,
            html: `<p>O técnico está à espera da sua resposta no ticket:</p>
              <p><strong>#${ticket.ticket_number}</strong> — ${ticket.device_name}</p>
              <p>Acesse o SupportHub para responder.</p>`,
          });
        }
      }
    } else {
      throw new Error("Tipo de notificação inválido.");
    }

    if (recipients.length === 0) {
      throw new Error("Nenhum destinatário válido encontrado para este ticket.");
    }

    for (const r of recipients) {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "SupportHub <onboarding@resend.dev>",
          to: [r.email],
          subject: r.subject,
          html: r.html,
        }),
      });

      if (!resendResponse.ok) {
        const errText = await resendResponse.text();
        throw new Error(`Erro ao enviar email: ${errText}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
