# Soberania / Bring Your Own Cloud (BYO) — ESQUELETO

> Status: **STUB / registrado 2026-07-22**, pedido do Diretor pra entrar no caminho do 1.0.
> Detalhamento ultracode (5 frentes + cético + crítico) ainda NÃO feito — fazer depois de bater a bifurcação abaixo.
> Numeração deliberadamente sem número (M10=realtime, M11=MCP já ocupados); Diretor posiciona depois.

## Pedido (Diretor, 2026-07-22)

Cliente loga com o **Vercel dele** e o **Supabase dele** e hospeda uma **cópia do BD e do site** na própria infra.
Diretor: "após avaliar bem acho que esse vai ser o **padrão dos nossos clientes**."

## Por que faz sentido pro mercado do Atlas

Instituições de memória/cultura (herança da IC de budismo, museu do Recôncavo) valorizam soberania de dado e
durabilidade institucional. Pitch: "seu acervo, sua infraestrutura, pra sempre, sem depender de nós".
É diferenciação real contra medo de morte-do-fornecedor.

## A BIFURCAÇÃO que decide tudo (bater ANTES de detalhar)

- **Eject (uma vez):** Atlas gera export Next + dump SQL pró-Supabase + deploy button Vercel, empurra 1x pra conta
  do cliente. Cliente vira dono; Atlas pode sair de cena. Barato.
  - Buraco: depois do eject, **quem edita?** Se cliente edita direto no Supabase dele, Atlas sai do circuito (perde
    o CMS). Se Atlas continua editando → não é eject, é managed.
- **Managed-contínuo:** Atlas continua sendo o editor/plano de controle; Supabase do cliente = BD vivo, Vercel do
  cliente = site vivo; Atlas escreve na infra do cliente a cada publish. É o que "padrão dos clientes" implica.
  - Custo: reconciliador de provisionamento + migração de frota + custódia de segredo + suporte de N ambientes.
    Trimestre+, não semana.

**Recomendação (Claude): eject primeiro** (entrega 80% do "sem lock-in" barato e honesto, e deixa clientes reais
dizerem se precisam de gestão contínua antes de construir o plano de controle). Managed = pós-1.0.

> **DECISÃO BATIDA (Diretor, 2026-07-22): EJECT-FIRST.** 1.0 entrega o eject; managed-contínuo vira milestone
> pós-1.0 (depois do M9, por causa da custódia de segredo). Detalhamento ultracode do eject = quando o Diretor puxar.

## Restrições load-bearing (já identificadas, não deduzidas do vácuo)

1. **Custódia de segredo em escala.** Escrever no Supabase/Vercel do cliente = guardar OAuth token ou service-key
   que apaga a conta cloud inteira do cliente. BYO **DEPENDE do M9** (encrypt-at-rest, rotação, audit, fix da
   master-key). Fazer BYO antes do M9 = cofre depois de distribuir as chaves. Sequência obrigatória: **M9 → BYO**.
2. **Migração de frota.** De 1 `alembic upgrade head` no deploy pra N Supabases (uns offline, uns em versão velha,
   uns que erraram). Lição BUG-PG02 (migration guardada/idempotente) vira sobrevivência. Não pode quebrar BD de cliente.
3. **Split de fonte-da-verdade (só no managed).** Metadado de control-plane (users/workspaces/versions) fica no BD do
   Atlas; CONTEÚDO do cliente vai pro Supabase dele. Rework da camada de dados.
4. **Realidade de tier (CONFIRMAR regras atuais antes de prometer):** Supabase free pausa por inatividade + limite de
   projetos ativos; Vercel Hobby = uso não-comercial. Cliente institucional em free-tier → site pausa sozinho, culpa
   cai no Atlas com menos controle pra consertar.
5. **Provisionamento é sistema distribuído com falha parcial.** criar/conectar projeto Supabase → migrar → seed →
   criar projeto Vercel → env vars → deploy → verificar. Cada passo falha no meio. Precisa reconciliador idempotente/
   resumível — é o mesmo problema do outbox durável do M9 F3, agora pra infra.

## A verificar antes do detalhamento (MEÇA, NÃO DEDUZA)

- Superfície real do **Supabase Management API + OAuth2 apps** (criar projeto, rodar migration, pegar connection string).
- Superfície real do **Vercel OAuth Integrations + REST + Deploy Button** (provisionar projeto/env em nome do usuário).
- Regras de free-tier atuais dos dois (pausa, limites, uso comercial).

## Aberto (detalhar fase-a-fase, depois de bater a bifurcação)

- Modelo de credencial (OAuth vs key colada) + onde guarda (cofre KMS-backed, não bcrypt).
- Onde vive a fonte-da-verdade no managed (split control-plane × conteúdo).
- Estratégia de migração de frota (reconciliador + estado por cliente + retry).
- Fluxo de eject (formato do export, dump, botão de deploy) se eject-first ganhar.
- Suporte/observabilidade de N ambientes (o Argus do mundo-Izii tem paralelo aqui).
