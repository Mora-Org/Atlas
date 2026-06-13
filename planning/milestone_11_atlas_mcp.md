# M11 — Atlas MCP: "traga sua IA"

> **Status:** 🟡 DRAFT pra rebate (ultracode 2026-06-12) — NÃO executar. Decisões abertas pendentes do Diretor.
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

## O problema

A única porta de entrada pros dados de um workspace é o navegador com sessão Supabase: o backend só aceita JWT ES256 via JWKS (auth.py:87-100) e não existe API key, token de serviço ou API pública documentada — a única "doc" é o OpenAPI auto-gerado. Um usuário que quer perguntar "quantos clientes não compram há 30 dias?" não tem como apontar a IA dele pro próprio workspace: ou exporta ZIP e conversa fora do Atlas, ou esperaria a gente embutir um LLM — pagando nós a inferência de todo mundo.

O MCP inverte a conta: a inteligência e o custo de LLM são do usuário; nós só expomos tools sobre endpoints que já existem. De quebra, é o laboratório do M12: o uso real revela quais helpers valem embutir, em vez de especular — foi por isso que o Diretor inverteu M11↔M12 em 2026-06-12 (roadmap.md:101-104).

## O que entrega

O admin gera uma API key no Atlas (entregue pelo M9), configura o cliente MCP da preferência dele (Claude Desktop, Claude Code, o que for) e conversa com o próprio workspace — lista tabelas e relações, consulta dados com filtros, e (se o rebate liberar) insere/edita com guards. Toda ação cai no audit do M9 com a identidade da key; o isolamento é o mesmo RLS de hoje, sem caminho paralelo. O padrão de uso observado vira o insumo de decisão do M12.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Spike de fundação: transporte + auth por key** | Validar as duas pontes que não existem: (a) como uma key do M9 vira contexto tenant/role dentro do pipeline atual (que só conhece JWT + set_tenant_for_session) sem furo de RLS; (b) qual transporte/hospedagem serve o usuário real (decisão 1). SDK de MCP é dependência nova — jurisprudência M7: spike medido antes de adotar, engine encapsulada pra troca ser cirurgia local. O spike também mede **maturidade** da spec/SDK, não só funcionalidade. |
| **F2 — Tools de leitura** | Listar tabelas/colunas/relações e consultar dados com filtros, sempre dentro do tenant da key. Entrega o caso de uso âncora. Reuso máximo dos endpoints existentes — a superfície de consulta depende da paginação/filtro que o M-Ops entregou na rota autenticada. |
| **F3 — Escrita com guards (condicionada ao rebate)** | Inserir/editar via tools, com as proteções da decisão 2 (read-only no lançamento? confirmação? dry-run?). Escopo e até a existência desta fase dependem do rebate; se read-only vencer, vira candidata a follow-up pós-lançamento. |
| **F4 — Audit + aprendizado pro M12 + onboarding** | Toda ação MCP no audit do M9 com identidade da key; uso observável o suficiente pra "ensinar o M12" (a telemetria foi desenhada lá — decisão aberta 7 do M9; aqui só se valida). Fecha com doc de onboarding honesta — "como plugar sua IA" — comunicando o que existe vs o que não vem. |

## Dependências

- **M9 OBRIGATÓRIO:** keys e audit não existem em forma nenhuma — o MCP autentica e audita no que o M9 criar (roadmap.md:104). **A telemetria de intenção que ensina o M12 já entrou como decisão aberta 7 do plano do M9** (com este draft como insumo do rebate de lá) — o M11 valida, não redesenha.
- **M-Ops:** a tool de consulta não pode nascer sobre endpoint que devolve a tabela inteira — paginação/filtro da rota autenticada já é escopo aceito de lá. O MCP assume pronto; se não estiver, a F2 trava.
- **RLS do M3** é a fundação que qualquer transporte/hospedagem precisa atravessar — nunca por fora.
- Sequência atual: M9 → M10 → M11. **Alternativa levantada pelo painel pro rebate do arco: M9 → M11 → M10** (adjacência M9↔M11 protege o desenho de keys/audit; M10 tem o spike mais arriscado do arco e depende de decisão de plano pago). Decisão do Diretor.

## Riscos

- **Key fora do pipeline JWT é o risco nº 1:** todo o auth atual assume JWT com role/tenant no app_metadata. Encaixar key→tenant/role no set_tenant_for_session errado = vazamento cross-tenant.
- Escrita por IA amplifica smells inventariados no M-Ops (f-string SQL em nome de tabela, /api/relations sem ownership até o fix) — ou fecham antes, ou ficam explicitamente fora das tools.
- Cliente IA em loop é DoS de boa-fé — mitigado pelo **rate limiting por key que entrou como default na F2 do M9**; aqui só se confirma que cobre o padrão de uso MCP.
- Hospedagem remota herda o auto-pause do free tier até o M-Ops resolver — "servidor sempre disponível" num stack que dorme é promessa furada.
- Spec MCP e SDKs evoluem rápido — versão de protocolo/transporte pode mudar sob nossos pés.

## Decisões abertas

1. **Transporte e casa do servidor:** pacote local (stdio) que o usuário roda na máquina dele, ou servidor remoto (HTTP) hospedado por nós? Local = zero infra nossa e a key não sai da máquina do usuário, mas exige instalação/atualização por usuário (fricção, versão velha em campo). Remoto = "cola a URL e usa", mas vira processo nosso pra operar e herda o free tier. Define a F1 inteira.
2. **Nasce read-only ou já lança com escrita?** Read-only entrega o caso âncora com risco quase zero. Escrita é o diferencial do "traga sua IA", mas dar caneta a uma IA num CMS multi-tenant exige guard sem forma ainda — confirmação humana? dry-run com preview? limite de linhas por operação? Se escrita depois: follow-up do M11 ou entrada do M12?
3. **Multi-tenancy do servidor:** instância única resolvendo tenant pela key, ou isolamento mais duro? E como a key mapeia pra role (admin vs moderator) nas tools? O desenho fino depende dos scopes do M9 — decisão parcialmente condicionada ao rebate de lá.
4. **Tools de schema (DDL) entram ou só dados?** O roadmap promete listar/consultar/inserir/editar — DDL não. "Crie uma tabela de clientes" é o caso do M12, e hoje nome de tabela entra em SQL via f-string sem sanitização e **não existe trava de palavras reservadas em POST /tables/** (o CLAUDE.md afirma que existe — o código mostra que não; correção do doc na F4 do M-Ops). IA escrevendo DDL antes desses fixes é pedir incidente. Tendência: fora, registrado como fronteira com M12.

## Fatos-âncora

- Auth exclusivamente JWT Supabase ES256 via JWKS, audience `authenticated` (auth.py:87-100); user por supabase_uid (140-145); role/tenant no app_metadata (supabase_admin.py:84-95). Nenhum outro método existe.
- Zero infra pra M11: nenhuma tabela de keys/audit em models.py, zero logging/rate limit — M11 consome o que o M9 criar.
- Rota pública já tem o template completo da tool de consulta: filtros 7 ops, search, count, sort, limit/offset cap 500 (main.py:765-824); a autenticada ganha o equivalente no M-Ops.
- Isolamento real e por request: FORCE RLS + policy por GUC (dynamic_schema.py:103-146; tenant_context.py:47-65); backend força tenant_id em INSERT/UPDATE contra forge (main.py:870-871, 924-925).
- Compromisso do roadmap: tools listar/consultar/inserir-editar com guards, auth via keys do M9, ações no audit; racional "mais barato que IA embutida e ensina o M12" (roadmap.md:101-104).
- Jurisprudência de lib nova vale pro SDK MCP (m7_spike_resultado.md: budget reprovou xyflow mesmo com runtime empatado).

## Não-objetivos

- IA embutida (chat na UI, NL→SQL nosso, schema synthesis) — M12, calibrado pelo uso observado daqui.
- Criar tabelas de keys/audit, formato/hash/rotação, granularidade de scopes — tudo M9; o M11 **consome**. Requisitos de telemetria já entraram como decisão aberta 7 do M9 — aqui só se valida.
- Paginação/filtro da rota autenticada — M-Ops; a F2 assume pronto, não duplica.
- Webhooks (out ou in) — M9. O MCP é pull pela IA do usuário, não push nosso.
- Tools de DDL — tendência fora (decisão 4); caso de uso pertence ao M12.
- Realtime no contexto MCP (IA "assinando" mudanças) — M10.
- Mobile Companion — congelado 2026-06-12, não volta por aqui.
