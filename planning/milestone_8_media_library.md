# M8 — Media Library + File Uploads

> **Status:** 🟡 DRAFT pra rebate (ultracode 2026-06-12) — NÃO executar. Decisões abertas pendentes do Diretor.
> Smells compartilhados do backend: inventariados no [plano do M-Ops](milestone_ops_observabilidade.md) (fonte única).

## O problema

O Atlas não tem nenhuma noção de mídia. O motor de tipos honra exatamente 5 (Integer, String, Boolean, DateTime, Float) com **fallback silencioso pra String** (dynamic_schema.py:23-31) — a UI de criação já oferece 7 opções (incluindo Date e Text, tables/create/page.tsx:91-97), e Date/Text também caem no fallback: a UI promete mais do que o motor honra. Não existe endpoint que aceite binário: os únicos uploads são .sql e .csv/.xlsx. O admin que quer foto de produto cria coluna String e cola URL do Imgur; o DataViewer trata como texto puro e o site público imprime a URL literal — `rowDisplay` reduz tudo a `String()` (frontend/src/components/publish/PublicSite.tsx:240-250). Zero render de imagem em qualquer lugar do produto.

A dor composta: o M6 vendeu site público + export "offline de verdade" (precedente woff2 — fontes embutidas no ZIP), mas um site com URLs externas entrega links quebrados sem internet e mídia hospedada em serviço de terceiro que pode sumir. É a milestone que o roadmap descreve como a que transforma os sites públicos de "tabela bonita" em "site de verdade" (roadmap.md:76).

## O que entrega

O admin cria coluna de tipo mídia, sobe o arquivo direto do DataViewer, vê thumbnail na grade, a imagem renderiza no site público e sobrevive ao export estático conforme a decisão de empacotamento do rebate. Cada arquivo tem dono, tenant e ciclo de vida — deletar registro/tabela/admin limpa o storage — com limites e validação definidos. Nada nasce do zero conceitual: o padrão bucket + path determinístico por owner + cleanup já está provado em `publication_storage.py` (JSON-only hoje) e o cliente admin do Supabase existe; o M8 estende esse padrão de JSON pra binário.

## Fases

| Fase | Entrega |
|---|---|
| **F1 — Fundação de mídia no backend** | Tipo novo no motor DDL + validação, caminho de upload/ciclo de vida com dono e tenant (padrão do publication_storage). Delete em cascata (row/tabela/admin) desde o início — arquivo órfão é custo e risco. Storage concreto, limites e modelo de URL vêm do rebate. |
| **F2 — Upload e render no DataViewer** | renderField/displayValue ganham o caso mídia: widget de upload na célula (precedente FormData do import CSV), thumbnail/preview na grade, tipo novo na criação de coluna. **Só inicia após F1+F3 do M-Ops** (ordem dura: mesmo DataViewer, mesmo Storage). |
| **F3 — Mídia no público, snapshot e export** | PublicSite renderiza imagem nos 3 contextos (Studio client, RSC público, renderToStaticMarkup do export). O snapshot evolui pra referenciar mídia com **compromisso de evolução aditiva e versionada**: todo snapshot schema_version:1 já publicado continua renderizando, e o esquema de versionamento é desenhado pra o M8.5 adicionar o tipo de conteúdo dele sem novo redesign. **Inclui resolver o payload real do preview do Studio** (hoje renderiza com `tables={[]}`, PublishStudio.tsx:233 — pendência PR4b herdada do M6): mídia sem preview no Studio não fecha a fase. ZIP empacota conforme a decisão embutir-vs-referenciar. |
| **F4 — Hardening + gate** | Validação de tipo/tamanho no servidor, limites aplicados, cleanup verificado por teste, gate Playwright padrão (matriz 2×4, budgets, console errors = fail). Jurisprudência M6 F5: hardening é marco, não follow-up. |

## Dependências

- **M-Ops** — ordem dura: **F1 (keep-alive/upgrade) e F3 (paginação+DataViewer) do M-Ops fecham antes da F2 daqui**; CI e segredos podem correr junto. O pause do Supabase congela o projeto inteiro (Storage incluso — comportamento documentado do free tier, confirmar no kickoff): mídia servida do Storage herda o incidente de 2026-06-11.
- **M3 fechado** — Supabase com Storage em uso (bucket `public-snapshots`) e cliente admin pronto (supabase_admin.py:31-41). Provisioning de bucket hoje é manual no dashboard (zero `create_bucket` no repo) — o bucket de mídia repete o problema se nada mudar.
- **M7 PR4 pausado** é a primeira execução da volta — o M8 não atropela.

## Riscos

- ZIP de export pode crescer ordens de magnitude acima do precedente woff2 (centenas de KB → centenas de MB de galeria). "ZIP maior é aceito" foi decidido pra fontes, não pra fotos — extrapolar sem rebater é armadilha.
- Upload de binário abre superfície nova (content-type forjado, arquivo malicioso servido do nosso bucket) num backend que roda mudo até o M-Ops entregar.
- Isolamento no Storage é por convenção de path, não RLS (diferente do Postgres) — o guard de tenant em upload/download é 100% do backend.
- Evolução do snapshot precisa sobreviver aos 3 contextos de render — quebrar um quebra produto publicado.
- Lib nova de processamento de imagem (se thumbnail pedir) → spike medido antes, jurisprudência M7.

## Decisões abertas

1. **Storage backend:** Supabase Storage (caminho natural: cliente pronto, padrão provado, zero dep nova — mas herda o free tier e amarra ao provedor do banco), S3-compatible externo (desacopla, ao custo de conta/SDK/ops novos), ou disco local (descartável: Railway sem volume declarado — filesystem não é durável). Condiciona a F1 inteira.
2. **Mídia no export ZIP:** embutir (precedente woff2, offline de verdade), referenciar por URL (quebra o offline), ou híbrido com teto (embutir até X MB + nota honesta no artefato)? O Diretor define o X e aceita (ou não) a complexidade.
3. **URLs de mídia:** bucket público (simples, cacheável — mas qualquer um com a URL acessa mídia de qualquer tenant pra sempre, mesmo de tabela nunca publicada) ou assinadas (controle — mas expiração conflita com snapshot congelado e export estático)? Caminho misto dobra o modelo. Preciso da régua de privacidade do Diretor antes de desenhar.
4. **O "Media Library" do título existe no M8?** Arquivo acoplado à célula (vive e morre com o registro, ciclo trivial) vs biblioteca central por workspace (subir uma vez, reusar em N registros — exige noção de asset com referências). Proposta: M8 entrega célula; biblioteca vira fase final ou M8.x se a dor aparecer. Se o Diretor quer biblioteca já, o tamanho da milestone muda.
5. **Tipos na v1:** só imagem (valor visível: thumbnail, site público) ou image/file/attachment como o roadmap lista? E: 3 tipos no motor ou 1 tipo mídia com comportamento por MIME? Junto: limite por arquivo e quota por workspace (hoje não existe limite de nada).
6. **Thumbnails:** backend gera no upload (dep nova → spike), transformação do provedor (acopla, pode ser plano pago), browser redimensiona antes de subir (zero dep, confia no cliente), ou v1 serve original com CSS e adia thumbnail real? O roadmap lista "thumbnail generator" — cortar precisa ser decisão explícita.

## Fatos-âncora

- Motor: 5 tipos honrados + fallback silencioso pra String (dynamic_schema.py:23-31); UI oferece 7 (create/page.tsx:91-97); `data_type` é string livre sem validação (schemas.py:71).
- Zero endpoint de binário; uploads existentes: .sql (main.py:1025-1140), .csv/.xlsx (main.py:1147-1208) — precedente FormData no front (admin/import/data/page.tsx:43-63,151).
- Storage provado JSON-only: bucket `public-snapshots`, path `{owner_id}/v{N}.json`, upsert, cleanup por owner chamado no delete de admin (publication_storage.py:43-143; main.py:197).
- PublicSite renderiza em 3 contextos inclusive renderToStaticMarkup (frontend/src/components/publish/PublicSite.tsx:1-5; exportStatic.tsx:123,134); rowDisplay = String() (PublicSite.tsx:240-250).
- Snapshot schema_version:1 = columns+rows, sem conceito de asset; truncamento MAX_ROWS=2000 (publication_storage.py:44).
- Export ZIP via JSZip com woff2 embutido (exportStatic.tsx:82-116, 232-253); precedente registrado em milestone_6_fase5_export_plano.md:30-31.
- Compromissos do roadmap: tipos novos + storage + thumbnails + UI upload; mídia no snapshot/export; Supabase Storage caminho natural (roadmap.md:75-78).

## Não-objetivos

- Gráficos/blocos/layout do público além do render de mídia — M8.5 (a evolução do snapshot daqui só abre caminho, não antecipa).
- Paginação, CI, error tracking, keep-alive — M-Ops; o M8 depende, não absorve.
- Audit de uploads e webhook de evento de mídia — M9 (já listados lá).
- Realtime de qualquer espécie — M10.
- Editor de imagem, CDN dedicada, otimização avançada — backlog se houver demanda.
- Migração automática de colunas String com URLs externas pro tipo novo — admin recria; se doer em uso real, vira follow-up discutido.
- Itens do backlog_export_pacotes.md continuam sem dona — a mídia no ZIP não os puxa.
