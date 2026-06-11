# M6 — Fase 5: Export Estático (plano de discussão)

> **Status:** 🟢 DECISÕES FECHADAS — rebate concluído em 2026-06-11, as 6 decisões abertas foram respondidas pelo Diretor (ver seção). Aguarda só o ok final pra virar execução.
> Síntese do painel ultracode: núcleo da Proposta 3 (ordem por risco, constraints técnicas fechadas) + corte de UI da Proposta 1 ajustado pelo Diretor + disciplina de hardening da Proposta 2.

## O problema

O M6 está a um item de fechar: **"Baixar um ZIP que abre como site estático em qualquer navegador"** (arquivo, demo offline, hospedar fora do Atlas). Tudo que o export precisa já existe em prod: o blob de snapshot (`{owner_id}/v{N}.json`, autocontido — theme + copy + dados + layouts) e o `PublicSite.tsx`, renderer puro de inline-styles sem JS de runtime. O export **não gera nada novo — reembala o que já existe**, derivando 100% do snapshot imutável, nunca do DB vivo.

## O que entrega

Um único pacote: ZIP com `index.html` que abre com duplo-clique via `file://`, + snapshot JSON como artefato de arquivo, + README honesto (versão, data, aviso de truncamento, como hospedar). Sem checkboxes, sem multi-pacote — o stub `ExportReview.tsx` (inglês, Tailwind genérico, órfão) morre.

**Restrições fechadas (não são decisões):**
- **Dados inline no HTML.** `file://` bloqueia fetch de JSON local — se o index.html depender de carregar `/_data/*.json` em runtime, abre em branco. O JSON pode ir no ZIP como artefato, nunca como dependência.
- **Zero JS de runtime no site exportado.** Os 3 layouts + header sticky já são CSS puro.
- **ZIP on-demand, streamado, nada persistido no Storage** — neutraliza por construção o risco declarado "storage cresce".
- **Nada de UI antes do spike fechar.**

## Marcos

1. **Spike do HTML standalone (risco nº1 primeiro).** Provar que renderizar o PublicSite sem `onCopyEdit` + shell HTML (fontes woff2 embutidas, `html/body{height:100%}`) produz um `index.html` que abre via `file://` fiel ao site público nos 3 layouts. Comparar as duas rotas — reuso do componente no lado Next (zero drift) vs template no backend Python — e **escolher a melhor pela evidência** (decisão do Diretor: sem dogma server-side). A decisão tomada é **registrada no README e no `.speckit`** da fase. Medir tamanho/memória com workspace grande (woff2 inclusas).
2. **Fundação no backend.** Rota autenticada de snapshot por versão (hoje só a ativa sai, via rota pública), com os mesmos guards dos `/api/publications/me/*` (master 403, moderator herda parent_id, `storage_path` omitido). No mesmo marco, sanear os dois bugs que o export congelaria num artefato imutável: `json.dumps` sem `default=` (datetime estoura) e `total_rows` mentiroso quando truncated.
3. **Empacotamento e download.** Montar o ZIP on-demand (index.html dados-inline + fontes woff2 em `/assets` + snapshot JSON + README com versão/data/truncamento/como hospedar) com resposta streamada; falha digna pra blob órfão (caso 502 já conhecido).
4. **UI + validação do critério.** Ação "Exportar" **por card do histórico** na PublishTab (qualquer versão, ao lado de "Voltar pra esta"); **aviso pré-geração quando a versão tem tabelas truncadas**; **momento pós-geração detalhado** (o que foi gerado, tamanho real, como abrir/hospedar); copy Mora pt-BR, loading/erro honestos. Testes nos moldes de `test_publications.py` (fallback in-memory roda offline), abertura manual do ZIP via `file://` em Chrome/Firefox/Edge como gate final, rodada TestSprite. **Fecha o M6.**

## Decisões fechadas pelo Diretor (rebate 2026-06-11)

1. **Locus de geração:** o spike decide pelo **melhor** (sem dogma server-side) — mas a decisão e o porquê ficam **registrados no README e no `.speckit`** (plan/spec da fase) quando tomada.
2. **Fontes:** **woff2 embutido** em `/assets` — offline de verdade; ZIP maior é aceito. O caso "demo no avião" tem que funcionar com tipografia fiel.
3. **Escopo de versões:** **export por versão específica do histórico** (ação por card, ao lado de "Voltar pra esta") — não só a ativa.
4. **Handoff (screens-5.jsx):** os 3 pacotes (front flavors, back, banco), checksums e deploy commands **viram backlog formal** → [backlog_export_pacotes.md](backlog_export_pacotes.md). Fora desta fase.
5. **Truncamento:** **ambos** — aviso pré-geração na UI ("esta versão tem tabelas truncadas") **e** nota honesta no README/site exportado.
6. **UI:** **momento pós-geração detalhado** — o que foi gerado, tamanho real, como abrir e como hospedar. Não é só um botão.

## Riscos

- **Drift de renderer:** geração em Python = segunda implementação do PublicSite divergindo a cada mudança de theme/layout. O spike existe pra expor esse custo antes do compromisso.
- **Fidelidade tipográfica:** ~~risco aberto~~ mitigado por decisão — woff2 embutido garante identidade editorial offline. Risco residual: licença/peso das fontes (verificar no spike que as faces usadas permitem redistribuição embutida).
- **O ZIP congela mentiras:** datetime sem serializer e `total_rows` impreciso, toleráveis no site vivo (republicável), ficam permanentes num pacote que o usuário distribui — por isso hardening é marco, não follow-up.
- **Tamanho/memória:** 2000 rows × N tabelas inline pode dar MBs; geração síncrona no Railway precisa de streaming e medição no spike.
- **Gestão de expectativa:** o handoff promete 3 pacotes, checksums e deploy commands — a tela precisa comunicar o que existe vs o que não vem, sem prometer roadmap.
- **Vazamento entre workspaces:** a rota nova replica exatamente os guards existentes e deriva só do blob publicado (snapshot-não-live preservado).

## Critério de sucesso

Baixar um ZIP de uma versão publicada que, descompactado, abre com duplo-clique via `file://` em navegador limpo e reproduz fielmente o site público (layout, copy, tema; fontes conforme decisão). Pytest verde offline + TestSprite no fluxo exportar→baixar→abrir.

## Não-objetivos

- Pacotes Back-end (Node/FastAPI/Go), Banco (.sql/.db/schema-only) e flavors de front (Next.js, Nuxt) — **backlog formal** em [backlog_export_pacotes.md](backlog_export_pacotes.md), fora desta fase.
- Export de rascunho não publicado (violaria snapshot-não-live).
- Checksums sha-256, "Copiar URL", comandos de deploy, estimativa de tamanho pré-geração — também no backlog formal.
- Geração client-side no browser (já descartada; só com evidência do spike + aval do Diretor).
- Retenção/limpeza de snapshots no Storage — tema próprio, não bloqueia o ZIP.
- Deploy integrado, custom domains, analytics.
