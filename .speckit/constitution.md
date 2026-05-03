# Project Spec (Spec Kit) — Dynamic CMS Template

Este documento serve como a "Constituição" inegociável do projeto. Ele consolida as regras de negócio, arquitetura e as lições aprendidas (bugs/armadilhas) para garantir que agentes (Gemini, Claude, TestSprite) mantenham o alinhamento total durante o desenvolvimento, especialmente no Milestone 2 (Relacionamentos e CRUD completo).

---

## 1. Stack e Papéis das IAs
- **Gemini (Antigravity)** → Planejador: escreve planos nas fases "Specify" e "Plan" em `planning/` e `.speckit/`.
- **Claude** → Programador: executa os planos e escreve o código garantindo aderência a este Spec.
- **TestSprite** → QA: roda testes de integração e valida as entregas antes da aprovação final.

---

## 2. Multi-Tenancy (Isolamento de Inquilino)
**Regra Inegociável:** Toda e qualquer query ao banco de dados físico deve incluir o prefixo de tenant, exceto para as tabelas de sistema globais.
- O prefixo é derivado do ID do Admin: `t{admin_id}_`
- **Exemplo:** Admin ID 1 cria a tabela `products` → no banco físico ela deve se chamar `t1_products`.
- Moderadores herdam o prefixo do seu Admin associado e **SÓ PODEM** acessar tabelas dentro de seus Database Groups permitidos.
- **Segurança:** Um usuário JAMAIS deve conseguir manipular uma tabela de outro tenant. `PUT`/`DELETE` em registros de terceiros devem retornar `403` ou `404`.

---

## 3. Hierarquia de Roles (3 Camadas)
1. **Master (`master`)**
   - Conta semente: `puczaras`, role: `master`
   - O que PODE: Criar/deletar admins, listar todos os usuários não-master.
   - O que NÃO PODE: **Master NÃO PODE criar tabelas dinâmicas, acessar rotas de dados ou importar dados.** (Retornar `403`).
2. **Admin (`admin`)**
   - O que PODE: Criar tabelas dinâmicas (no seu próprio namespace `t{id}_`), criar moderadores, gerenciar Database Groups (grupos de tabelas), importar/exportar dados (SQL/CSV/XLSX).
3. **Moderator (`moderator`)**
   - O que PODE: CRUD de dados nas tabelas acessíveis (concedidas via Database Groups).
   - O que NÃO PODE: Acessar tabelas fora dos grupos permitidos (`403`/`404`), alterar o schema do banco.

---

## 4. Tabelas de Sistema x Tabelas Dinâmicas
**Tabelas de Sistema (Gerais, sem prefixo):**
`users`, `database_groups`, `moderator_permissions`, `_tables`, `_columns`, `_relations`, `qr_login_sessions`

> **M5 (Atlas Redesign):** a tabela `users` ganhou dois campos opcionais de identidade editorial (admins only):
> - `workspace_name` VARCHAR — nome display do workspace, ex: "Centro Budista do Brasil". Fallback: `username`.
> - `workspace_slug` VARCHAR UNIQUE — slug URL-safe, ex: "centrobudista". Regex `^[a-z0-9-]+$`, 3–32 chars. Fallback: `slugify(username)`.
> Esses campos **não alteram** o prefixo físico de tenant `t{admin_id}_` (Constituição §2 permanece intacta).
> Endpoint de atualização: `PATCH /api/admins/me/workspace`. Leitura: `GET /api/auth/me` (com fallback automático).

**Palavras Reservadas:**
Nomes de tabelas como `admins`, `moderators`, `users`, `login`, `auth`, `relations` são essenciais para o sistema.
**Regra:** Ao criar uma nova tabela via `POST /tables/`, nomes que conflitem com rotas fixas da API devem ser explicitamente **BLOQUEADOS** (Retornar `400`).

---

## 5. Prevenção de Bugs Conhecidos (Armadilhas)

### Backend (FastAPI / SQLAlchemy)
- **Importação Categórica de Tipos:** Sempre ao usar `cast(col, String)` no SQLAlchemy, garanta o import: `from sqlalchemy import String`. A ausência gerará `NameError` silencioso até a rota ser chamada (Ex: busca global / `get_public_records`).
- **Rotas Dinâmicas / Sombreamento:** O CRUD dinâmico (`/api/{table_name}`) ocorre na raiz da API. Rotas literais (ex. `/api/admins`) têm precedência, logo tabelas com nomes de rotas não seriam acessíveis. A trava de palavras reservadas resolve isso.
- **Isolamento no CRUD:** As rotas `PUT /api/{table_name}/{record_id}` e `DELETE /api/{table_name}/{record_id}` (em desenvolvimento no Milestone 2) DEVEM imperativamente validar o dono da tabela para evitar modificações cross-tenant.

### Frontend (Next.js App Router)
- **Use Client:** Qualquer componente que importe `useState`, `useEffect`, ou hooks de contexto customizado como `useAuth` DEVE ter a diretiva `'use client'` estritamente na primeira linha do arquivo. (Exemplo histórico: `login/page.tsx`).

---

## 6. Fluxo de Importação SQL Restrito
Admins podem importar estruturas de banco prontas.
- **Apenas:** `CREATE TABLE` e `INSERT INTO`
- **Bloqueado:** `DROP`, `ALTER`, `DELETE`, `TRUNCATE`, ou comandos de nível superior como `DROP DATABASE` (Retornar status `blocked` na pré-validação).
- O backend mapeia isso para `_tables` e `_columns` atomicamente.
