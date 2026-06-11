
# Centro de Atividades, Desempenho de Técnicos e Avaliações

Adiciono três grandes blocos à plataforma: um **Centro de Atividades** em tempo real para admins, **dashboards de desempenho** por técnico (com comparação e ranking), e um **sistema de avaliação** preenchido pelo cliente quando o ticket é resolvido. Tudo em PT-PT, com tema claro/escuro já existente.

## 1. Base de dados (migração)

Tabelas novas:
- `activity_events` — feed unificado: `id`, `actor_id`, `ticket_id`, `type` (enum: ticket_created, ticket_assigned, ticket_reassigned, first_response, client_replied, technician_replied, status_changed, ticket_resolved, ticket_closed, rating_received, user_login), `from_value`, `to_value`, `metadata jsonb`, `created_at`.
- `ticket_metrics` — uma linha por ticket: `ticket_id` (PK), `first_tech_open_at`, `first_response_at`, `last_client_message_at`, `last_tech_message_at`, `resolved_at`, `closed_at`, `messages_count`, `time_to_first_response_seconds`, `total_resolution_seconds`, `client_wait_seconds`, `tech_wait_seconds`.
- `ticket_ratings` — `ticket_id` (PK), `client_id`, `technician_id`, `solved boolean`, `stars int 1..5`, `comment text`, `created_at`.
- `login_events` — `id`, `user_id`, `role_snapshot`, `created_at` (registo simples para o feed).

Alterações:
- Triggers para popular `ticket_metrics` e `activity_events` automaticamente em INSERT/UPDATE de `tickets` e INSERT de `messages`.
- Trigger em `ticket_ratings` que insere evento `rating_received`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE activity_events, ticket_ratings;` para realtime.
- GRANTs + RLS: admins leem tudo; técnicos veem os seus próprios eventos/métricas; clientes só inserem o seu próprio rating do seu ticket resolvido e leem o feed limitado aos seus tickets (não usado na UI de cliente, mas seguro).

Política de acesso a tickets resolvidos mantém-se (cliente perde acesso); o formulário de avaliação é a única exceção controlada via policy específica no `ticket_ratings`.

## 2. Server functions (`src/lib/activity.functions.ts`, `src/lib/performance.functions.ts`)

- `getActivityFeed({ limit, cursor, filters })` — feed paginado, com join de profiles/tickets.
- `getTicketFullView(ticketId)` — devolve ticket + histórico + métricas + eventos + rating.
- `getTechniciansOverview()` — lista todos os técnicos com KPIs agregados.
- `getTechnicianProfile(techId, range: '7d'|'30d'|'6m'|'1y'|'all')` — resumo + séries temporais.
- `compareTechnicians(ids[], range)` — métricas lado a lado.
- `getTechnicianRanking(range)` — ordenado por score composto.
- `getAdminAlerts()` — técnicos sobrecarregados, tickets parados, avaliações baixas, SLA em risco (regras configuráveis por constantes, ex.: >10 tickets ativos, sem resposta >24h, média <3 estrelas).
- `getExecutiveDashboard()` — KPIs globais + séries para gráficos do dashboard executivo.
- `submitTicketRating({ ticketId, solved, stars, comment })` — cliente, valida que é dono e ticket está resolved/closed.

Todas com `requireSupabaseAuth` e verificação de role quando aplicável.

## 3. Frontend — rotas novas (todas sob `_authenticated/`)

- `admin.activity.tsx` — Centro de Atividades: feed realtime (subscrição a `activity_events`), filtros por tipo/técnico/cliente/intervalo, badges coloridos por tipo, agrupamento por dia.
- `admin.tickets.$id.tsx` — visão completa do ticket para admin (timeline, métricas, mensagens em modo leitura).
- `admin.technicians.index.tsx` — tabela com KPIs de todos os técnicos + alertas.
- `admin.technicians.$id.tsx` — perfil individual: resumo, seletor de período (7d/30d/6m/1y/all), gráficos (tickets resolvidos por período, tempo médio resposta, tempo médio resolução, avaliação média, evolução produtividade vs período anterior).
- `admin.compare.tsx` — multi-select de técnicos + tabela e gráficos comparativos (barras agrupadas + radar).
- `admin.ranking.tsx` — tabela ordenada com posição, medalhas top 3.
- Substituir `dashboard.tsx` (quando role=admin) por **Dashboard Executivo**: cards KPI, secção "Necessita de Atenção", grelha de gráficos (tickets/mês, categoria, produtividade técnicos, evolução avaliações, evolução tempos).

Sidebar (`app-shell.tsx`) ganha grupo "Administração" com: Centro de Atividades, Técnicos, Comparar, Ranking.

## 4. Avaliação do cliente

- Em `tickets.$id.tsx`, quando o ticket está `resolved`/`closed` e o cliente é o dono e ainda não avaliou, mostrar **modal/banner de avaliação** com as 3 perguntas (resolvido sim/não, estrelas 1-5, comentário). Após submeter, dispara evento `rating_received`.
- Como o cliente perde acesso a tickets resolvidos, adicionamos exceção: rota dedicada `tickets.$id.rate.tsx` acessível ao cliente apenas para submeter o rating uma vez (RLS permite SELECT mínimo do ticket próprio para esse efeito, ou passamos via server function que devolve apenas dados necessários — opto pela server function para não relaxar RLS).
- Notificação ao cliente quando o ticket é resolvido inclui link "Avaliar atendimento".

## 5. Cálculo de métricas

Triggers populam `ticket_metrics` em tempo real:
- `first_response_at` = primeiro `messages.created_at` onde `sender_id = technician_id`.
- `client_wait_seconds` += diferença entre mensagem do cliente e próxima resposta do técnico.
- `tech_wait_seconds` += diferença entre mensagem do técnico e próxima resposta do cliente.
- `total_resolution_seconds` = `resolved_at - created_at`.

Agregações para dashboards são feitas em server functions com SQL (sem materialized views nesta v1, mas com índices em `tickets(technician_id, status, created_at)` e `ticket_metrics(technician_id)`).

## 6. Alertas

Constantes em `src/lib/alerts.ts`:
- Técnico sobrecarregado: > 10 tickets ativos.
- Resposta lenta: tempo médio de primeira resposta > 4h nos últimos 30 dias.
- Avaliação baixa: média < 3 estrelas (últimos 30 dias, mínimo 3 ratings).
- Ticket parado: sem mensagem há > 24h em estado ativo.
- SLA em risco: aberto há > 48h sem resolução.

Mostrados em cards no dashboard executivo e no topo do Centro de Atividades.

## 7. Realtime

Subscrição Supabase em:
- `activity_events` (Centro de Atividades).
- `ticket_metrics` (cards do dashboard executivo — invalidação de query).
- `ticket_ratings` (atualização imediata de avaliações).

## 8. UI / Bibliotecas

- Reaproveitar `recharts` já instalado para todos os gráficos (line, bar, radar para comparação).
- Cards e tabelas com componentes shadcn existentes.
- Estrelas: componente simples com lucide `Star`.

## 9. Não incluído nesta entrega

- Edição de regras de SLA pela UI (são constantes).
- Exportação CSV/PDF de relatórios.
- Notificações por email (apenas in-app).
- Login OAuth Google permanece como já configurado.

Confirmar e digo "ok" para implementar — vai gerar 1 migração grande, ~6 rotas novas, 2 ficheiros de server functions e ajustes no shell e no dashboard.
