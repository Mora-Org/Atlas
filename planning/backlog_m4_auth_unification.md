# 🏗️ Milestone 4 — Auth Unification (Backlog)

> **Status:** 🧊 Congelado (Para o futuro, após a migração M3 estar 100% estável)
> **Objetivo:** Unificar a autenticação do sistema utilizando o Supabase Auth, permitindo descartar o sistema de JWT customizado (HS256) do backend.

## 🎯 Por Que Fazer Isso No Futuro?

- Permite login via provedores OAuth (Google, GitHub, etc).
- Permite Magic Links nativos do Supabase.
- Delega a responsabilidade de gerenciar senhas e e-mails de recuperação para uma infraestrutura testada.
- As RLS policies no Postgres podem começar a usar `auth.uid()` nativamente, facilitando acesso direto do frontend via cliente Supabase (caso seja desejado no futuro).

## 🧭 O Que Muda na Prática

1. **Adicionar coluna `supabase_uid`**: A tabela `users` precisará de uma coluna `supabase_uid UUID UNIQUE`.
2. **Refatoração do `auth.py`**: O backend precisará de um validador que checa JWTs assinados pelo Supabase (RS256, usando o endpoint público de JWKS).
3. **Login Delegado**: O fluxo de login (`/api/auth/login`) delega as credenciais para a API do Supabase (ou o próprio frontend faz o login e apenas manda o token de sessão para a nossa API).
4. **Atualização RLS**: As policies precisarão checar `current_setting('app.tenant_id')` (para as rotas que batem na nossa API REST) e/ou `auth.uid()` (para o ecossistema Supabase).

## ⚠️ Riscos e Questões em Aberto (Por isso foi adiado)

- **Fluxo de Convites**: Como o Master ou Admin convida novos moderadores? A API do Supabase Auth tem caminhos específicos para "invite user by email" que não batem 100% com o nosso fluxo atual.
- **Hierarquia de Roles**: Hoje as roles (`master`, `admin`, `moderator`) estão em `users`. Como o frontend saberá a role sem consultar a nossa base? Provavelmente precisaremos usar "Custom Claims" no JWT do Supabase, o que exige triggers no banco (Postgres) para sincronizar.
- **Master Account**: Como criar o "seeding" do Master User de forma automatizada no CI/CD se o Auth agora vive em outro serviço?

*Nota: Esta refatoração de Auth **não deve ser acoplada** à migração de dados do Milestone 3, para isolar riscos.*
