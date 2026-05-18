# 📤 Milestone 6 — Publish & Export

> **Status:** 📋 Proposta
> **Vem depois de:** M5 fechado, M3 fechado (recomendado)
> **Tamanho relativo:** médio (entre M5 e M3)

Este documento existe pra **alinhar a visão**. Detalhes técnicos (schema exato, nomes de endpoint, libs específicas) são decididos na hora da implementação — não aqui.

---

## O problema

Hoje, "publicar" é apenas um toggle `is_public` por tabela. Quando esse toggle está ligado, a tabela aparece em `/explore` e em `/{slug}`. Pronto. Não existe:

- Curadoria — quais tabelas vão pro site, em que ordem, com qual destaque
- Tema próprio do site público (separado do admin)
- Versão / freeze — qualquer mudança no DB vaza pro público no mesmo segundo
- Histórico — não dá pra voltar pra "como o site estava semana passada"
- Exportação — não dá pra baixar o site como pacote estático

A página `/admin/publish` que existe hoje é mock visual com botões disabled marcados `// TODO(M6)`.

**Quem sente isso:** o admin que quer compartilhar o database como uma "publicação curada", não como um dump cru.

---

## O que essa milestone entrega

- Conceito de **publicação versionada**: snapshot estável do estado escolhido em um momento.
- **Theme Studio funcional**: presets visuais + ajustes (cor, tipografia) aplicados ao site público.
- **Seleção curada**: admin escolhe quais tabelas entram, em que ordem, com qual layout (lista, grid, ensaio).
- **Activate / rollback**: nova publish substitui a anterior; histórico permite voltar.
- **Export estático**: baixa um pacote (ZIP) que abre standalone — pra arquivo, demo offline, ou hospedar fora.

O site público sai do estado "live mirror do DB" pra "publicação editada", que é o que faz sentido pra Mora.

---

## Princípios invioláveis

1. **Snapshot, não live.** Mudança no admin não vaza pro público até "Publicar mudanças". Reduz surpresa, aumenta controle.
2. **Site público nunca cai porque o backend caiu.** Snapshot serve de cache se a API falhar.
3. **Tema do site é separado do tema do admin.** O admin escolhe um tema editorial pra ele trabalhar; o site público pode ter outro completamente diferente.
4. **Versão é imutável.** Uma vez publicada, aquela versão fica como está; mudanças geram nova versão.
5. **Workspace isolado.** Publicação de um workspace nunca vaza dados de outro (vale tudo que M3 já garante).

---

## Fases (alto nível, ordem)

| # | Marco | Por que precisa |
|---|---|---|
| 1 | Modelar publicação no backend | Sem dados persistidos, nada do resto funciona |
| 2 | Theme Studio frontend funcional | Mock atual vira real; preview ao vivo |
| 3 | Seletor de tabelas com layouts | Curadoria — coração da feature |
| 4 | Snapshot + activate + history + rollback | Versionamento real |
| 5 | Export estático | Caso de uso "arquivo / demo offline" |
| 6 | (Opcional) Subdomain routing | Se demanda real surgir, depois das 5 anteriores |

Cada fase é seu próprio PR. Entre fases, smoke manual antes de seguir.

---

## Decisões em aberto (perguntar ao Diretor na hora certa)

Estas são decisões que **vou levantar** durante a implementação, não decidir sozinho:

- **Onde mora o snapshot?** Filesystem do servidor / Supabase Storage / S3 / outro. Depende de como M3 ficou e de onde vamos hospedar.
- **Tabelas de sistema entram no site público?** Provavelmente não. Confirmar.

## Decisões Direcionais (Tomadas pelo Diretor)

- **Path-based ou subdomain?** (`atlas.app/{slug}` vs `{slug}.atlas.app`): Apenas será abordado/decidido na **Fase 6**. Até lá, usamos path-based como padrão.
- **Quantas versões guardar?** (Retenção de snapshots de histórico): Apenas será definido e tratado quando chegarmos na **Fase 4** (Snapshot/History).
- **Custom domain do cliente** (`centrobudista.com.br` apontando pro Atlas): Definitivamente **fora do escopo desta M6**.

---

## Riscos

- **Subdomain routing tem pegadinhas** em Vercel/Next 16 — wildcard rewrites funcionam, mas SSL e dev local pedem setup extra. Por isso é Fase 6 opcional.
- **Storage cresce.** Cada snapshot pode ter MBs. Política de retenção precisa ser clara.
- **Cache invalidation.** Quando publicar nova versão, os clientes que abriram a antiga continuam vendo? CDN cache? Precisa pensar no momento da Fase 4.

---

## Critério de sucesso (alto nível)

Admin consegue:

1. Selecionar 5 tabelas, escolher um preset visual, clicar "Publicar".
2. Abrir o link público e ver essas 5 tabelas com o tema aplicado, na ordem escolhida.
3. Mudar dados no admin sem que isso vaze pro público até nova "Publicar".
4. Voltar pra versão anterior em um clique.
5. Baixar um ZIP que abre como site estático em qualquer navegador.

Não-objetivos desta milestone (ficam pra outra hora):
- Edição colaborativa em tempo real
- Comments / engajamento no site público
- Analytics / tracking
- Custom domains do cliente
- Múltiplas publicações ativas em paralelo (A/B test)

---

## Dependências

- **Bloqueia:** nada.
- **Bloqueado por:** M5 (Theme Studio mock precisa virar real). M3 fortemente recomendado (sem isolamento físico, "publicar workspace X" continua sendo "filtrar prefixo no SQLite").
- **Sinergia com:** M9 (audit log de publish events), M3 (Storage natural).
