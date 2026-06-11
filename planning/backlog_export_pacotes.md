# Backlog — Export: pacotes além do site estático

> **Origem:** design handoff do M6 (`screens-5.jsx`, telas ExportReview/ExportedPackages) previa um export multi-pacote. O Diretor decidiu no rebate da Fase 5 (2026-06-11): a fase entrega **só o ZIP do site estático**; o resto vira este backlog formal. Sem milestone dona ainda — priorizar quando houver demanda real.

## Itens

1. **Pacote Front-end em flavors** — exportar o site como projeto Next.js ou Nuxt (não só HTML/CSS puro), pra quem quer evoluir o site fora do Atlas.
2. **Pacote Back-end** — scaffold de API (Node / FastAPI / Go) servindo os dados do snapshot.
3. **Pacote Banco** — dump `.sql` / `.db` / schema-only das tabelas publicadas.
4. **Checksums sha-256** dos pacotes gerados.
5. **"Copiar URL"** do site público direto da tela de export.
6. **Comandos de deploy** prontos (Vercel/Netlify/etc.) no pós-geração.
7. **Estimativa de tamanho pré-geração** do pacote.

## Notas

- A tela de export da Fase 5 deve comunicar honestamente o que existe vs o que não vem — sem prometer estes itens como roadmap.
- Itens 2 e 3 conflitam parcialmente com o posicionamento "headless CMS, não gerador de codebase" — rediscutir o fit de produto antes de priorizar.
