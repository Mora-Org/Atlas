# 🧠 O Coração do Projeto (Dynamic CMS Template)

Para garantir que estamos em total sincronia técnica, aqui está a "alma" arquitetural e o propósito do **Dynamic SQL Editor** (Dynamic CMS Template).

## 🚀 O Conceito Principal
Este projeto não é um CMS comum (como WordPress ou Strapi). Ele é um **Headless CMS com Motor de DDL Físico Dinâmico**.
A maioria das aplicações possui o modelo de dados amarrado no código (`models.py`, `prisma.schema`). Aqui, o projeto permite que o próprio administrador, através da interface do painel, visualize, desenhe e crie tabelas que são **imediatamente traduzidas e geradas no banco de dados físico da sua empresa.**

Se o cliente precisa de um sistema para "Catálogo de Peças", ele cria as colunas no painel, e o backend orquestra o SQLAlchemy para executar os comandos SQL brutos criando `tX_catalogo_pecas` imediatamente. E então, instantaneamente o sistema provê endpoints CRUD completos (`/admin/data/{table_name}`) sem precisarmos escrever uma única rota nova.

## 🛠️ Stack Tecnológico e Funções

**Frontend (A Interface e Experiência do Usuário):**
- **Next.js (App Router)**: Ponto focal das rotas e das views para admins (`/admin/*`) e para o público (`/dashboard`).
- **TailwindCSS + Framer Motion**: Cuidam da reatividade e de um sistema de temas inovador que suporta 4 modos de brilho (Dark, Light, Dusk, Dawn) multiplicados por 6 cores primárias (salvo em `localStorage` e reagido com CSS custom properties).
- **Dashboard Dinâmico Público**: Onde o ouro público está. Um mural interativo, drag-and-drop, exportável (PDF, XLSX) alimentado via as tabelas "publicadas" pelo painel.

**Backend (O Motor e a Segurança):**
- **FastAPI**: Assíncrono para velocidade e tipagem estrita com Pydantic (`schemas.py`).
- **SQLAlchemy (Core Engine)**: Ao invés de usar ORM tradicional, ele usa a MetaData API para criar tabelas dinamicamente, suportando restrições, chaves estrangeiras (`DynamicRelation`) e tipos fortes.
- **Multitenancy Orgânico**: Cada admin é isolado. Tabelas recebem o prefixo do ID do tenant (`t1_clientes`, `t2_clientes`). Moderadores do admin 1 não veem os dados do admin 2.
- **Autenticação**: Segurada fortemente via sub-sistema de JWT em `auth.py`.
- **Motor de Ingestão**: Pode importar dumps SQL brutos (desde que apenas sejam Creates e Inserts pra segurança usando `sqlparse`) além de planilhas de Excel/CSV embutidas usando pandas, atrelando as colunas do arquivo ao modelo recém-criado.

## O Que Nossa Equipe Preserva?
Como equipe, **não tocamos nos dados do usuário final**. Nós apenas mantemos a pista de corrida rodando o mais rápido e estável possível. Os maiores refatores sempre ocorrerão nas camadas de UI do Next.js, no parse/segurança das planilhas importadas, ou incrementando as lógicas de drag-and-drop do painel. Qualquer IA ou humano introduzido neste projeto no futuro deverá consultar também o `guide.md` e os arquivos desta pasta `planning`.
