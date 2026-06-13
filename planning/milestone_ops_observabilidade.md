# M-Ops — Observabilidade + Confiabilidade: tirar a produção do mudo

> **Status:** 🔵 EM EXECUÇÃO (2026-06-13) — Diretor liberou defaults industry-standard nas dúvidas. F3/ownership de `/api/relations` ✅ feito+testado (em main). Defaults aplicados/recomendados na seção "Execução e defaults"; decisões de plataforma (custo/dashboard) seguem com o Diretor.
> Este plano é a **fonte única** dos smells compartilhados do backend — os planos M8–M11 referenciam "smells inventariados no M-Ops" em vez de re-listar.

## O problema

Em 2026-06-11 a produção caiu — Supabase free tier auto-pausou o projeto — e ninguém soube até esbarrar. Não foi azar: o backend roda mudo. Zero logging (nenhum `import logging` em `backend/*.py`), nenhum error handler global, nenhum error tracking, e o endpoint mais próximo de "health" é o `GET /` que devolve boas-vindas SEM tocar o banco (main.py:72-74) — respondeu 200 durante o incidente inteiro; até um uptime monitor apontado pra ele teria mentido. Também não existe CI: o diretório `.github` não existe, as 12 suítes pytest só rodam via `run_tests.ps1` manual, e o build de produção ignora erros de TypeScript e ESLint por config (next.config.ts:8,13).

Por cima do incidente, dívidas que crescem com o uso: a rota autenticada `GET /api/{table_name}` baixa a tabela inteira sem paginação (fetchall em main.py:895) enquanto a rota pública já pagina, filtra, busca e ordena (main.py:765-824); `POST/DELETE /api/relations` cria e deleta relações de QUALQUER tenant sem checar ownership (main.py:635-649 e 711-718 — achado do painel M7); a senha do Postgres foi exposta em chat e a key do TestSprite está no histórico do git, ambas sem rotação; e o seed de `testadmin` com senha hardcoded roda em produção se `SKIP_TEST_SEED` não estiver setado no Railway (main.py:43-54).

## O que entrega

A produção avisa quando quebra em vez de esperar alguém esbarrar: erros rastreados, alerta de downtime apontado pra um health check que toca o banco de verdade, auto-pause neutralizado (keep-alive ou plano pago — decisão do rebate). Todo PR passa por CI (pytest + build) antes do merge. A rota dinâmica autenticada pagina como a pública já pagina. `/api/relations` respeita ownership. Segredos comprometidos rotacionados, envs reais documentadas no repo, e o backlog de segurança — que hoje vive só em memória/followups fora do repo — vira documento oficial versionado.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Produção que avisa** | Error tracking no backend, health check que toca o banco, uptime alert apontado pra ele, neutralização do auto-pause (keep-alive ou upgrade). Resposta direta ao incidente. Ferramenta, provedor e keep-alive vs pago são decisões abertas. |
| **F2 — CI em PR** | Pipeline com pytest + build do Next + **tsc/lint explícitos** (o build ignora ambos por config). Inclui higiene barata de deps: pin do PyJWT (hoje chega transitivo sem pin) e verificação do xlsx 0.18.5 (CVEs conhecidas). Gate Playwright no CI é decisão aberta. |
| **F3 — Dívidas de rota** | Paginação na rota dinâmica autenticada — a rota pública é o template provado (filtro 7 ops, search, count, sort, limit/offset com cap) — e fix de ownership em POST/DELETE /api/relations (**✅ ownership feito 2026-06-13**). Inclui adaptar o DataViewer, que assume fetch da tabela inteira. |
| **F4 — Segredos e papel** | Rotação dos segredos comprometidos, auditoria das envs de produção (SKIP_TEST_SEED, SECRET_KEY default), `.env.example` e doc de deploy honestos (4 envs do Supabase fora de qualquer doc; README recomenda Neon, que não é a prod real). Inclui corrigir o CLAUDE.md, que afirma trava de palavras reservadas em POST /tables/ que **não existe no código** (main.py:484-594 sem validação). Fecha oficializando o backlog de segurança no repo (security.md parou em 03/2026). |

**Ordem dura com o M8** (refinada pelo painel): **F1 e F3 fecham ANTES de o M8 iniciar a fase de DataViewer/Storage** — F3 reescreve o contrato de fetch do mesmo DataViewer que o M8 toca, e mídia servida do Storage herda o auto-pause se F1 não fechou. Paralelismo só vale pra F2 (CI) e F4 (segredos), que não tocam superfície do M8.

## Dependências

- **Bloqueia:** M8 (ordem dura acima) e parcialmente M8.5 F1 (agregações nascem sobre a rota que a F3 pagina).
- **Bloqueado por:** nada técnico. Mas o **M7 PR4** (export PNG + SQL DDL) está pausado e era a primeira execução da volta — a ordem M7-PR4 × M-Ops precisa ser batida no rebate.
- **Operacional:** config de Railway/Vercel/Supabase vive 100% nos dashboards (zero arquivo declarativo no repo) — rotação, uptime alert e keep-alive/upgrade exigem ações do Diretor nos painéis.

## Riscos

- Rotação de segredos mexe em produção viva sem config declarativa — coordenação ruim = downtime auto-infligido, rollback manual via dashboard.
- Primeiro CI verde pode custar mais que o workflow: as suítes nunca rodaram em ambiente limpo, e `ts_errors.log`/`ts_issues.txt` commitados sugerem erros TS que o build ignora hoje.
- Paginação muda o contrato da rota mais consumida pelo DataViewer (fetch all + fetch das tabelas referenciadas pra labels de FK) — backend e front precisam andar juntos.
- Keep-alive é gambiarra sobre sintoma: pode falhar mudo ou esbarrar em política do Supabase — o alerta de downtime continua necessário mesmo com ele.
- Scope creep: a lista de smells é longa (CORS `*`+credentials, seed testadmin, f-string SQL em nome de tabela, palavras reservadas) — sem corte explícito no rebate, vira milestone de meses.

## Decisões abertas (o coração do rebate)

1. **Error tracking:** Sentry (free tier, conta nova, SDK no backend) ou só logging estruturado + logs do Railway, com Sentry pra quando doer? Sentry dá stack trace/agrupamento/alerta prontos mas é mais um serviço; logging puro exige alguém olhando log — exatamente o comportamento que falhou no incidente. Define também se o frontend entra agora.
2. **Auto-pause:** keep-alive (cron pingando o health) ou upgrade do plano Supabase? Qual custo mensal é aceitável? **Decidir com as cotas do Realtime na mesa** — M8 (Storage) e M10 (Realtime, conexões/mensagens nunca medidas) herdam esta decisão; é na prática pré-requisito dos dois.
3. **Rotação da senha Postgres:** agora no M-Ops ou mantém a decisão de 2026-05-17 (pós-M8, início de M9)? Os dois registros conflitam (followup diz adiar; roadmap põe no M-Ops). A senha está exposta desde maio. Se o rebate mantiver o adiamento, **o M9 executa no kickoff** (já refletido no plano do M9) — qualquer saída tem executor.
4. **CI:** gate fica em pytest + build + tsc/lint, ou o gate Playwright (matriz 2×4 + perf) também entra? Playwright em CI = minutos de pipeline + flakiness; manual/local tem funcionado. Decidir o que é bloqueante vs informativo.
5. **Paginação da rota autenticada:** portar o modelo da pública como está e adaptar o DataViewer junto, ou modo de compatibilidade na transição? Ponta solta: como a paginação conversa com o truncamento de 2000 rows do snapshot (limites hoje independentes).
6. **Hardening além do comprometido:** CORS `*`+credentials, seed testadmin em prod, trava de palavras reservadas, f-string SQL em nome de tabela — entram no M-Ops ou viram backlog formal com dona definida? Meio-termo proposto: fixes baratos entram (seed, CORS), os com tentáculos (sanitização toca o motor DDL) ganham dono explícito no doc da F4.

## Execução e defaults (2026-06-13)

Diretor autorizou seguir padrão da indústria nas dúvidas e "ir pros próximos Ms". Resoluções por decisão:

1. **Error tracking → Sentry condicional + logging.** Default: `logging` estruturado + exception handler global + `/health` que toca o banco (código, sem serviço); Sentry inicializado só se `SENTRY_DSN` presente. **Ação do Diretor:** criar projeto Sentry + setar DSN; apontar uptime monitor pro `/health`. *(a implementar)*
2. **Auto-pause → DECISÃO DO DIRETOR (custo).** Recomendo upgrade (destrava M8 Storage + M10 Realtime). Interim zero-custo: cron keep-alive batendo no `/health`. *(ação de dashboard)*
3. **Rotação senha Postgres → DECISÃO/AÇÃO DO DIRETOR.** Exposta desde maio; recomendo rotacionar na F4. *(dashboard)*
4. **CI → pytest + build + tsc + lint bloqueantes; Playwright FORA do CI** (flaky + precisa de env Supabase; roda local). *(a implementar — GitHub Actions)*
5. **Paginação → portar o modelo da rota pública** (limit/offset + cap), params opcionais + adaptação do DataViewer no mesmo PR (backend+front juntos). *(a implementar)*
6. **Hardening → baratos entram, profundos viram backlog com dono.** Entram: CORS restrito, guard do seed `testadmin`, fix da falsidade "trava de reservados" no CLAUDE.md. Backlog com dono: sanitização de nome de tabela (toca o motor DDL), trava de reservados real.

**Feito nesta sessão:** ✅ ownership de POST/DELETE `/api/relations` (commit `c57b819`, +3 testes; suite backend 74 passed / 6 skipped).
**Próxima fatia sugerida:** `/health` + logging + exception handler (código puro, pytest-testável, sem decisão de plataforma).

## Fatos-âncora

- Incidente e escopo aceito: roadmap.md:71-73 ("prod caiu 2026-06-11... ninguém soube"; posição antes/junto do M8).
- `GET /` não toca o banco (main.py:72-74); não existe `/health`. Zero logging, zero exception handler, único middleware é o CORS (main.py:59-65).
- CI inexistente (sem `.github/`); build ignora TS e ESLint (next.config.ts:8,13).
- Rota autenticada sem paginação (fetchall, main.py:877-895) vs pública completa (main.py:765-824, cap 500) — template pronto.
- Ownership ausente em /api/relations (main.py:635-649, 711-718). Seed testadmin em prod sem SKIP_TEST_SEED (main.py:43-54). CORS `*`+credentials (main.py:59-65).
- Segredos: senha Postgres exposta em chat (adiamento registrado 2026-05-17); key TestSprite no histórico git (testsprite_tests/tmp/config.json).
- Deploy 100% via dashboards; só `backend/Procfile`. Envs Supabase (backend e front) fora de todo `.env.example`; README recomenda Neon. PyJWT sem pin (transitivo via supabase).
- CLAUDE.md desatualizado: afirma trava de palavras reservadas em POST /tables/ que o código não tem (main.py:484-594, schemas.py:88-95).

## Não-objetivos

- Audit log, API keys, webhooks e rate limiting — fundação de eventos é o M9 (rate limiting tem default declarado lá). Só o fix pontual de /api/relations fica aqui.
- Agregações server-side e views salvas — M8.5 F1; a F3 só prepara a mesma rota.
- Redesign da rota dinâmica (prefixo /api/data/) — segue no backlog de armadilhas; no máximo a trava de reservados entra via decisão 6.
- Containerização/IaC — o M-Ops documenta o deploy real, não o reescreve.
- QR login via Magic Link (herdado do M4) — fora; precisa de entrada própria no roadmap (🧊 junto do Mobile ou backlog — questão de arco no rebate).
- Migração dos gates Playwright pra runner formal — só se o rebate do CI puxar.
- Observabilidade avançada de front (web vitals, replay, tracing) — se algo entrar, é captura de erros e ponto.
