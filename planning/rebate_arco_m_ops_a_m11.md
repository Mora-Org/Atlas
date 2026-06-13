# Rebate do arco M-Ops → M11 — questões pro Diretor

> Gerado pelo planejamento ultracode de 2026-06-12 (12 agentes: 4 leitores de código/docs/infra, 6 proponentes, 2 críticos adversariais — zero alucinação encontrada em 45+ fatos verificados). Os 6 drafts estão em `planning/milestone_*.md` com status 🟡 DRAFT. **Nada vira execução antes do rebate.**

## Os 6 drafts

| Milestone | Arquivo | Decisões abertas |
|---|---|---|
| M-Ops — Observabilidade + Confiabilidade | [milestone_ops_observabilidade.md](milestone_ops_observabilidade.md) | 6 |
| M8 — Media Library + Uploads | [milestone_8_media_library.md](milestone_8_media_library.md) | 6 |
| M8.5 — Views, Gráficos & Impressos | [milestone_8_5_views_graficos_impressos.md](milestone_8_5_views_graficos_impressos.md) | 6 |
| M9 — Webhooks + API Keys + Audit | [milestone_9_webhooks_keys_audit.md](milestone_9_webhooks_keys_audit.md) | 7 |
| M10 — Realtime + Collab | [milestone_10_realtime_collab.md](milestone_10_realtime_collab.md) | 6 |
| M11 — Atlas MCP | [milestone_11_atlas_mcp.md](milestone_11_atlas_mcp.md) | 4 |

## Questões de ARCO (não pertencem a nenhum plano individual)

1. **M7 PR4 × M-Ops:** o M7 PR4 (export PNG + SQL DDL do visualizer) está pausado e era a primeira execução da volta. Confirma que ele fecha ANTES do M-Ops começar?
2. **M7.5 (Editorial Pass) está órfão:** é promessa de Faixa 1 do roadmap (screens-1/2/3 do handoff) e nenhum draft o cobre. Opções: (a) trilho paralelo de baixo risco em algum ponto da fila (é só front editorial, zero backend — a "regra de ouro" permite paralelo em área diferente); (b) 🧊/reposicionado no roadmap com motivo. O que não pode é seguir como item ativo que a fila ignora.
3. **Ordem do fim do arco: M9 → M10 → M11 (atual) ou M9 → M11 → M10?** O M11 depende só de M9 (+M-Ops), e o acoplamento fino M9↔M11 (shape de keys, scopes, telemetria de intenção) sugere adjacência. O M10 no meio — justamente o spike mais arriscado (Realtime × RLS por GUC) e dependente de decisão de plano pago — alarga a janela em que o desenho do M9 apodrece antes de o M11 consumi-lo, e adia o "laboratório do M12". Mitigação se mantiver a ordem atual: a decisão aberta 7 do M9 (telemetria) já resolve o essencial no rebate do M9.
4. **Decisão de plataforma que atravessa 3 milestones:** keep-alive vs upgrade do Supabase (decisão 2 do M-Ops) é na prática pré-requisito de M8 (Storage) e M10 (Realtime + cotas). Decidir uma vez, no rebate do M-Ops, com as cotas de Realtime na mesa.
5. **QR login via Magic Link (herdado do M4):** hoje só existe como não-objetivo do M-Ops. Registrar no roadmap: 🧊 junto do Mobile Companion (mesma justificativa) ou linha no backlog?
6. **Dois compromissos de arco embutidos nos drafts** (criados pelos críticos, confirmar no rebate): (a) o M8.5 persistir gráfico salvo como artefato consultável — sem isso a F4 do M10 (live charts) não tem substrato; (b) rate limiting por key entra por default na F2 do M9 — 3 drafts citavam o item sem dono.

## Achado colateral (independente do rebate)

O **CLAUDE.md está desatualizado**: afirma "trava de palavras reservadas no POST /tables/" que não existe no código (main.py:484-594 sem validação alguma). Os drafts M9/M11 citam o fato correto; a correção do doc entrou na F4 do M-Ops — mas pode ser corrigida antes se o Diretor preferir.

## Como retomar

Rebate por milestone, na ordem da fila (M-Ops primeiro — é o próximo a executar depois do M7 PR4). Cada sessão de rebate fecha as decisões abertas de um plano e o status muda de 🟡 DRAFT pra 🟢 APROVADO. As questões de arco (acima) podem ser batidas todas na primeira sessão.
