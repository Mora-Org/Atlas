# Spec — M6 Fase 5: Export Estático

> **Plano de origem:** [planning/milestone_6_fase5_export_plano.md](../../planning/milestone_6_fase5_export_plano.md) (decisões fechadas no rebate de 2026-06-11)
> **Status:** 🔵 em execução — Marco 1 (spike) concluído

---

## Decisão registrada — Locus de geração do HTML (2026-06-11)

**Decisão do Diretor:** geração no **lado Next.js**, reusando o componente `PublicSite`. A diretriz anterior de geração server-side no backend Python foi abandonada com base na evidência do spike.

**Evidência (Marco 1, `frontend/scripts/export-spike.tsx`):**

| Métrica | Resultado |
|---|---|
| Render do `PublicSite` via `renderToStaticMarkup` | funcionou **sem nenhuma modificação** no componente (`onCopyEdit` undefined → estático) |
| HTML standalone (3 layouts, amostra) | 15.7 KB, **zero `<script>`**, abre via `file://` |
| Stress 2000 rows × 3 tabelas (teto do `MAX_ROWS_PER_TABLE`) | 3.3 MB de HTML, gerado em <4s |
| Fontes woff2 embutidas (Fraunces, IBM Plex Serif, IBM Plex Mono) | 18 arquivos, 225 KB, reescritas pra `./assets/fonts/` — licença OFL permite redistribuição |

**Por que não Python:** o renderer tem ~430 linhas de TSX com inline styles; uma reimplementação Jinja seria uma segunda fonte de verdade visual, divergindo a cada mudança de tema/layout. Custo estrutural permanente vs. ~80 linhas de shell no lado Next.

**Trade-off aceito:** a geração do pacote vive no frontend (route handler Next), que precisa buscar o snapshot no backend com o token do usuário. O backend continua dono dos dados e guards; o Next vira só o "renderizador + empacotador".

---

## Restrições fechadas (do plano)

- Dados inline no HTML (`file://` bloqueia fetch local) — JSON no ZIP é artefato, não dependência
- Zero JS de runtime no site exportado
- ZIP on-demand, streamado, nada persistido no Storage
- Fontes woff2 embutidas em `/assets` (offline real — decisão #2)
- Export por versão específica do histórico (decisão #3)
- Aviso de truncamento pré-geração na UI + nota no README do ZIP (decisão #5)
- Pós-geração detalhado: o que foi gerado, tamanho, como abrir/hospedar (decisão #6)

## Marcos

1. ✅ **Spike do HTML standalone** — concluído 2026-06-11 (esta decisão)
2. ✅ **Fundação no backend** — concluído 2026-06-11: `GET /api/publications/me/versions/{id}/snapshot` (mesmos guards; 502 pra blob órfão), `json.dumps` com `default=` (datetime/date/Decimal/UUID/bytes), `total_rows` real via `COUNT` quando truncated. Suite 66 passed / 6 skipped.
3. 🔲 **Empacotamento e download** — ZIP on-demand streamado (index.html + assets/fonts + snapshot.json + README)
4. 🔲 **UI + validação** — ação por card no histórico, avisos, pós-geração, testes + TestSprite. Fecha o M6.
