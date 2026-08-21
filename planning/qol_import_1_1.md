# QoL de import — `1.1.0`

**Decisão do Diretor (20/08/2026):** a QoL sai antes do fim do M10 como `1.1`; M10 passa a `1.2`.
Origem: teste de usuário da 1.0 (import da base `paidosett`) — juntar tabelas exigia SQL na mão
e apagar 17 tabelas exigia 17 viagens à zona de perigo. **Objetivo declarado: ser FÁCIL.**

Premissas auditadas contra o código por orquestração multi-agente (6 leitores + síntese, 20/08).
O que a auditoria derrubou está incorporado abaixo.

## F1 — Relações para tabelas existentes (frontend-only)

- **Onde:** seção "Relações" na página de edit (`admin/tables/[id]/edit`), entre "Adicionar coluna" e o errorBox.
- **Backend já existe e é 100% lógico** (`POST /api/relations`, main.py:1142 — linha em `_relations`, zero DDL): funciona pra tabela importada sem FK física, e o Esquema já desenha a aresta tracejada "declarada" de graça (schemaGraph.ts:128-144).
- **Payload:** `{name, from_table_id, to_table_id, relation_type, from_column_name, to_column_name}` — colunas SEMPRE preenchidas (o GET per-table descarta NULL em silêncio); POST **sem** barra final, GET agregado **com** barra.
- **A UI é a única validação** (auditoria: o POST aceita coluna inexistente, tipo incompatível e auto-relação): selects sobre colunas reais, enum fixo de tipo, from==to bloqueado no front.
- **Gate por `role === 'admin'`** — NÃO usar o `canMutate` da página: moderator toma 403 do `get_current_admin` (mismatch achado na auditoria). Moderator/master veem a lista read-only.
- **Dados por fetch próprio** do agregado `GET /api/relations/` filtrado no cliente pelos dois lados (a página não tem ids de relação hoje). Lista mostra entrada E saída.
- **Apagar relação:** botão armado em dois cliques (nada de `window.confirm` — trava os gates Playwright, política do Modal.tsx:13).

## F2 — Apagar todas as tabelas (frontend-only)

- **Onde:** seção "Zona de perigo" no fim da lista (`admin/tables`), visível só com tabelas e `role === 'admin'` (moderator até PODE deletar via grupo no backend, mas o botão-bomba fica só com o dono; master é 403 no backend).
- **Mecânica:** type-to-confirm (digitar o slug do workspace, padrão da casa) → loop **sequencial** de `DELETE /tables/{id}?confirm_name={nome}` com progresso na tela e erros coletados → refetch. Auditoria confirmou: rate limit não pega JWT, DROP é idempotente, cascade completo (mídia → DDL → `_columns`/relações dos 2 lados → audit). Paralelo NÃO foi auditado — fica sequencial mesmo ("mesmo que demorasse", Diretor).

## F3 — Bugfix carona (mesma área): o form de FK do create é decorativo

Auditoria (B16): o create manda `from_table_name`/`to_table_name` sem `name` → 422 **engolido** por
`.catch(() => {})` (create/page.tsx:96-111) — nenhuma relação nasce desde sempre. Fix: montar o payload
correto com os ids (o create tem os ids em mãos). FK **física** continua não nascendo (comportamento
atual do DDL; registrado, fora de escopo).

## Verificação

tsc + catraca; e2e Playwright no app real (criar relação → aresta tracejada no Esquema → apagar relação;
apagar todas → estado vazio; create com FK → relação existe), com A/B do B16 (antes: zero relação criada).
Estado do dev restaurado no fim (re-import do paidosett + relações de exemplo).
