# 📝 Patch Notes

Registro de mudanças, novas funcionalidades e atualizações do sistema.

## Histórico

### **[26/03/2026] - Versão 1.0.0 (Base Release)**
Esta é a consolidação de todos os commits e desenvolvimentos anteriores ao estabelecimento da equipe.

- ✨ **Dynamic Table Engine**: Implementado sistema que traduz modelos do UI diretamente para DDL (SQLAlchemy) e cria tabelas físicas atreladas ao tenant.
- ✨ **Autenticação & QR Login**: Autenticação stateless via JWT. Implementado também login via escaneamento de QR Code (mobile-to-web).
- ✨ **Dashboard Dinâmico**: Widgets interativos (drag-and-drop) capazes de renderizar gráficos a partir das tabelas públicas. Suporte a exportação (PDF, XLSX).
- ✨ **Sistema de Theming Reativo**: 4 modos de brilho (Light, Dark, Dusk, Dawn) e 6 cores primárias utilizando variáveis CSS injetadas dinamicamente.
- ✨ **Multi-Tenancy Orgânico**: Isolamento de tabelas através de prefixos (`t<admin_id>_tabela`), com suporte a usuários Master, Admin e Moderadores.
- ✨ **Importação de Dados**: Rotas de parse para arquivos `.csv`, `.xlsx` e dumps de SQL (`.sql` contendo apenas `CREATE` e `INSERT`).

### **[26/03/2026] - Versão 1.1.0 (Milestone 1 - Estabilização e CRUD)**
Fechamento do primeiro pacote de manutenções e completude da arquitetura DDL gerada organicamente.

- 🐛 **Correção de Frontend App Router**: Adicionado `use client` nas páginas dependentes de state (`login/page.tsx`).
- 🐛 **Hotfix na API Pública**: Inclusão de conversão nativa (`String` via sqlalchemy) nas buscas globais e filtros.
- 🐛 **Resiliência do Test Engine**: Aplicação de `StaticPool` para o banco de dados em memória do `pytest`, garantindo isolamento confiável nas suítes de teste.
- ✨ **CRUD Data Engine Completo**: Os super-poderes dinâmicos agora contam com verbos `PUT` e `DELETE`.
  - **Backend**: Rotas encapsuladas para update seguro de registros.
  - **Frontend**: Data Tables em `/admin/data/[table]` expandidas com ações embutidas e modals transacionais (Editar e Excluir).
- 🧪 **Teste Automatizado de Auth Mobile**: Construção do fluxo 100% coberto pelo TestSprite garantindo segurança na validação de Tokens do QR Login.
