import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RelatorioTickets {
  geradoEm: string;
  totalTickets: number;
  semTecnicoAtribuido: number;
  porStatus: Record<string, number>;
  porCategoria: Record<string, number>;
  temposResolucao: { mediaHoras: number | null; ticketsComDados: number };
  primeiraResposta: { mediaMinutos: number | null; ticketsComDados: number };
  satisfacao: { mediaEstrelas: number | null; totalAvaliacoes: number; taxaResolvidosPct: number | null };
}

const MICROSERVICO_URL = "http://localhost:5000/relatorios/tickets";

async function fetchRelatorio(): Promise<RelatorioTickets> {
  const res = await fetch(MICROSERVICO_URL);
  if (!res.ok) throw new Error("Erro ao obter relatório do microsserviço");
  return res.json();
}

export function RelatorioMicrosservico() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-microsservico"],
    queryFn: fetchRelatorio,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Relatórios</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">A carregar dados do microsserviço...</p></CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Relatórios</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Não foi possível ligar ao microsserviço. Confirma que o container Docker está a correr em localhost:5000.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tempoMedio = data.temposResolucao.mediaHoras != null ? `${data.temposResolucao.mediaHoras.toFixed(1)}h` : "—";
  const satisfacao = data.satisfacao.mediaEstrelas != null ? `${data.satisfacao.mediaEstrelas.toFixed(1)} ★` : "—";

  return (
    <Card>
      <CardHeader><CardTitle>Relatórios</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniKpi label="Total de tickets" value={data.totalTickets} />
          <MiniKpi label="Sem técnico atribuído" value={data.semTecnicoAtribuido} />
          <MiniKpi label="Tempo médio resolução" value={tempoMedio} />
          <MiniKpi label="Satisfação média" value={satisfacao} />
        </div>
        <p className="text-xs text-muted-foreground">
          Gerado pelo microsserviço em {new Date(data.geradoEm).toLocaleString("pt-PT")}
        </p>
      </CardContent>
    </Card>
  );
}

function MiniKpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
