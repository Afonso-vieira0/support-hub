# 🛠️ Support Hub

Plataforma de gestão de tickets de suporte ao cliente, desenvolvida com React, TypeScript e Supabase. Permite a criação e gestão de tickets, com diferentes níveis de acesso para super administradores e técnicos especializados.

---

## 🚀 Funcionalidades

- 🎫 **Gestão de Tickets** — criação, atribuição e acompanhamento de tickets de suporte
- 👑 **Super Admin** — acesso total ao sistema, gestão de utilizadores e configurações globais
- 🔧 **Técnicos** — acesso aos tickets que lhes são atribuídos
- 👤 **Sistema de Utilizadores** — diferentes níveis de permissão e acesso
- 📋 **Painel de Administração** — visão geral de todos os tickets e estado do suporte

---

## 🧰 Stack

| Tecnologia | Utilização |
|------------|------------|
| [React](https://react.dev/) | Interface do utilizador |
| [TypeScript](https://www.typescriptlang.org/) | Linguagem principal |
| [Vite](https://vitejs.dev/) | Bundler e servidor de desenvolvimento |
| [Supabase](https://supabase.com/) | Base de dados, autenticação e backend |
| [Tailwind CSS](https://tailwindcss.com/) | Estilização |
| [TanStack Router](https://tanstack.com/router) | Routing |

---

## ⚙️ Como correr localmente

### Pré-requisitos

- Node.js 18+
- npm ou bun

### Instalação

```bash
# Clona o repositório
git clone https://github.com/Afonso-vieira0/support-hub.git

# Entra na pasta
cd support-hub

# Instala as dependências
npm install

# Cria o ficheiro de variáveis de ambiente
cp .env.example .env
```

### Variáveis de ambiente

Preenche o ficheiro `.env` com as tuas chaves do Supabase:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

### Correr o projeto

```bash
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) no browser.

---

## 📦 Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Corre em modo desenvolvimento |
| `npm run build` | Gera build de produção |
| `npm run preview` | Pré-visualiza o build |

---

## 📁 Estrutura do Projeto

```
support-hub/
├── src/              # Frontend — componentes, páginas e lógica de UI
├── supabase/         # Backend — base de dados, funções e autenticação
├── public/           # Ficheiros estáticos
├── .env.example      # Template de variáveis de ambiente
├── vite.config.ts    # Configuração do Vite
└── README.md         # Documentação do projeto
```

---

## 👥 Equipa

| Nome | Área |
|------|------|
| Mauro  | 🔧 Backend |
| Afonso | 🔧 Backend |
| Marco | 🎨 Frontend |
| Gabriel | 🎨 Frontend |
| Daniel | 📋 Organização |
| Erica | 📋 Organização |

---

## 📄 Licença

Este projeto foi desenvolvido para fins académicos.
