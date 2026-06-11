## Plano — Apagar tickets (lixo recuperável)

### Base de dados (migração)
- Adicionar à tabela `tickets`:
  - `deleted_at TIMESTAMPTZ NULL`
  - `deleted_by UUID NULL` (referência ao utilizador)
  - `delete_reason TEXT NULL`
- Índice parcial em `tickets(deleted_at)` para listagem rápida do lixo.
- Atualizar políticas RLS de `tickets`:
  - `SELECT` normal: clientes/técnicos só veem tickets onde `deleted_at IS NULL`.
  - Admins veem tudo (incluindo apagados).
  - `UPDATE` para soft-delete: permitido a **admins** e ao **técnico atribuído**.
  - Restaurar/apagar definitivo: apenas admins.
- Novo evento em `activity_events`: `ticket_deleted` e `ticket_restored` (via trigger em `on_ticket_update_events` quando `deleted_at` muda).
- Mensagens, anexos e métricas ficam intactos (recuperáveis ao restaurar).

### Server functions (`src/lib/tickets.functions.ts`)
- `softDeleteTickets({ ids, reason? })` — admin ou técnico atribuído; marca `deleted_at = now()`, `deleted_by = uid`.
- `restoreTickets({ ids })` — só admin; limpa `deleted_at`.
- `hardDeleteTickets({ ids })` — só admin; apaga definitivamente (cascade já existente em mensagens/anexos/métricas).
- `getTrashTickets()` — só admin; lista paginada de tickets com `deleted_at NOT NULL`.

### Frontend
- **`tickets.index.tsx`** (lista):
  - Coluna de checkboxes para seleção múltipla.
  - Barra de ações fixa no topo quando há seleção: "Apagar selecionados" com `AlertDialog` de confirmação e campo opcional de motivo.
  - Apenas mostra checkboxes a quem pode apagar (admin ou técnico nos seus tickets).
- **`tickets.$id.tsx`** (detalhe):
  - Botão "Apagar ticket" (ícone lixo) no header, com `AlertDialog`.
  - Após apagar → redireciona para `/tickets` + toast.
- **`admin.trash.tsx`** (nova rota, só admin):
  - Tabela com tickets apagados: número, dispositivo, quem apagou, quando, motivo.
  - Ações por linha: **Restaurar** | **Apagar definitivamente** (com dupla confirmação).
  - Seleção múltipla para restaurar/apagar em massa.
- **Sidebar (`app-shell.tsx`)**: adicionar "Lixo" no grupo Admin com ícone `Trash2`.

### UX e segurança
- Confirmações sempre via `AlertDialog` do shadcn (não `confirm()` nativo).
- Toasts de sucesso/erro com `sonner`.
- Técnico só pode soft-delete tickets onde `technician_id = auth.uid()`.
- Listas existentes (executive dashboard, ranking, atividade) filtram `deleted_at IS NULL` por defeito, exceto vista admin do lixo.

### Fora do âmbito
- Auto-purga programada do lixo (pode ser adicionada depois com pg_cron).
- Exportação dos tickets apagados.
