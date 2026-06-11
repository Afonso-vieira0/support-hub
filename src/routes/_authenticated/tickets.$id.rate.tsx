import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRatableTicket, submitTicketRating } from "@/lib/activity.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tickets/$id/rate")({
  component: RatePage,
});

function RatePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchRatable = useServerFn(getRatableTicket);
  const submit = useServerFn(submitTicketRating);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ratable", id],
    queryFn: () => fetchRatable({ data: { ticketId: id } }),
    retry: false,
  });

  const [solved, setSolved] = useState<boolean | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  if (data.alreadyRated) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Já avaliou este ticket</CardTitle>
          <CardDescription>Obrigado pelo seu contributo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate({ to: "/tickets" })}>Voltar</Button>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = async () => {
    if (solved === null || stars === 0) return toast.error("Responda às duas primeiras perguntas.");
    setSubmitting(true);
    try {
      await submit({ data: { ticketId: id, solved, stars, comment: comment.trim() || undefined } });
      toast.success("Avaliação registada. Obrigado!");
      navigate({ to: "/tickets" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao submeter");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Avaliar atendimento</CardTitle>
        <CardDescription>
          Ticket #{data.ticket.ticket_number} · {data.ticket.device_name}
          {data.technicianName && ` · Técnico: ${data.technicianName}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">O problema foi resolvido?</p>
          <div className="flex gap-2">
            <Button type="button" variant={solved === true ? "default" : "outline"} onClick={() => setSolved(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Sim
            </Button>
            <Button type="button" variant={solved === false ? "default" : "outline"} onClick={() => setSolved(false)}>
              <XCircle className="mr-2 h-4 w-4" /> Não
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Como avalia o atendimento do técnico?</p>
          <StarRating value={stars} onChange={setStars} size={32} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Comentário (opcional)</p>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Conte-nos a sua experiência…" rows={4} />
        </div>
        <Button onClick={onSubmit} disabled={submitting} className="w-full">
          {submitting ? "A submeter…" : "Enviar avaliação"}
        </Button>
      </CardContent>
    </Card>
  );
}