# M9 — Webhooks + API Keys + Audit Log: porta de serviço e memória

> **Status:** 🟡 DRAFT pra rebate (ultracode 2026-06-12) — NÃO executar. Decisões abertas pendentes do Diretor.
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

## O problema

O Atlas só conversa com humanos logados: a única credencial é o JWT do Supabase (ES256 via JWKS, auth.py:87-100). Não há forma de um script, Zapier ou n8n tocar um workspace — grep por api_key/webhook/audit no backend retorna **zero**. E o app roda mudo: nenhuma trilha de mudança. Se um moderador apagar 200 linhas agora, não sobra rastro — a rota dinâmica escreve direto no banco sem registrar quem, o quê ou quando.

Isso bloqueia três coisas reais: integração externa (o pedido Zapier/n8n do roadmap), compliance/debugging ("quem mudou o quê quando") e **o M11 inteiro** — o MCP "traga sua IA" autentica via keys daqui e registra ações no audit daqui (dependência obrigatória, roadmap.md:104). Sem M9, o arco de IA não anda.

## O que entrega

Um sistema externo autentica com API key criada e revogável pelo admin, com escopo read/write por tabela; mutações disparam webhooks configuráveis (on_create/update/delete por tabela) pra URLs cadastradas; e toda ação — de humano ou de key — deixa trilha num audit log consultável, nascido tenant-aware sobre o RLS do M3. O M11 constrói em cima sem retrabalho: key é a credencial, audit é o registro.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Trilha de auditoria** | Instrumentar os pontos de mutação existentes — rota dinâmica, criação/edição de schema, imports, publish, **upload/delete de mídia (M8) e CRUD de views salvas/gráficos (M8.5)** — gravando ator, tenant, ação, alvo, timestamp. Esta fase É a fundação de eventos: os webhooks da F3 consomem os mesmos eventos, **e o eventual broadcast do M10 também, se o spike de lá escolher esse caminho** — nunca instrumentação duplicada dos handlers. O que conta como "tudo" e retenção saem do rebate. |
| **F2 — API keys com scopes** | Segunda via de auth ao lado do JWT: admin cria/revoga na UI, escopo read/write por tabela, ação por key cai no audit identificando a key. **Rate limiting básico por key entra aqui por default** ("a superfície nasce protegida") salvo decisão contrária do Diretor — invertendo o ônus: o caro é deixar de fora. Formato/hashing/exibição única/identidade são decisões abertas. |
| **F3 — Webhooks de saída** | URL + triggers por tabela, alimentados pela trilha da F1. Mecânica de entrega (inline vs fila, retry, assinatura) é a decisão técnica mais pesada — o Railway roda um único processo web (Procfile:1), "fila com worker" não é de graça. |
| **F4 — Fronteira de segurança** | Absorver o fix de /api/relations SE o M-Ops não fechou (fallback declarado), e fechar com testes de isolamento no padrão test_rls_isolation.py provando que key de um tenant não lê nem escreve em outro. Abrir porta programática sem essa prova é entregar o smell embrulhado pra presente. |

## Dependências

- **Bloqueado por:** M3 (fechado) — audit nasce tenant-aware sobre o GUC/RLS. Fila: M-Ops → M8 → M8.5 → M9.
- **Bloqueia:** M11 — keys + audit são o piso do MCP (roadmap.md:104).
- **Fronteira com M-Ops:** paginação da rota autenticada é de lá — é exatamente a rota que as keys expõem a scripts; sem ela, toda integração nasce fazendo full dump. Keep-alive/upgrade também: webhook esbarra em prod pausada.
- **Senha do Postgres:** se o rebate do M-Ops mantiver o adiamento de 2026-05-17, **o M9 assume a rotação como tarefa de kickoff (executa, não confere)** — qualquer saída da decisão tem executor.
- **Fronteira com M11:** M9 entrega credencial + trilha; transporte do MCP, superfície das tools e guards de escrita são 100% M11. A decisão aberta 7 (telemetria) usa o draft do M11 como insumo obrigatório do rebate.

## Riscos

- Audit em rota quente: cada INSERT/UPDATE/DELETE ganha escrita extra — custo medido, não assumido (jurisprudência M7).
- Webhook chama URL arbitrária do usuário a partir do backend → SSRF; disparo inline + receptor lento = request do usuário travado.
- Tempestade de eventos: import CSV/XLSX insere em massa — 10k linhas = 10k webhooks + 10k linhas de audit sem decisão de agregação.
- Key vazada = acesso programático ao tenant; revogação precisa ser imediata e o vazamento detectável pelo próprio audit (rate limit da F2 ajuda).
- A superfície que a key herda tem buracos conhecidos (inventário no M-Ops: f-string SQL em nome de tabela, rota sem paginação, sem trava de reservados) — API programática amplifica o que o M-Ops não fechar antes.
- Audit cresce sem teto num Postgres free tier — sem retenção vira a maior tabela do banco em semanas.

## Decisões abertas

1. **O que entra no "tudo gravado":** só mutações de dados da rota dinâmica, ou também DDL, import SQL/CSV, publish/activate, ações de master, **upload/delete de mídia (M8) e CRUD de views/gráficos (M8.5)**? Cobertura total responde qualquer compliance mas multiplica instrumentação e volume. E: ação de moderador/master aparece pro admin do tenant ou só pro master?
2. **Retenção e consulta:** admin vê o audit do próprio tenant numa tela nova, ou no M9 a consulta é só via API e a UI fica pra depois? Sem retenção a tabela cresce sem teto; UI é trabalho de front considerável. Só-API destrava o M11 igual.
3. **Webhook: inline no request ou fila com retry?** Inline = simples, zero infra, mas receptor lento segura o usuário e falha = evento perdido. Fila = retry e isolamento, mas worker é processo/custo novo no Railway. Define a confiabilidade prometida ao usuário do Zapier.
4. **Quais eventos disparam webhook:** só rota dinâmica, ou import em massa e publish também? **Evento de mídia (M8) dispara?** E import de 10k linhas: 10k chamadas, 1 evento agregado, ou não dispara?
5. **Identidade da key:** age "como o admin dono" (simples, suficiente pro MCP) ou identidade própria com permissões independentes (audit mais honesto — "foi a key do CI, não o César" — e key mais restrita que o dono)? Define também se moderador pode ter key.
6. **Rate limiting:** confirma o default (entra na F2) ou o Diretor tira? Três planos citavam o item sem dono — o default aqui fecha o órfão; se sair, precisa de dono nomeado explicitamente.
7. **Telemetria pro M11/M12 (nova, vinda do arco):** que payload/granularidade o audit precisa capturar pra servir de aprendizado ao MCP (tool chamada, parâmetros, padrão de consulta) — e quanto disso é questão de privacidade (dado do tenant em log de produto)? O racional da inversão M11↔M12 é "aprender intenção"; se o audit gravar só "quem fez o quê", sabemos volume, não intenção — e redesenhar o audit no M11 é o retrabalho que queremos evitar. **Rebater com o draft do M11 na mesa.**

## Fatos-âncora

- Zero api_key/webhook/audit/rate-limit/logging no backend; único middleware é o CORS (main.py:59-65). M9 parte do zero absoluto.
- Auth: JWT Supabase ES256 via JWKS (auth.py:87-100), guards de role (auth.py:152-161), role/tenant no app_metadata (supabase_admin.py:84-95). Modo dev aceita token fake `test-<username>` (auth.py:124-129) — testes de key convivem com isso.
- Mutações da rota dinâmica já forçam tenant_id sob GUC RLS (main.py:870-871, 924-925) — pontos naturais de instrumentação, já tenant-aware.
- Import CSV/XLSX (main.py:1147-1208) e import SQL com TODO de tenant/RLS (main.py:1096-1099) são mutações em massa fora da rota dinâmica.
- Procfile = um único processo web (`alembic upgrade head && uvicorn`) — não há worker pra fila hoje.
- test_rls_isolation.py existe como padrão pronto pra provar isolamento de keys.
- Nota: o CLAUDE.md afirma trava de palavras reservadas em POST /tables/ — **o código mostra que não existe** (main.py:484-594; correção do doc está na F4 do M-Ops).

## Não-objetivos

- Servidor MCP e tools de IA — M11; aqui é só o piso (credencial + trilha).
- Webhooks de ENTRADA — fora; M9 é só saída (backlog com doc próprio se houver demanda).
- Retroatividade do audit — não existe nada a importar; a história começa no deploy do M9.
- Observabilidade geral (Sentry, /health, uptime) — M-Ops; audit é trilha de negócio, não telemetria de erro.
- Paginação/filtros da rota autenticada — M-Ops; M9 cobra pronta.
- Doc pública/OpenAPI formal pra terceiros — o que o MCP precisa se decide no M11.
- Realtime/notificações in-app sobre eventos — M10.
