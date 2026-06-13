# M7 — Spike de render: resultado e recomendação

> **Status: ✅ MARTELO BATIDO — candidato A (custom híbrido), Diretor, 2026-06-12.**
> Sobrevivem: este relatório + `frontend/src/lib/spikeFixtures.ts` + `frontend/src/lib/spikeLayout.ts` (base do PR2). Páginas `/spike/*`, harness e deps (`@xyflow/react`, `@dagrejs/dagre`) removidos no commit de limpeza — pra reproduzir as medições, fazer checkout do commit `20aadb9` desta branch.

## 1. O que foi construído

- **Fixtures determinísticas** no shape real de `TableResponse` (escala 10/30/60/100), com TODA a sujeira da seção 7 do plano: órfãs (~12%), FK pra `tabela_fantasma`, auto-referência, ciclo a→b→c→a, espelho DynamicRelation duplicando FK física, relação lógica pura e relação com column names NULL.
- **Auto-layout topológico custom** (`spikeLayout.ts`): camadas por profundidade de FK (longest-path, ciclos cortados via DFS), barycenter 3 passadas, órfãs em coluna à margem, fantasma como nó tracejado. Conta cruzamentos analiticamente. **Serve aos dois candidatos** — o que neutralizou o principal argumento pró-lib.
- **Nó compartilhado** (`SpikeTableNode`): Card/Eyebrow/Hairline/Pill, nome mono, PK pill accent, "FK → {tabela}", tipos em display itálico, clamp em 8 linhas ("+N colunas"). **Idêntico nos dois candidatos por construção.**
- **Candidato A** — custom híbrido: divs absolutas + overlay SVG (bezier), pan/zoom via transform CSS com zoom ancorado no cursor. ~140 linhas de página. Zero dep nova.
- **Candidato B** — `@xyflow/react` 12 + `@dagrejs/dagre`: nó custom = o MESMO SpikeTableNode (com 2 `Handle`s invisíveis exigidos pela engine), posições do nosso layout OU dagre (`?layout=dagre`).

## 2. Números (Playwright, Chrome headless, produção `next start`, viewport 1600×1000)

| Candidato | Escala | Mount | JS transferido | FPS (pan+zoom) | Long tasks | Cruzamentos | Export PNG | Erros console |
|---|---|---|---|---|---|---|---|---|
| A custom | 10 | 98ms | 255 KB | 60 | 0 | 0 | ok · 453ms | 0 |
| A custom | 30 | 115ms | 248 KB | 60 | 0 | **3** | ok · 621ms | 0 |
| A custom | 60 | 163ms | 255 KB | 60 | 0 | 13 | ok · 893ms | 0 |
| A custom | 100 | 162ms | 255 KB | 60 | 0 | 42 | ok · 1.27s | 0 |
| B xyflow | 10 | 100ms | 322 KB | 61 | 0 | 0 | ok · 544ms | 0 |
| B xyflow | 30 | 109ms | 314 KB | 60 | 0 | **3** | ok · 940ms | 0 |
| B xyflow | 60 | 103ms | 322 KB | 60 | 0 | 13 | ok · 1.59s | 0 |
| B xyflow | 100 | 105ms | 322 KB | 60 | 0 | 42 | ok · 2.44s | 0 |
| B + dagre | 30 | 152ms | 314 KB | 60 | 0 | 3* | ok · 839ms | 0 |

\* cruzamentos reportados pelo nosso contador (camadas do layout custom); o dagre tem qualidade visual comparável mas espalha mais na vertical, roteia edges mais longas, **não isola órfãs** e mistura o nó fantasma no fluxo (screenshot `b-dagre-30-light.png`).

**JS transferido** = transfer real comprimido (CDP `sizes()`), page-load completo. **Delta B−A: +60 a +67 KB gz** (inclui dagre; sem dagre, só xyflow, ≈ +50 KB).

## 3. Vereditos pelos 6 critérios

| # | Critério | A custom | B xyflow |
|---|---|---|---|
| 1 | Nó 100% Mora sem CSS da lib vazando | ✅ (nó nativo) | ✅ — nó idêntico por construção; única intrusão: 2 `Handle`s invisíveis e o CSS base global da lib (não vazou pro nó nos screenshots) |
| 2 | Pan/zoom sem jank a 30 e 100 nós | ✅ 60fps, 0 long tasks | ✅ 60fps, 0 long tasks |
| 3 | Cruzamentos na fixture de 30 | ✅ **3** (layout custom, usado por ambos) — sem spaghetti | ✅ idem; dagre ok porém pior em órfãs/fantasma |
| 4 | Compat React 19.2.4 + Next 16.2.1 sem patch | ✅ | ✅ build limpo, zero erros runtime |
| 5 | Delta de bundle ≤ ~60 KB gz | ✅ **0 KB** | ⚠️ **+60–67 KB** — no limite/acima do budget escrito |
| 6 | Export PNG viável com viewport transformado | ✅ off-screen clone, 0.45–1.27s | ✅ mesmo workaround, 0.5–2.4s a 100 nós |

Outros fatos: mount máximo observado **163ms a 100 tabelas** (budget do produto é 1.5s a 30 — folga de ~10×); `elkjs` 0.11.1 tem **8 MB unpacked** → descartado sem integração, como o plano previa; matriz light/dark validada nos dois candidatos (screenshots), tokens adaptam de graça.

## 4. Screenshots (em `frontend/spike-shots/`, copiados pra `planning/m7_spike_shots/`)

`a-30-{light,dark}.png` · `b-30-{light,dark}.png` · `b-dagre-30-light.png` · `referencia-admin-tables.png` (gramática Mora lado a lado: mono eyebrows, pills, hairlines — os nós dos dois candidatos pertencem à mesma família visual da tela de Tabelas).

Análise: A e B são **visualmente indistinguíveis** no nó (mesmo componente). No B as edges saem ancoradas nos Handles (centro vertical das bordas) — igual ao A. Dark mode: ambos herdam `--bg-elevated`/`--rule`/accent corretamente.

## 5. Recomendação: **Candidato A (custom híbrido)**

O spike neutralizou, um a um, os motivos de adotar a lib:

1. **Auto-layout**: o nosso topológico custom produziu 3 cruzamentos a 30 tabelas e é o que AMBOS os candidatos usam de melhor — o dagre da lib é pior pro nosso caso (órfãs, fantasma).
2. **Nó**: 100% nosso nos dois mundos.
3. **Perf**: empate técnico (60fps/0 long tasks em ambos, até 100 nós).
4. **Export**: mesmo workaround off-screen nos dois; A foi até mais rápido a 100 nós.
5. **Custo**: B carrega +60–67 KB gz (reprova o critério 5 como escrito), mais uma dependência pra rastrear compat a cada React/Next major — exatamente o tipo de risco que o frontend/AGENTS.md manda tratar com cautela.

O que o B compraria e o A terá que codar no PR3: drag de nó (~40 linhas sobre o pointer handler que o spike já tem), seleção/highlight (estado + classe), minimap (não está no escopo do M7). Gestos de trackpad/touch são o risco real do A — mitigado por ser canvas read-only e pelo princípio 6: **a engine fica encapsulada no `SchemaCanvas`**, então trocar pro xyflow depois, se a interação do PR3 doer, é cirurgia local, não reescrita.

**Contraponto honesto** (pro Diretor pesar): se o roadmap pós-M7 previr interação pesada no canvas (minimap, edge routing sofisticado, multi-seleção), o xyflow é a aposta mais segura de longo prazo e o runtime dele empatou. O que o reprova hoje é o budget de bundle e o custo de dependência — não qualidade.

## 6. O que sobrevive ao spike

- `frontend/src/lib/spikeFixtures.ts` → renomear pra fixture de teste do `schemaGraph` no PR2.
- `frontend/src/lib/spikeLayout.ts` → base real do `layout.ts` do PR2 (já tolerante a ciclo/fantasma/órfã/dedup).
- Este relatório. Páginas `/spike/*`, deps `@xyflow/react`/`@dagrejs/dagre` e o harness saem antes do PR2 (se a decisão for A, `npm uninstall` das duas).
