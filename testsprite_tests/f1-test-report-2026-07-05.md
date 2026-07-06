# TestSprite — QA da M8 F1 (Media Library backend) — 2026-07-05

## 1️⃣ Document Metadata
- **Projeto:** dynamic-sql-editor (Atlas)
- **Escopo:** M8 F1 — fundação de mídia + Media Library (branch `m8-f1-media-foundation`, PR #36)
- **Data:** 2026-07-05
- **Ambiente:** backend local (uvicorn :8000, SQLite persistente, test-auth, fallback filesystem de mídia)
- **Preparado por:** TestSprite AI + análise Claude

## 2️⃣ Requirement Validation Summary

### Requirement: Upload de mídia (proxy, limites, whitelist)
| Caso | Status | Análise |
|---|---|---|
| TC001 upload png → 200 (url, refcount 0, bytes servidos) | ✅ | Upload, registro em `_assets` e serving da URL pública funcionando. |
| TC002 SVG → 415 (e `application/x-msdownload` → 415) | ✅ | Whitelist de MIME sem SVG confirmada (stored-XSS fechado na v1). |
| TC003 >10MB → 413 | ✅ | Teto duplo (Content-Length + len real) segurando. |
| TC004 master → 403 em upload/list/gc | ✅ | Régua de permissão correta (biblioteca é do workspace, não do master). |

### Requirement: Biblioteca central (`_assets`)
| Caso | Status | Análise |
|---|---|---|
| TC005 GET /api/assets paginado, isolado por tenant | ✅ | Shape `{data,total,limit,offset}` correto. |
| TC008 DELETE referenciado → 409; livre → 200 | ✅ | Guard de refcount no delete explícito ok. |
| TC009 GC não coleta upload fresco (idade mínima 24h) | ✅ | `removed=0` pós-upload, asset preservado. |

### Requirement: Whitelist de `data_type` + trava de nome
| Caso | Status | Análise |
|---|---|---|
| TC006 tipo inválido → 422; nome `assets` → 400 | ✅ | Borda Pydantic + mini-trava de reservado ok. |
| TC012 add-column honra whitelist (attachment 200 / inválido 422) | ✅ | Cobre o endpoint da F0 também. |

### Requirement: Refcount nos hooks do CRUD/DDL
| Caso | Status | Análise |
|---|---|---|
| TC007 insert +1 / update swap / PUT parcial | ❌* | **Artefato do gerador** — ver análise abaixo. Comportamento real verificado ✅. |
| TC010 delete-table decrementa | ❌* | **Artefato do gerador** — mesmo padrão. Comportamento real verificado ✅. |
| TC011 URL externa em coluna mídia = no-op | ✅ | Sem refcount fantasma, sem erro. |

## 3️⃣ Análise dos 2 fails — artefatos do gerador, não bugs

Os dois testes que falharam foram **gerados com desvios do plano de teste**:

1. **Coluna criada com `data_type: "String"` em vez de `"image"`** (TC007 linha 32, TC010 linha 46). Coluna String não é mídia — o hook de refcount corretamente não se aplica. O plano pedia `image` explicitamente.
2. **TC007 além disso itera o dict de resposta** de `GET /api/assets` (`{data, total, ...}`) em vez de `.data` — o lookup devolve `None` sempre.

**Reprodução manual do cenário CORRETO no mesmo servidor** (curl, coluna `image` de verdade):
upload → `refcount 0` → insert de record com a URL → `refcount 1` → `DELETE /tables/{id}?confirm_name=…` → `refcount 0` → delete do asset → 200. Comportamento exato do esperado. O pytest local cobre os mesmos fluxos (`tests/test_media_assets.py`, 20 testes) e está verde.

*Mesma classe de artefato da QA da F0 (2026-06-15): geração desvia do plano/ambiente; os comportamentos reais estão verdes e isolados no pytest.*

## 4️⃣ Coverage & Metrics

- **10/12 passed (83%)** — os 2 fails são artefatos de geração comprovados; **cobertura efetiva dos requisitos: 12/12**.
- pytest local: **119 passed / 7 skipped** (inclui os 20 de mídia).
- Migration Alembic validada end-to-end em DB zerada (guards de fresh-DB adicionados na cadeia).

## 5️⃣ Key Gaps / Risks (pra F2+)

- Validação de **conteúdo** (sniffing de MIME forjado) fica pra F5 — na v1 o guard é o content-type declarado + whitelist do bucket.
- Quota por workspace fica pra F5 (v1 tem só teto de 10MB/arquivo).
- Kickoff checks pendentes do Diretor: keep-alive cobrindo Storage (free tier) e checagem de tabela `assets` pré-existente em prod.
