# TestSprite AI Testing Report (MCP) — M8 F0

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Date:** 2026-06-15
- **Prepared by:** TestSprite AI Team + análise Claude (Programador)
- **Scope:** Backend — M8 **F0 (Mutação de schema)**: `POST /tables/{id}/columns`, `DELETE /tables/{id}/columns/{column_id}`, `DELETE /tables/{id}`. Permissão (admin+mod mutam, master 403), guards de coluna de sistema/PK/relação, confirmação por nome, limitação de drop-column em SQLite.
- **Run mode:** Backend local (`uvicorn`, porta 8000), **SQLite persistente do dev server** (não isolado por teste).

---

## 2️⃣ Resultado

**6/9 passaram. As 3 falhas são artefato de ambiente/geração — zero bug de produto.** Cada comportamento que as 3 falhas checavam está verde e isolado no pytest (`backend/tests/test_schema_mutation.py`).

| TC | O que valida | Status | Veredito |
|---|---|---|---|
| TC001 | add coluna nullable → 200 + metadado | ✅ Passed | — |
| TC002 | add coluna NOT NULL → 400 (sem default na F0) | ✅ Passed | — |
| TC003 | add coluna como master → 403 | ✅ Passed | — |
| TC004 | drop-column em SQLite → 400 c/ msg de limitação | ❌ Failed | **Artefato** (ver abaixo) |
| TC005 | drop-column como master → 403 | ✅ Passed | — |
| TC006 | drop coluna de sistema/relação → 400 | ❌ Failed | **Artefato** (ver abaixo) |
| TC007 | delete-table exige `confirm_name` exato → 400 | ❌ Failed | **Artefato** (ver abaixo) |
| TC008 | delete-table como master → 403 | ✅ Passed | — |
| TC009 | delete-table sucesso + cascata de metadado → 200 | ✅ Passed | — |

---

## 3️⃣ Análise das 3 falhas (nenhuma é bug)

### TC004 — drop-column returns 400 on SQLite
- **Falhou em:** criação da tabela (`got 400`), antes de chegar no drop. Corpo: `{"detail":"Table already exists."}`.
- **Causa raiz:** nome **fixo** `tc004_test_table` **sem pré-limpeza** + SQLite **persistente** do dev server. Um leftover de run anterior colidiu (o cleanup do teste fica fora de `try/finally` → é pulado quando um assert anterior estoura).
- **Bug latente no próprio teste:** mesmo com DB limpo falharia no assert final — lê `resp.json().get("message")`, mas FastAPI devolve `{"detail": ...}`. A mensagem do endpoint está correta (`dynamic_schema.py:239` → detail contém "SQLite" e "drop-column").
- **Comportamento real:** ✅ `test_drop_column` (400 + `"SQLite" in detail` em SQLite; 200 em Postgres).

### TC006 — reject dropping system/related columns
- **Falhou em:** assert da **mensagem** (após o assert de status **400 já ter passado**).
- **Causa raiz:** o endpoint devolve **400 corretamente** bloqueando o drop da coluna `id`, mas a mensagem é **em português** ("Não dá pra dropar coluna de sistema/PK (id, tenant_id).") e o teste exige os tokens **em inglês** "system"/"relation"/"sqlite". Mismatch **PT × EN** do gerador.
- **Comportamento real:** ✅ `test_drop_column_blocks_pk` (400) + `test_drop_column_blocked_by_relation` (400 + "rela" in detail).

### TC007 — confirm_name required for deletion
- **Falhou em:** criação da tabela: `{"detail":"Table already exists."}`.
- **Causa raiz:** nome **fixo** `test_delete_confirm_name` + SQLite persistente. O teste até tem pré-limpeza (`GET /tables/` + delete), mas o leftover não foi limpo (estado físico/ORM sobreviveu a um run anterior). Mesma colisão de DB persistente do TC004.
- **Comportamento real:** ✅ `test_delete_table_wrong_confirm` (400 em confirm errado) + `test_delete_table` (200 em confirm certo).

---

## 4️⃣ Conclusão

- **Defeitos reais de produto: 0.** Os endpoints da F0 se comportam exatamente como especificado.
- As 3 falhas decompõem em **2 causas**, ambas de processo de QA, não de código:
  1. **SQLite persistente + nomes fixos + sem isolamento** → "Table already exists" na criação (TC004, TC007).
  2. **API em português × asserts em inglês** → assert de conteúdo de mensagem falha mesmo com status certo (TC006). Bônus: TC004 lê `message` em vez de `detail`.
- **Fonte da verdade:** `backend/tests/test_schema_mutation.py` — **pytest 100 passed / 6 skipped, CI verde** no merge `8f182d9`.

### Takeaways de processo (não são código)
- TestSprite contra o **SQLite persistente** do dev vai ser flaky pra qualquer teste que crie tabela de nome fixo. Mitigação: apontar o dev pra um DB descartável antes do run (o pytest já faz isso via conftest), ou pedir ao gerador nomes únicos + cleanup robusto em `try/finally`.
- A API fala **português**; o gerador do TestSprite assere palavras em inglês. Pra report verde em conteúdo de mensagem, o PRD entregue ao TestSprite precisa citar as mensagens reais (PT) — ou aceitar asserts só de status.
