## Plano — Inventário de peças + Excel automático

### Base de dados (migração)
- `inventory_parts`: `name`, `sku` (único), `category` (RAM, SSD, fonte, ecrã, bateria, cabo, outros), `unit` (un, m, kit), `quantity` (int), `min_quantity` (int), `unit_cost` (numeric), `location` (texto curto), `notes`.
- `inventory_movements`: `part_id`, `ticket_id` (nullable), `actor_id`, `delta` (int — positivo = entrada, negativo = consumo), `reason` (`purchase`, `adjustment`, `ticket_use`, `return`), `created_at`.
- `ticket_parts_used`: `ticket_id`, `part_id`, `quantity`, `created_at` — registo limpo do que cada ticket consumiu (vinculado a `inventory_movements`).
- Trigger `apply_ticket_part_use`: ao inserir em `ticket_parts_used` cria movimento negativo e decrementa `inventory_parts.quantity`; se ficar `< min_quantity` cria `notifications` para todos os admins ("Stock baixo: <peça>").
- Trigger `apply_inventory_movement` para movimentos manuais (entradas/ajustes) atualizar `quantity` de forma consistente.
- RLS:
  - `inventory_parts`: leitura por admin + técnico; escrita só admin.
  - `inventory_movements`: leitura admin + técnico (próprios); insert admin (qualquer) e técnico (só `reason='ticket_use'`).
  - `ticket_parts_used`: insert pelo técnico atribuído ao ticket ou admin; leitura por quem já vê o ticket.
- GRANTs standard a `authenticated` e `service_role`.

### Server functions (`src/lib/inventory.functions.ts`)
- `listParts({ search?, lowStockOnly? })` — admin/técnico.
- `upsertPart(input)` / `deletePart({ id })` — admin.
- `adjustStock({ partId, delta, reason, notes? })` — admin.
- `usePartsOnTicket({ ticketId, items: [{partId, quantity}] })` — admin ou técnico atribuído; valida stock > 0 e cria registos.
- `getTicketParts({ ticketId })`.
- `getInventoryStats()` — totais, valor de stock (Σ qty×unit_cost), nº abaixo do mínimo, top peças consumidas (30d).
- `exportInventoryXlsx()` — gera ficheiro `.xlsx` com 3 folhas (Peças, Movimentos, Consumos por ticket) usando `exceljs`; devolve base64 para download.

### Frontend
- **`admin.inventory.index.tsx`** (admin + técnico, escrita só admin):
  - Tabela com pesquisa, filtro por categoria e toggle "Apenas stock baixo".
  - Badges de stock (verde / amarelo ≤ 1.5× mínimo / vermelho ≤ mínimo).
  - Botões admin: "Nova peça", "Ajustar stock" (entrada/saída com motivo), "Exportar Excel".
- **`admin.inventory.$id.tsx`**: detalhe da peça com histórico de movimentos e tickets onde foi usada.
- **`tickets.$id.tsx`** (área do técnico):
  - Novo bloco "Peças utilizadas" visível ao técnico atribuído e admin.
  - Adicionar peça: combobox de peças + quantidade; lista das já adicionadas; remove (reverte movimento) antes de fechar o ticket.
  - Ao marcar resolvido, modal recorda confirmar peças usadas.
- **Sidebar**: novo item "Inventário" (ícone `Package`) para admin + técnico; "Exportar Excel" como ação dentro da página.
- **Dashboard executivo / Centro de Atividades**: cartões "Valor de stock", "Peças abaixo do mínimo", "Top 5 peças consumidas (30d)".

### Excel "automático"
- Não há integração nativa com ficheiros .xlsx no disco do utilizador — Excel só atualiza se um ficheiro for aberto. A solução é gerar sempre um `.xlsx` atualizado a partir dos dados:
  - **Botão "Exportar Excel"** no Inventário e na página da peça: chama `exportInventoryXlsx` e descarrega `inventario-AAAA-MM-DD-HHMM.xlsx`.
  - **Endpoint público estável** `/api/public/inventory.xlsx?token=…`: protegido por token guardado em `inventory_export_tokens` (admin gera/revoga); permite ligar no Excel via *Dados → Obter dados da Web* e atualizar com um clique (recomendado em vez de ficheiro local).
  - Folhas geradas: **Peças** (sku, nome, categoria, qty, min, unit_cost, valor_total, localização), **Movimentos** (data, peça, delta, motivo, técnico, ticket), **Consumos** (ticket, dispositivo, peça, qty, técnico, data).
- Dependência nova: `exceljs` (`bun add exceljs`).

### Detalhes técnicos
- Validação Zod em todas as functions (qty ≥ 1, sku regex, etc.).
- `usePartsOnTicket` usa `select … for update` lógico via RPC para evitar stock negativo em concorrência.
- Notificação de stock baixo é deduplicada (1 por peça enquanto não voltar acima do mínimo) com flag `low_stock_notified_at` em `inventory_parts`.
- Apagar peça com movimentos: soft-delete (`archived_at`) em vez de delete físico.

### Fora do âmbito
- Sincronização bidirecional com Google Sheets/OneDrive (requer conector). Pode ser acrescentada depois.
- Códigos de barras / leitor.
- Compras/encomendas a fornecedores.
