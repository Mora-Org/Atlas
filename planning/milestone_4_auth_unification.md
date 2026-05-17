# 🏗️ Milestone 4 — Auth Unification (Supabase)

> **Status:** 📋 Proposta
> **Predecessora obrigatória:** Milestone 3 (RLS / Supabase-Native) fechada.
> **Alvo de entrega:** 1-2 semanas.

Este plano resolve as 3 questões em aberto do backlog de M4 e define a arquitetura técnica para migrar a autenticação JWT do backend (HS256) para o Supabase Auth.

---

## 🎯 Objetivo e Decisões de Arquitetura

O objetivo não é abandonar nosso backend como controlador de negócios, mas sim **delegar a parte criptográfica e de identidade** para o Supabase Auth, preparando o terreno para logins OAuth e unificação da segurança com o RLS.

Para as 3 questões em aberto que estavam bloqueando o planejamento:

### 1. Fluxo de Convites (Master/Admin convida moderador)
- **Problema original:** O "invite by email" do Supabase adiciona SMTP e muda a UX.
- **Decisão:** Manteremos o fluxo de UX **exatamente igual**.
- **Como:** O Admin continuará fazendo o request para `POST /api/moderators` enviando as credenciais (username e senha do moderador). O nosso backend usará a **Supabase Admin API** (via `@supabase/supabase-js` em Python, ou requisições HTTP REST diretas usando `SUPABASE_SERVICE_ROLE_KEY`) para chamar `admin.createUser({ email, password, email_confirm: true })`.
- **Username vs Email:** Como o Supabase Auth requer um identificador único, podemos padronizar a conversão de usernames para emails internos fakes (ex: `puczaras@admin.atlas`) ou aceitar emails reais. Para o Frontend, não há mudança no form.

### 2. Hierarquia de Roles e Identidade (master/admin/moderator)
- **Problema original:** Frontend e RLS (Postgres) precisam saber a `role` e o `tenant_id` sem bater na nossa API toda hora.
- **Decisão:** Injeção direta de `app_metadata` no Supabase via backend (sem triggers complexos no banco).
- **Como:** Quando o backend chama a Admin API do Supabase para criar um usuário, ele enviará o claim no metadata: `app_metadata: { 'role': 'moderator', 'tenant_id': 5 }`.
- **Benefício:** O Supabase embute essas propriedades diretamente no JWT.
  - O **Frontend** lê o claim via `session.user.app_metadata.role` (ou seja, via SDK do Supabase) para esconder/mostrar UI.
  - O **Postgres (RLS)** lê isso na connection local sem custom triggers: `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`.
- **Consistência:** A tabela `public.users` do nosso banco ainda existirá. O backend continuará fazendo um INSERT nela logo após ter sucesso no `admin.createUser`. 

### 3. Seeding da Master Account
- **Problema original:** Hoje o master é "seedado" na inicialização via Python. O Supabase Auth não preenche isso sozinho.
- **Decisão:** O backend fará o "Provisionamento Dinâmico" no `startup_event`.
- **Como:** No startup do FastAPI, a função de criar a master account consulta `public.users`. Se o master não existir, o próprio backend liga para a Supabase Admin API usando a Service Key, cria o user lá definindo a password rígida ("bodes123") e role `master`, pega o UUID e salva em `public.users`.
- **Benefício:** Continua "plug-and-play" local e em prod sem precisar de pipeline de CI mandando script.

---

## 🧭 O Que Muda na Prática (Plano de Ação)

### Fase 1 — Adequação do Banco (Alembic)
1. **Nova Coluna `supabase_uid`:** Criar uma migração via Alembic adicionando `supabase_uid` do tipo UUID (UNIQUE, Nullable a princípio) na tabela `users`.
2. Opcional: remover `hashed_password` na tabela de users se garantirmos que todo login legado morrerá (ou manter caso sirva de fallback temporário).

### Fase 2 — Refatoração do `auth.py`
1. **Validação do Token:** Modificar `get_current_user` para que em vez de decodificar o token com nossa `SECRET_KEY`, ele consuma a assinatura do Supabase. Como? Ou fazendo fetch das JWKS públicas do seu projeto Supabase, ou batendo num endpoint introspectivo se for mais fácil no começo.
2. **Supabase Admin Client:** Criar o client autenticado com `SUPABASE_SERVICE_ROLE_KEY` no backend. Ele será usado em `create_master_account`, `create_admin` e `create_moderator`.

### Fase 3 — Refatoração do Fluxo de Criação (`main.py`)
1. Nas rotas que criam usuários (`POST /api/admins`, `POST /api/moderators`), implementar a orquestração:
   - Tenta criar user no Supabase Auth via Admin API (injetando `app_metadata` correspondente).
   - Retorna o novo `supabase_uid`.
   - Salva em `public.users`.

### Fase 4 — Refatoração do Frontend (Login Delegado)
1. O Frontend troca o envio de username/password pro nosso `/api/auth/login` por uma chamada nativa do `@supabase/supabase-js`: `supabase.auth.signInWithPassword()`.
2. O JWT retornado é guardado na sessão e passado nos headers pro backend como `Authorization: Bearer <supabase_jwt>`.
3. Os guardiões de UI (React Context) passam a ler as infos do Supabase Session (`user.app_metadata.role`), dispensando decodificação local do JWT legado.

### Fase 5 (Futura/Opcional) — RLS Nativo
1. Com o JWT passando de ponta a ponta e o `tenant_id` cravado no `app_metadata`, poderemos limpar as RLS policies para confiarem diretamente em `auth.uid()` ou `auth.jwt()`, aposentando parte da lógica manual de middleware (`current_setting`).

---

## ⚠️ Checklist de Verificação
- [ ] Backend sobe e cria o master em ambas as tabelas (auth e public) se ele não existir.
- [ ] Login pelo frontend com `@supabase/supabase-js` retorna sessão com os claims visíveis em `app_metadata`.
- [ ] Chamadas pro backend com JWT do Supabase não quebram (FastAPI consegue validar e extrair o claim).
- [ ] Tentativa de burlar RLS e acesso negado de UI por um moderador continuam firmes baseadas nos claims do Supabase.
