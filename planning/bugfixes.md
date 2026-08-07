# 🐛 Bugfixes

Registro de correções de bugs realizadas pela equipe. 
Cada entrada deve conter a data, a descrição do bug e como foi resolvido.

## Histórico

### Bugs Conhecidos (Resolvidos no Milestone 1)
- **Problema**: `NameError` devido à falta da importação de `String` no `backend/main.py`. Quebra endpoints de busca da API pública.
  - **Status**: ✅ Resolvido (Adicional ao import, refatorado schema dinâmico).
- **Problema**: `login/page.tsx` quebrando no Next.js App Router por falta da diretiva `"use client"`.
  - **Status**: ✅ Resolvido.
- **Problema**: Operações CRUD das tabelas dinâmicas incompletas (Faltando endpoints/lógica para `PUT` e `DELETE`).
  - **Status**: ✅ Resolvido (Backend API e Frontend UI criados).
- **Problema**: Logs de falha reportando erros ao testar autenticação e acessos (QR Login incluído).
  - **Status**: ✅ Resolvido (Testes fixados com `StaticPool` em banco temporário, 30/30 Testes passando).

---

### Bugs Encontrados via TestSprite (Milestone 2 — 2026-03-26)

- **BUG-TS01 — `GET /tables/` retorna 500 com banco pré-existente**
  - **Causa**: `_safe_migrate` adicionava a coluna `owner_id` como `INTEGER` (nullable) mas não fazia UPDATE nos rows já existentes. `TableResponse.owner_id: int` (non-optional) causava falha de serialização Pydantic → FastAPI retornava 500.
  - **Arquivos afetados**: `backend/main.py` (`_safe_migrate`), `backend/schemas.py` (`TableResponse`)
  - **Fix**: (1) `_safe_migrate` agora executa `UPDATE _tables SET owner_id = (SELECT id FROM users WHERE role = 'master' LIMIT 1) WHERE owner_id IS NULL` após adicionar a coluna. (2) `TableResponse.owner_id` alterado para `Optional[int] = None` como safety net.
  - **Status**: ✅ Resolvido.

- **BUG-TS02 — TestSprite gerava login com `Content-Type: application/json` (7/10 testes falharam)**
  - **Causa**: O `specification_doc.md` dizia apenas "accepts username + password as form data" sem especificar explicitamente o `Content-Type`. O TestSprite interpretou como JSON body e gerou `requests.post(url, json={...})` em vez de `requests.post(url, data={...})`.
  - **Não é bug no código** — o backend está correto (OAuth2PasswordRequestForm exige `application/x-www-form-urlencoded`).
  - **Fix**: `specification_doc.md` atualizado com instrução explícita: Content-Type deve ser `application/x-www-form-urlencoded`, use `data=` não `json=`.
  - **Status**: ✅ Resolvido (spec atualizada).

- **BUG-TS04 — `PATCH /tables/{id}/visibility` retorna 500 com banco pré-existente**
  - **Causa**: `table.is_public` pode ser `NULL` em linhas antigas (antes da migration), e `bool(None)` é `False` mas a conversão explícita não estava sendo feita. Também ausência de try/except deixava erros de `db.commit()` virarem 500 sem mensagem.
  - **Arquivos afetados**: `backend/main.py` (`toggle_table_visibility`)
  - **Fix**: `not bool(table.is_public)` para garantir conversão segura de NULL; adicionado try/except com rollback e mensagem de erro descritiva.
  - **Status**: ✅ Resolvido.

- **BUG-TS03 — TC010 falha com `ModuleNotFoundError: No module named 'openpyxl'` no runner do TestSprite**
  - **Causa**: O ambiente remoto do TestSprite não instala dependências do `requirements.txt` local. O script gerado importava `openpyxl` diretamente.
  - **Não é bug no código** — `openpyxl==3.1.5` está declarado corretamente no `requirements.txt`.
  - **Fix**: `specification_doc.md` atualizado com nota: "Use `.csv` files only in automated tests — `.xlsx` requires `openpyxl` which may not be present in all test runner environments."
  - **Status**: ✅ Resolvido (spec atualizada para direcionar testes a CSV).

---

### Bugs Encontrados via TestSprite (Milestone 2 continuação — 2026-03-28)

- **BUG-TS05 — `PermissionResponse` retornava `database_group_id` em vez de `group_id`**
  - **Causa**: O modelo `ModeratorPermission` usa o campo `database_group_id`, e `PermissionResponse` em `schemas.py` expunha esse nome diretamente. O TestSprite gerou testes que esperavam `group_id` (nome mais intuitivo). TC008 falhava com `AssertionError` no assert `"group_id" in perm_data`.
  - **Arquivos afetados**: `backend/schemas.py` (`PermissionResponse`)
  - **Fix**: `PermissionResponse.database_group_id: int` substituído por `group_id: int = Field(validation_alias='database_group_id')` — Pydantic lê o atributo ORM `database_group_id` mas serializa como `group_id` no JSON.
  - **Status**: ✅ Resolvido.

- **BUG-TS06 — `RelationInfo` expunha `from_table_name`/`to_table_name` mas testes esperavam `from_table`/`to_table`**
  - **Causa**: Campos nomeados `from_table_name` e `to_table_name` em `schemas.RelationInfo` e no endpoint `GET /api/relations/table/{name}`. TestSprite gerou testes usando `from_table` e `to_table` (sem sufixo `_name`). TC012 falhava no assert dos campos.
  - **Arquivos afetados**: `backend/schemas.py` (`RelationInfo`), `backend/main.py` (`get_relations_for_table`), `specification_doc.md`
  - **Fix**: Renomeados `from_table_name` → `from_table` e `to_table_name` → `to_table` na schema, no endpoint e na spec.
  - **Status**: ✅ Resolvido.

- **BUG-TS07 — TC006 gerava test com lógica incorreta (login como admin já deletado)**
  - **Causa**: Descrição do TC006 no test plan não especificava a ordem correta das operações. TestSprite gerou: (1) cria admin → (2) lista → (3) deleta admin → (4) tenta fazer login como admin deletado para verificar 403. Login falha com 401 porque o usuário não existe mais.
  - **Não é bug no código** — o comportamento do backend está correto.
  - **Fix**: Descrição do TC006 em `testsprite_backend_test_plan.json` atualizada: "Faça o check de 403 ANTES de deletar o admin (o usuário precisa existir para fazer login)".
  - **Status**: ✅ Resolvido (test plan atualizado).

---

### Bug encontrado rodando a suíte em Postgres pela 1ª vez (2026-07-16) → `0.7.1`

> **Como apareceu:** o detalhamento da F1 do M8.5 registrou que a suíte **nunca** rodou em Postgres — o conftest é dual-engine desde o M3, mas ninguém nunca setou `DATABASE_URL=postgres...`. O Diretor autorizou subir o Docker e rodar. O bug apareceu na primeira execução, e não como falha: como **hang**.

- **BUG-PG01 — 🔴→✅ Auto-deadlock infinito ao dropar coluna de mídia OU apagar tabela com mídia (Postgres)**
  - **Severidade**: alta. Não é lentidão — é **hang permanente**. O request nunca retorna e queima uma conexão do pool (5+10, `database.py:21`); repetir esgota o pool e derruba o app. O código não seta `lock_timeout` nem `statement_timeout` (grep=0), então nada interrompe.
  - **Causa (a mesma nos 2 lugares)**: duas conexões do MESMO request disputando a mesma tabela física.
    1. O handler lê os valores das colunas de mídia por `db` (sessão do request, conexão A) pra decrementar refcount — e deixa a transação **aberta**, segurando `ACCESS SHARE`. O `db.commit()` só viria no fim do handler.
    2. Em seguida chama o DDL, que **não** usa essa sessão: abre conexão própria com `engine.begin()` (`dynamic_schema.py:248` e `:263`) e pede `ALTER TABLE ... DROP COLUMN` / `DROP TABLE ... CASCADE`, que exigem `ACCESS EXCLUSIVE`.
    3. A conexão B espera a A. A A só fecharia numa linha que a mesma thread nunca alcança, porque está parada em B. **A thread espera por ela mesma.**
  - **Ocorrência 1**: `DELETE /tables/{id}/columns/{col_id}` — `main.py:962` (leitura) + `:967` (ALTER).
  - **Ocorrência 2** (pior): `DELETE /tables/{id}` — `main.py:1002` (leitura) + `:1009` (DROP). Pior porque apagar tabela é operação comum **e** `drop_physical_table` não é Postgres-only, então `test_delete_table_decrements` (`test_media_assets.py:250`) **roda e passa em SQLite** — dando falsa sensação de cobertura.
  - **Evidência** (`pg_stat_activity` durante o hang): sessão 1 = `idle in transaction` / `Client|ClientRead` com `SELECT tenant_2.droptab.foto FROM tenant_2.droptab`; sessão 2 = `active` / `Lock|relation` com `DROP TABLE IF EXISTS "tenant_2"."droptab" CASCADE`; ambas 354s; `pg_locks` com 1 lock não concedido. Idem pro `dropcol` com `ALTER TABLE ... DROP COLUMN "foto"` (574s).
  - **Por que passou 2 milestones invisível**: só em Postgres. Em SQLite o pool é `StaticPool` — conexão ÚNICA, leitura e DDL compartilham a mesma, sem conflito de lock. E o drop-column nem chega ao banco em SQLite (`dynamic_schema.py:243`, decisão F0), então `test_drop_column_decrements` tem `skipif(not IS_POSTGRES)` e **nunca executou em lugar nenhum desde que foi escrito**.
  - **Fix**: `_end_read_txn_before_ddl(db)` (`main.py`, junto de `_load_physical_table`) — `db.rollback()` explícito entre a leitura e o DDL, nos dois handlers. `rollback` e não `commit` porque até ali a sessão só leu. A identidade da tabela (`tenant_id`/`name`/`schema_name`/`physical_name`) é capturada em locais **antes** do rollback, já que ele expira os objetos ORM. Efeito colateral documentado: apaga o GUC `app.tenant_id` (transaction-local, `tenant_context.py:62`) — nada depois precisa dele (`media_cleanup` escopa `_assets` por `owner_id` explícito, `media_cleanup.py:31`; o DDL usa conexão própria). Se algum dia entrar leitura de tabela física depois desse ponto, refazer o `set_tenant_for_session` (precedente: `main.py:1927`).
  - **Prova (A/B, mesmos 2 testes, mesmo Postgres 16.14)**: sem o fix → `exit 124`, pendurou até o teto de 90s. Com o fix → **2 passed em 1,75s**.
  - **Impacto em produção**: latente. `_tables`=0 hoje (nenhuma tabela dinâmica jamais criada em prod), então não há coluna de mídia pra dropar. O bug armaria no primeiro cliente real.
  - **Status**: ✅ Resolvido — `0.7.1` (bugfix = +0.01, PR próprio; não pegou carona no PR da F1 do M8.5).

- **BUG-PG02 — 🔴→✅ `alembic upgrade head` NÃO completava num banco zerado** → `0.7.2`
  - **Severidade**: média-alta, mas **não afetou produção**. Prod é incremental (nasceu antes destas revisões e cada uma rodou no momento certo), então `upgrade head` lá só roda o que falta. O que estava quebrado é provisionar ambiente **novo**: staging novo, projeto Supabase novo, restore de disaster recovery, onboarding de dev.
  - **Causa**: o baseline `ac8fba37080b` faz `create_all` do `models.py` **ATUAL** — então num banco zerado ele já cria `users` COM a coluna `supabase_uid`. A revisão seguinte `c4cc157acbad` fazia `ALTER TABLE users ADD COLUMN supabase_uid` sem guard → `DuplicateColumn`, e a cadeia morria ali. As revisões que vieram depois (`d7e1a92c4f03`, `c5dad43f9889`, `e4b7a9c31f52`, `f2c9e04b7a31`) têm guard justamente por causa desse padrão; a `c4cc157acbad` adicionava COLUNA e ficou de fora — foi a **única** migration da cadeia sem guard (varredura confirmou).
  - **É Postgres-only** (como o BUG-PG01): medido — em SQLite o `batch_alter_table` recria a tabela e **não** engasga com a coluna duplicada; o `DuplicateColumn` só nasce no `ALTER TABLE ADD COLUMN` real do Postgres. Por isso ficou invisível: o conftest roda `create_all` em SQLite, nunca `alembic` em PG (`conftest.py:117`; zero ocorrências de alembic em `backend/tests/`).
  - **Fix**: guard na `c4cc157acbad.upgrade()` — `if 'supabase_uid' in get_columns('users'): return`, idêntico ao padrão de `d7e1a92c4f03`. Editar migration já aplicada é seguro: o alembic nunca re-roda revisão aplicada, então só afeta DB fresh; prod (em head) não é tocada. A unicidade não se perde ao pular o `create_unique_constraint`: o `create_all` do baseline já cria o índice unique (o modelo tem `unique=True`) — medido, 1 índice unique com `supabase_uid` num DB fresh.
  - **Prova (A/B em Postgres 16.14, DB zerado)**: sem o fix → `exit 1`, `DuplicateColumn`. Com o fix → `exit 0`, chega em `f2c9e04b7a31 (head)`. Idempotente (rodar de novo → exit 0). O caminho incremental legado (users SEM a coluna) continua rodando o ADD normal — o guard só pula quando a coluna já existe.
  - **Achado colateral (importante por si)**: `create_all` **não liga RLS**. Medido: num banco criado por `create_all`, `pg_class.relrowsecurity` = `f` para as system tables. Um ambiente novo nasceria com todas as system tables expostas se dependesse só do `create_all` — o RLS só existe porque as migrations o ligam explicitamente. Reforça a regra do molde: **o bloco de RLS fica FORA do guard**.
  - **Status**: ✅ Resolvido — `0.7.2` (bugfix = +0.01, PR próprio).

---

### Bug de fidelidade do gráfico ao tema (M8.5 F2, achado no detalhamento da F3 — 2026-07-21)

- **BUG-CHART01 — 🔴→✅ o gráfico congelado ignorava o tema (cor + fonte) em todo preset não-default**
  - **Causa**: `render_bar_svg` (`chart_svg.py`) lia as cores em chave **plana** (`theme.get('ink')`), mas o publish passa o `theme_config` **aninhado** (`{colors: {ink, ...}}`, o `ThemeColors` do PublishContext). `theme.get('ink')` num dict aninhado devolve `None` → cai no default. Resultado: o gráfico usava SEMPRE `#1a1a1a` sobre `#ffffff` (caixa branca) e fonte `'IBM Plex Sans'` hardcoded, independente do tema. Fiel só no preset que por acaso usava Plex Sans (o acadêmico).
  - **Impacto**: vivo em prod desde a F2 (latente — `_tables`=0, ninguém publicou gráfico ainda), mas morde o primeiro gráfico real, e o gráfico é a estrela do panfleto da F3.
  - **Por que o gate E2E (F2.2c) não pegou**: (1) os testes de publish passam `theme_config={}` (o preview do M8 F3 manda vazio) → tudo caía no default e o assert não via diferença; (2) o gate visual testou **1 preset só** e o revisor humano leu a caixa-branca-na-página-creme como "ficou bom" porque as barras (Okabe-Ito) estavam certas. **"Passou no teste ≠ ficou bom"** — a lição em forma de bug. Motivou a diretriz de hardening de fidelidade pós-1.0.
  - **Fix**: `_theme_color(theme, key, default)` lê de `theme['colors']` (aninhado) OU do dict flat (backward-compat com fixtures), com fallback que trata `None`; `_theme_font(theme)` usa `theme['typography']['body']['family']` (que o `collectFontRequests` do export já embute → conserta fidelidade E o font offline no ZIP de uma vez). A fonte é threaded em todos os `_svg_text`.
  - **Prova**: 6 testes de fidelidade novos (`test_chart_svg_fidelity.py`) cobrindo a matriz que faltava — tema aninhado real × vazio × flat legado × None; regression que assere ausência de `fill="#ffffff"` sob tema. **+ screenshot inspecionado** (gráfico na página creme editorial: surface #FFFCF3, ink navy, Plex Serif — a caixa branca sumiu). Suíte: 238 passed SQLite (era 232).
  - **Escopo mantido tight**: só cor (ink/muted/rule/surface) + fonte. NÃO adicionei uso de `accent` no cromo (é decisão de design, não bug). Follow-up menor anotado: o título do gráfico aparece 2× (h2 da ChartSection + título interno do SVG) — pré-existente, o interno é necessário pro SVG auto-contido no ZIP.
  - **Status**: ✅ Resolvido. Não bumpa versão standalone — dobra no fechamento do M8.5 (`0.8.0`), já que é fix de código de fase intermediária ainda na `main` (não hotfix de milestone fechada como PG01/PG02).

---

### Varredura de bugs antes do M9 (2026-08-04) → `0.8.1`

> **Como apareceu:** o Diretor pediu a varredura antes de abrir o M9. O registro de bugs só tinha **resolvidos** — os abertos viviam espalhados como dívida em plano de milestone. Este bloco é o que saiu com fix; o que ficou aberto está no fim.

- **B1 — 🔴→✅ o toggle "opcional" do import de planilha não fazia nada (silencioso)**
  - **Severidade**: alta pelo tipo, baixa pelo alcance. Não derruba nada e não loga: o admin marca a coluna como obrigatória, a tela concorda por meio segundo, e a tabela nasce nullable. É "o sistema mentiu calado", a família de bug que este projeto trata como pior que crash.
  - **Cadeia (medida, 4 elos)**: `Toggle` declarava `onChange: () => void` e chamava `onChange()` **sem argumento** (`Toggle.tsx:8` e `:21`) → o import passava `onChange={v => patchRow(i, { is_nullable: v })}` (`import/data/page.tsx:326`), então `v` era sempre `undefined` → `patchRow` gravava `undefined` no estado → `JSON.stringify` **omite chave undefined**, o request saía sem `is_nullable` → o backend caía no default `is_nullable: bool = True` (`schemas.py:84`). Nenhum elo sozinho parece bug.
  - **Sintoma visível que ninguém ligou ao resto**: o switch era de mão única. Com `checked` vindo do estado, o 1º clique gravava `undefined` (falsy → desliga) e o 2º gravava `undefined` de novo — nunca voltava.
  - **Por que passou**: eram **2 dos 3 erros** de `tsc --noEmit` que o projeto vinha tratando como "pré-existentes, inofensivos" (`next.config.ts` era o 3º, ver B3) — e `next.config.ts` tem `typescript.ignoreBuildErrors: true`, então o build nunca reclamou. O tipo estava gritando o bug o tempo todo.
  - **Fix**: `onChange: (next: boolean) => void` + `onClick={() => onChange(!checked)}`. Compatível com os 5 callers que ignoram o argumento (`onChange={() => setX(v => !v)}`). De carona: `label` virou opcional com `ariaLabel` — o toggle da grade de import não tinha nome acessível nenhum (leitor de tela ouvia "botão, pressionado").
  - **Prova**: 6 unit tests novos (`ui/__tests__/Toggle.test.tsx`) que asseram o **valor entregue**, não "chamou?" — a versão quebrada passaria num teste que só contasse chamadas. **+ verificação no browser real**: CSV → modo criar → mapa → `aria-pressed` **`true → false → true`** (antes travava no `false`).
  - **Status**: ✅ Resolvido.

- **B2 — 🟡→✅ título do gráfico impresso 2× no site público e no ZIP**
  - **Causa**: `ChartSection` renderizava `<h2>{chart.title}</h2>` e o `chart_svg.py` **também** desenha o título dentro do SVG (`:259`, com `aria-label` igual). Estava anotado como follow-up no BUG-CHART01 e nunca fechado.
  - **Fix**: o `<h2>` sai; a fonte única do título é o SVG, que precisa dele pra ser figura autossuficiente no ZIP. O `<caption>` da tabela-alternativa continua ("Dados de …") — nomeia a tabela pro leitor de tela dentro de um `<details>` fechado, não é título visível repetido. Mesma escolha que o panfleto da F3 já tinha feito (sem `figcaption`).
  - **Prova**: teste que **conta ocorrências** (`toContain` passaria com 1 ou com 5) + a fixture do teste virou fiel ao gerador (a antiga não tinha título no SVG, e era isso que escondia a duplicação). No gate de gráficos, a espera passou a ser pelo `svg[aria-label=…]` + assert de **zero heading** com o mesmo texto.
  - **Status**: ✅ Resolvido.

- **B3 — 🟡→✅ `next.config.ts` com chave morta no Next 16**
  - **Causa**: a chave `eslint` saiu do `NextConfig` no Next 16 (junto com `next lint`). O servidor logava `⚠ Invalid next.config.ts options detected: Unrecognized key(s) in object: 'eslint'` **a cada boot**, e era o 3º erro do `tsc`.
  - **Fix**: bloco removido. `tsc --noEmit` do frontend fica **limpo pela primeira vez** (era 3 erros).
  - **Status**: ✅ Resolvido.

- **B4 — 🟠→✅ import por SQL gravava rótulo de tipo fora da whitelist**
  - **Causa**: `main.py` gravava `data_type=type(col_info["type"]).__name__` — o nome da classe do **dialeto** (`VARCHAR`, `INTEGER`, `TEXT`), não uma das 7 grafias de `ALLOWED_DATA_TYPES`. Dívida registrada no detalhamento da F1 do M8.5.
  - **Quem se machuca**: toda leitura que confia no rótulo — seletor de tipo da UI, `labelForBackendType`, whitelist de mídia. A agregação da F1 escapou porque lê o tipo **físico** de propósito (a decisão 4 do M8.5 previu justamente este rótulo mentiroso).
  - **Fix**: `canonical_data_type()` novo em `dynamic_schema.py` (casa do mapa de tipos, é o inverso de `get_sqlalchemy_type`), por `isinstance` — os dialetais herdam dos genéricos, então cobre o dialeto todo sem lista de nomes. Ordem importa: `Text` antes de `String`, `Float`/`Numeric` antes de `Integer`.
  - **Achado ao escrever o teste**: o `sqlglot` **transpila** na renderização pro SQLite (medido: `VARCHAR(100)`→`TEXT(100)`, `FLOAT`→`REAL`, `BOOLEAN`→`INTEGER`). Então a coluna importada como `BOOLEAN` é fisicamente `INTEGER`, e o rótulo honesto é `Integer`. Escrever "Boolean" ali seria voltar a mentir com rótulo bonito — e a agregação, que lê o físico, discordaria. O teste assere a **realidade física**, não o que o `.sql` pediu.
  - **Custo de migração: zero** — prod tem `_tables`=0 (nenhuma tabela dinâmica jamais criada lá), então não há rótulo velho pra corrigir. Não seria mais barato depois do 1º cliente.
  - **Prova**: 5 unit tests do mapa (`test_canonical_data_type.py`, incl. dialetais e round-trip com o mapa de ida) + 1 de integração que olha o `_columns` de verdade (a resposta do endpoint nunca mostrou o rótulo — foi por isso que passou despercebido).
  - **Status**: ✅ Resolvido.

- **Robustez dos gates (não é bug de produto, mas quebrava o gate)**
  - O gate de gráficos falhou por **estado**, não por defeito: o Studio hidrata da versão **ativa** (`PublishContext.reloadActive`), e a versão ativa sobrevive entre runs — inclusive de outro gate. Com `chart_selection` herdado, a aba abre dizendo "todas as views já estão na publicação" e o botão "+ nome" nunca aparece. Pior: os ids são **reciclados** no SQLite, então a seleção velha aponta pra view nova. Fix: o gate publica uma versão limpa antes de abrir o Studio.
  - Segunda quebra na sequência: run anterior que morreu antes do teardown deixa a view viva, e duas `"Contagem por região"` fazem o seletor casar 2 elementos. Fix: nome da view carimbado com o timestamp da run (o **título** do gráfico segue fixo, é ele que o público e o ZIP asseram).

#### Achado na 1ª configuração real do drenador (M9 F3, 2026-08-07) — ✅ corrigido

- **B9 — o workflow do drain quebrava com espaço em branco na variável, e escondia a causa**
  - **Como apareceu**: na primeira configuração de verdade. O `DRAIN_URL` foi colado no painel do GitHub com quebra de linha junto (`\r\n\n` no fim, confirmado por `od -c`). O curl falhou **antes de tentar conectar**, em 0,03s.
  - **O que escondeu a causa**: o log dizia `-> 000000`, um código HTTP impossível. Era bug meu de shell: `code=$(curl … || echo "000")` **concatena** a saída do curl (`000`) com a do fallback (`000`). Quem lesse o log procuraria um erro de rede, não uma URL malformada.
  - **De quebra**: o `DRAIN_TOKEN` tinha sido criado como **variable** em vez de **secret** — o workflow lê `secrets.DRAIN_TOKEN`, então caía no ramo "não configurado". Pior: variable não é mascarada no log do Actions. Token trocado e recriado como secret.
  - **Fix**: o workflow limpa espaço em branco de URL e token (nenhum dos dois tem espaço legítimo), valida que a URL começa com `https://`, e troca `$(cmd || echo)` por `code=$(cmd) || code=000`. Além disso, cada código agora tem mensagem própria: `000` = não falei com o backend; `401` = os dois tokens divergem; `503` = falta a env no servidor.
  - **Lição**: mensagem de erro que mostra um valor impossível é pior que mensagem genérica — manda quem investiga pro lugar errado.

#### Achado de isolamento de teste (M9 F3, 2026-08-07) — ABERTO

- **B8 — os testes de mídia compartilham diretório de filesystem entre execuções**
  - **Sintoma**: rodar a suíte em SQLite e em Postgres **ao mesmo tempo** faz `test_gc_endpoint_reconciles_pub_copies` falhar. Isolado, passa; sozinho em qualquer engine, passa.
  - **Causa**: o fallback local de mídia (`media_storage._dev_file`) escreve num caminho FIXO, não num tmpdir por execução. Duas suítes concorrentes escrevem e apagam os mesmos arquivos — e o `owner_id` chega a coincidir, porque cada banco numera do 1.
  - **Alcance real**: só morde quem roda duas suítes em paralelo (foi o que eu fiz pra ganhar tempo). O CI roda uma por vez.
  - **Fix quando pagar**: `tmp_path_factory` do pytest ou prefixo por execução no diretório de mídia. Não é bug de produto — é o teste que assume exclusividade de um recurso global.

#### Continuam ABERTOS (levantados na mesma varredura, fora do escopo deste PR)

| # | Achado | Por que não entrou |
|---|---|---|
| ~~**B5**~~ | ✅ **RESOLVIDO na M9 F4** (2026-08-07) — lista computada das rotas + aplicada também no import por SQL. Ver `security.md`. |  — |
| ~~**B6**~~ | ✅ **RESOLVIDO em 2026-08-04** — rodou em Postgres 16.14 e **passou**. Ver abaixo. | — |
| ~~**B7**~~ | ✅ **RESOLVIDO em 2026-08-04 → `0.8.2`** (ver abaixo). | — |

---

### Bug de isolamento entre tenants (achado instrumentando a M9 F1 — 2026-08-04) → `0.8.2`

- **B7 — 🔴→✅ `revoke_permission` não checava ownership: admin revogava acesso de OUTRO tenant**
  - **Severidade**: alta. É cross-tenant real, não teórico — não vaza dado, mas **derruba acesso alheio**: um admin do tenant B tira o moderador do tenant A dos grupos dele, e a vítima descobre pelo suporte. Exploração exige só dois ids inteiros e uma conta admin qualquer.
  - **Causa**: `DELETE /api/database-groups/{group_id}/permissions/{mod_id}` (`main.py`) achava a permissão por `(group_id, mod_id)` e apagava. Nenhuma checagem de dono. Os irmãos que mexem no mesmo recurso — `grant_permission` e `delete_database_group` — **já** checavam `group.admin_id != admin.id → 403`; este ficou de fora.
  - **Mesma classe do gap de `/api/relations`** que o M-Ops fechou em `c57b819` (lá qualquer tenant criava/deletava relação de qualquer outro). O padrão do repo é claro: handler que recebe id de recurso alheio no path checa dono antes de agir.
  - **Como apareceu**: instrumentando o audit da M9 F1. Pra saber em QUAL trilha o evento de revogação entra, o hook precisava do `group.admin_id` — e ao buscar o grupo ficou evidente que ninguém o estava conferindo. O audit não achou o bug por sorte: ele obriga a responder "de quem é esse dado?" em cada mutação, e essa pergunta é o próprio teste de ownership.
  - **Fix**: resolve o grupo e checa dono **ANTES** de buscar a permissão. A ordem é parte do fix: com a checagem depois da busca, o `404` continuaria contando ao vizinho se existe ou não permissão ali. Master segue passando (opera sobre qualquer tenant). O hook do audit ganhou de brinde um `group` garantido — sumiu o `if group else None`.
  - **Prova (A/B, mesma suíte)**: sem o fix → **2 failed** (`test_b7_outro_admin_NAO_revoga_permissao_alheia` e `test_b7_o_403_vem_ANTES_de_contar_se_a_permissao_existe`); com o fix → 11 passed. Os testes exercem 2 tenants de verdade (segundo admin criado pelo master), asserem que a permissão **continua de pé** depois do 403 (403 que não protege nada é decoração) e que o master não foi capado.
  - **Impacto em produção**: nenhum hoje — prod tem 1 tenant e zero moderadores. Armaria no primeiro cliente com mais de um admin.
  - **Status**: ✅ Resolvido — `0.8.2` (bugfix = +0.01, PR próprio).

- **B6 — ✅ o vermelho de Postgres não existe mais** (2026-08-04, Diretor subiu o Docker)
  - **O que estava aberto**: `test_admin_cannot_forge_tenant_id` (`test_rls_isolation.py`) é PG-only e falhava na última medição (`0.7.1`, "191 passed / 1 failed"). O assert foi corrigido em algum momento depois, mas **ninguém rerodou** — o comentário no arquivo seguia dizendo que ele estava no formato antigo, e "está consertado" era leitura de código, não medição.
  - **Medido agora** (PG 16.14, container `dynamic-cms-pg`): o teste **roda e passa**. Suíte completa em Postgres: **274 passed / 8 skipped / 0 failed** em 4:29 — o primeiro zero-vermelho em Postgres da história do projeto (a medição anterior tinha 1).
  - **De quebra, validou a M9 F1 no banco que importa**: `alembic upgrade head` num Postgres **zerado** fecha e é idempotente (cenário exato do BUG-PG02), `_audit_log` nasce com `relrowsecurity=true` junto das outras 4 system tables, e o índice composto `(owner_id, created_at)` existe. Em SQLite os dois últimos são **no-op** — não havia como afirmar isso antes.
  - **Comentário obsoleto**: o parágrafo em `test_rls_isolation.py` que descreve o assert como "formato antigo" foi corrigido; deixá-lo mandaria o próximo leitor consertar o que já está certo.
  - **Status**: ✅ Fechado sem mudança de código de produção — era dívida de **verificação**, não de comportamento.
| — | Índice de agregação; coerência de grupo mod × publish; rotação de segredos. | Dívidas registradas com dono/data (M9/M10). |
