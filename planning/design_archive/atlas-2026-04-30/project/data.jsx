/* Atlas — Mock workspace data
   Two example workspaces, both academic in tone:
   - centrobudista: federation of Buddhist temples
   - biblioteca:    university research library
*/

// ─────────────────────────────────────────────────────────────────────────────
//  WORKSPACE 1 — Centro Budista
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACES = {
  centrobudista: {
    id: "centrobudista",
    name: "Centro Budista do Brasil",
    slug: "centro-budista",
    edition: "edição Outono",
    founded: 2018,
    city: "São Paulo",
    publicTitle: "Pesquise o budismo brasileiro.",
    publicSub: "Templos, linhagens, mestres e eventos — atualizado em tempo real pela federação.",
    publicEyebrow: "Acervo público · 47 templos · 6 linhagens",
    primaryTable: "templos",
    primaryNoun: "templo",
    primaryNounPlural: "templos",
    user: { name: "Tereza Hashimoto", role: "admin", initials: "TH", email: "tereza@centrobudista.org" },
  },
  biblioteca: {
    id: "biblioteca",
    name: "Biblioteca Padre Anchieta · USP",
    slug: "biblioteca-anchieta",
    edition: "catálogo 2026.1",
    founded: 1934,
    city: "São Paulo",
    publicTitle: "O acervo, aberto.",
    publicSub: "Livros, periódicos, teses e manuscritos — pesquise por autor, assunto, ano ou coleção.",
    publicEyebrow: "Acervo público · 84.231 obras · 6 coleções especiais",
    primaryTable: "obras",
    primaryNoun: "obra",
    primaryNounPlural: "obras",
    user: { name: "Helena Marques", role: "admin", initials: "HM", email: "helena@biblioteca.usp.br" },
  },
  igreja: {
    id: "igreja",
    name: "Igreja Presbiteriana de São Paulo",
    slug: "ipsp",
    edition: "boletim semanal",
    founded: 1888,
    city: "São Paulo",
    publicTitle: "A vida da igreja, aberta.",
    publicSub: "Congregações, pastores, agenda de cultos, estudos bíblicos e ministérios — atualizado pelo presbitério.",
    publicEyebrow: "Acervo público · 38 igrejas · 4 presbitérios",
    primaryTable: "igrejas",
    primaryNoun: "igreja",
    primaryNounPlural: "igrejas",
    user: { name: "Pedro Rabelo", role: "admin", initials: "PR", email: "pedro@ipsp.org.br" },
  },
};

// Default — reassigned at runtime by setActiveWorkspace()
var WORKSPACE = WORKSPACES.centrobudista;

// ─────────────────────────────────────────────────────────────────────────────
//  CENTRO BUDISTA — tables, columns, rows
// ─────────────────────────────────────────────────────────────────────────────

const TABLES_CENTROBUDISTA = [
  { id: 1, name: "templos",        label: "Templos",        count: 47,   group: "Comunidade", updated: "há 2 horas",  isPublic: true,  description: "Templos e centros de prática registrados na federação.", accentTone: "goldenrod" },
  { id: 2, name: "associacoes",    label: "Associações",    count: 23,   group: "Comunidade", updated: "ontem",       isPublic: true,  description: "Associações filiadas e afiliadas regionais.", accentTone: "sage" },
  { id: 3, name: "personalidades", label: "Personalidades", count: 312,  group: "Acervo",     updated: "há 4 dias",   isPublic: true,  description: "Mestres, monjas, leigos e figuras históricas do budismo brasileiro." },
  { id: 4, name: "produtos",       label: "Produtos",       count: 184,  group: "Loja",       updated: "há 6 dias",   isPublic: false, description: "Catálogo da loja: livros, incensos, mālās, kimonos." },
  { id: 5, name: "eventos",        label: "Eventos",        count: 89,   group: "Comunidade", updated: "há 1 semana", isPublic: true,  description: "Retiros, sesshins, palestras e cerimônias agendadas." },
  { id: 6, name: "linhagens",      label: "Linhagens",      count: 14,   group: "Acervo",     updated: "há 2 semanas",isPublic: true,  description: "Tradições — Zen Sōtō, Rinzai, Theravada, Vajrayana, Terra Pura." },
  { id: 7, name: "clientes",       label: "Clientes",       count: 1432, group: "Loja",       updated: "hoje",        isPublic: false, description: "Cadastro da loja virtual." },
  { id: 8, name: "doacoes",        label: "Doações",        count: 567,  group: "Operações",  updated: "ontem",       isPublic: false, description: "Registro de doações financeiras e de bens." },
];

const TEMPLOS_COLUMNS_ORIG = [
  { id: 1, name: "id",          type: "integer", required: true, unique: true,  pk: true,  fk: null },
  { id: 2, name: "nome",        type: "string",  required: true, unique: false, pk: false, fk: null },
  { id: 3, name: "linhagem_id", type: "fk",      required: true, unique: false, pk: false, fk: { table: "linhagens", column: "id" } },
  { id: 4, name: "cidade",      type: "string",  required: true, unique: false, pk: false, fk: null },
  { id: 5, name: "fundado_em",  type: "date",    required: false, unique: false, pk: false, fk: null },
  { id: 6, name: "abade_id",    type: "fk",      required: false, unique: false, pk: false, fk: { table: "personalidades", column: "id" } },
  { id: 7, name: "aberto_publico", type: "boolean", required: false, unique: false, pk: false, fk: null },
];

const TEMPLOS_DATA_ORIG = [
  { id: 1, nome: "Templo Busshinji",            linhagem: "Zen Sōtō",       linhagem_id: 1,  cidade: "São Paulo, SP",       fundado_em: "1955-08-12", abade: "Coen Murayama",        abade_id: 12,  aberto_publico: true,  registros: 14 },
  { id: 2, nome: "Mosteiro Zen Pico de Raios",  linhagem: "Zen Sōtō",       linhagem_id: 1,  cidade: "Ibiraçu, ES",         fundado_em: "1995-03-21", abade: "Cristiano Bitti",      abade_id: 87,  aberto_publico: true,  registros: 22 },
  { id: 3, nome: "Templo Honpa Honganji",       linhagem: "Terra Pura",      linhagem_id: 5,  cidade: "São Paulo, SP",       fundado_em: "1953-04-30", abade: "Kakei Nakagawa",       abade_id: 41,  aberto_publico: true,  registros: 8 },
  { id: 4, nome: "Centro Shambala",             linhagem: "Vajrayana",       linhagem_id: 4,  cidade: "Rio de Janeiro, RJ",  fundado_em: "1988-11-04", abade: "Dorje Rangsar",        abade_id: 198, aberto_publico: true,  registros: 19 },
  { id: 5, nome: "Templo Hokkein-ji",           linhagem: "Nichiren",        linhagem_id: 6,  cidade: "Curitiba, PR",        fundado_em: "1972-06-18", abade: "Tetsuro Mori",         abade_id: 56,  aberto_publico: true,  registros: 5 },
  { id: 6, nome: "Mosteiro Chagdud Gonpa Khadro Ling", linhagem: "Vajrayana", linhagem_id: 4, cidade: "Três Coroas, RS",     fundado_em: "1994-09-01", abade: "Lama Padma",           abade_id: 111, aberto_publico: true,  registros: 31 },
  { id: 7, nome: "Sociedade Bodhgaya",          linhagem: "Theravada",       linhagem_id: 3,  cidade: "Florianópolis, SC",   fundado_em: "2002-02-14", abade: null,                   abade_id: null, aberto_publico: true, registros: 11 },
  { id: 8, nome: "Centro Rinzai-ji",            linhagem: "Zen Rinzai",      linhagem_id: 2,  cidade: "Belo Horizonte, MG",  fundado_em: "1981-10-03", abade: "Rōshi Kenshō",         abade_id: 76,  aberto_publico: false, registros: 4 },
  { id: 9, nome: "Templo Kōshōji",              linhagem: "Zen Sōtō",       linhagem_id: 1,  cidade: "Brasília, DF",        fundado_em: "1968-07-22", abade: "Sōkō Yamashita",       abade_id: 23,  aberto_publico: true,  registros: 9 },
  { id: 10, nome: "Casa de Dharma Mente Aberta",linhagem: "Vajrayana",       linhagem_id: 4,  cidade: "Salvador, BA",        fundado_em: "2010-05-15", abade: "Kunzang Dorje",        abade_id: 145, aberto_publico: true,  registros: 6 },
  { id: 11, nome: "Templo Jōdo Shinshū",        linhagem: "Terra Pura",      linhagem_id: 5,  cidade: "Maringá, PR",         fundado_em: "1962-12-03", abade: "Eishō Tanaka",         abade_id: 92,  aberto_publico: true,  registros: 7 },
  { id: 12, nome: "Sangha do Sul",              linhagem: "Theravada",       linhagem_id: 3,  cidade: "Porto Alegre, RS",    fundado_em: "2015-08-09", abade: null,                   abade_id: null, aberto_publico: true, registros: 3 },
];

const LINHAGENS_ORIG = [
  { id: 1, name: "Zen Sōtō" }, { id: 2, name: "Zen Rinzai" }, { id: 3, name: "Theravada" },
  { id: 4, name: "Vajrayana" }, { id: 5, name: "Terra Pura" }, { id: 6, name: "Nichiren" },
];

const PERSONALIDADES_SAMPLE_ORIG = [
  { id: 12, nome: "Coen Murayama" }, { id: 87, nome: "Cristiano Bitti" },
  { id: 41, nome: "Kakei Nakagawa" }, { id: 198, nome: "Dorje Rangsar" },
  { id: 56, nome: "Tetsuro Mori" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  BIBLIOTECA — tables, columns, rows
// ─────────────────────────────────────────────────────────────────────────────

const TABLES_BIBLIOTECA = [
  { id: 1, name: "obras",          label: "Obras",          count: 84231, group: "Acervo",       updated: "agora",       isPublic: true,  description: "Livros, monografias e e-books catalogados.", accentTone: "goldenrod" },
  { id: 2, name: "autores",        label: "Autores",        count: 23847, group: "Acervo",       updated: "há 1 hora",   isPublic: true,  description: "Autoridades — pessoas físicas, coletivas e pseudônimos.", accentTone: "sage" },
  { id: 3, name: "periodicos",     label: "Periódicos",     count: 1284,  group: "Acervo",       updated: "há 4 horas",  isPublic: true,  description: "Revistas científicas, magazines e séries periódicas." },
  { id: 4, name: "teses",          label: "Teses & Dissertações", count: 12492, group: "Acervo", updated: "ontem",      isPublic: true,  description: "Teses de doutorado, dissertações de mestrado e TCCs depositados." },
  { id: 5, name: "colecoes",       label: "Coleções especiais", count: 6, group: "Acervo",       updated: "há 2 semanas",isPublic: true,  description: "Coleções fechadas — Manuscritos, Obras Raras, Cartografia, Fotografia, Música, Arquivo Pessoal." },
  { id: 6, name: "emprestimos",    label: "Empréstimos",    count: 8421,  group: "Circulação",   updated: "agora",       isPublic: false, description: "Histórico e estado atual dos empréstimos." },
  { id: 7, name: "leitores",       label: "Leitores",       count: 19384, group: "Circulação",   updated: "hoje",        isPublic: false, description: "Cadastro de alunos, professores e visitantes externos." },
  { id: 8, name: "reservas",       label: "Reservas",       count: 1287,  group: "Circulação",   updated: "há 30 min",   isPublic: false, description: "Filas de reserva por exemplar." },
  { id: 9, name: "citacoes",       label: "Citações",       count: 47281, group: "Pesquisa",     updated: "há 3 dias",   isPublic: true,  description: "Grafo de citações entre obras catalogadas." },
];

const OBRAS_COLUMNS = [
  { id: 1, name: "id",            type: "integer", required: true,  unique: true,  pk: true,  fk: null },
  { id: 2, name: "titulo",        type: "string",  required: true,  unique: false, pk: false, fk: null },
  { id: 3, name: "autor_id",      type: "fk",      required: true,  unique: false, pk: false, fk: { table: "autores", column: "id" } },
  { id: 4, name: "ano",           type: "integer", required: true,  unique: false, pk: false, fk: null },
  { id: 5, name: "editora",       type: "string",  required: false, unique: false, pk: false, fk: null },
  { id: 6, name: "isbn",          type: "string",  required: false, unique: true,  pk: false, fk: null },
  { id: 7, name: "colecao_id",    type: "fk",      required: false, unique: false, pk: false, fk: { table: "colecoes", column: "id" } },
  { id: 8, name: "disponivel",    type: "boolean", required: true,  unique: false, pk: false, fk: null },
];

// "obras" rows — shaped to mirror TEMPLOS_DATA so PublicSite can render generically
const OBRAS_DATA = [
  { id: 1,  nome: "Macunaíma",                                                  linhagem: "Modernismo brasileiro", linhagem_id: 1, cidade: "Estabelecimento Gráfico Eugenio Cupolo · São Paulo", fundado_em: "1928-07-01", abade: "Mário de Andrade",      abade_id: 14,  aberto_publico: true,  registros: 412 },
  { id: 2,  nome: "Grande Sertão: Veredas",                                     linhagem: "Regionalismo",          linhagem_id: 2, cidade: "José Olympio · Rio de Janeiro",                       fundado_em: "1956-05-10", abade: "João Guimarães Rosa",  abade_id: 21,  aberto_publico: true,  registros: 1843 },
  { id: 3,  nome: "Memórias Póstumas de Brás Cubas",                            linhagem: "Realismo",              linhagem_id: 3, cidade: "Tipografia Nacional · Rio de Janeiro",                fundado_em: "1881-03-15", abade: "Machado de Assis",     abade_id: 8,   aberto_publico: true,  registros: 2104 },
  { id: 4,  nome: "Vidas Secas",                                                linhagem: "Regionalismo",          linhagem_id: 2, cidade: "José Olympio · Rio de Janeiro",                       fundado_em: "1938-02-20", abade: "Graciliano Ramos",     abade_id: 32,  aberto_publico: true,  registros: 967 },
  { id: 5,  nome: "A Hora da Estrela",                                          linhagem: "Modernismo brasileiro", linhagem_id: 1, cidade: "José Olympio · Rio de Janeiro",                       fundado_em: "1977-10-13", abade: "Clarice Lispector",    abade_id: 47,  aberto_publico: true,  registros: 1421 },
  { id: 6,  nome: "Casa-Grande & Senzala",                                      linhagem: "Sociologia",            linhagem_id: 4, cidade: "Maia & Schmidt Editores · Rio de Janeiro",            fundado_em: "1933-12-01", abade: "Gilberto Freyre",      abade_id: 19,  aberto_publico: true,  registros: 882 },
  { id: 7,  nome: "Raízes do Brasil",                                           linhagem: "Sociologia",            linhagem_id: 4, cidade: "José Olympio · Rio de Janeiro",                       fundado_em: "1936-08-03", abade: "Sérgio Buarque de Holanda", abade_id: 27, aberto_publico: true, registros: 1184 },
  { id: 8,  nome: "Pedagogia do Oprimido",                                      linhagem: "Educação crítica",      linhagem_id: 5, cidade: "Paz e Terra · Rio de Janeiro",                        fundado_em: "1968-07-15", abade: "Paulo Freire",         abade_id: 11,  aberto_publico: true,  registros: 3247 },
  { id: 9,  nome: "Os Sertões",                                                 linhagem: "Não-ficção",            linhagem_id: 6, cidade: "Laemmert & Co. · Rio de Janeiro",                     fundado_em: "1902-01-01", abade: "Euclides da Cunha",    abade_id: 39,  aberto_publico: true,  registros: 654 },
  { id: 10, nome: "Capitães da Areia",                                          linhagem: "Regionalismo",          linhagem_id: 2, cidade: "José Olympio · Rio de Janeiro",                       fundado_em: "1937-09-09", abade: "Jorge Amado",          abade_id: 18,  aberto_publico: true,  registros: 1087 },
  { id: 11, nome: "Quarto de Despejo: Diário de uma Favelada",                  linhagem: "Literatura-testemunho", linhagem_id: 7, cidade: "Francisco Alves · São Paulo",                          fundado_em: "1960-08-10", abade: "Carolina Maria de Jesus", abade_id: 52, aberto_publico: true, registros: 521 },
  { id: 12, nome: "Pequena Memória para um Tempo sem Memória",                  linhagem: "Ensaio",                linhagem_id: 8, cidade: "Companhia das Letras · São Paulo",                    fundado_em: "1989-04-22", abade: "Lélia Gonzalez",       abade_id: 64,  aberto_publico: true,  registros: 213 },
];

const ASSUNTOS = [
  { id: 1, name: "Modernismo brasileiro" }, { id: 2, name: "Regionalismo" },
  { id: 3, name: "Realismo" },               { id: 4, name: "Sociologia" },
  { id: 5, name: "Educação crítica" },       { id: 6, name: "Não-ficção" },
  { id: 7, name: "Literatura-testemunho" },  { id: 8, name: "Ensaio" },
];

const AUTORES_SAMPLE = [
  { id: 8,  nome: "Machado de Assis" },    { id: 11, nome: "Paulo Freire" },
  { id: 14, nome: "Mário de Andrade" },    { id: 21, nome: "João Guimarães Rosa" },
  { id: 47, nome: "Clarice Lispector" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  IGREJA PRESBITERIANA — tables, columns, rows
// ─────────────────────────────────────────────────────────────────────────────

const TABLES_IGREJA = [
  { id: 1, name: "igrejas",        label: "Igrejas",        count: 38,   group: "Comunidade",   updated: "agora",        isPublic: true,  description: "Igrejas locais e congregações filiadas ao presbitério.", accentTone: "goldenrod" },
  { id: 2, name: "pastores",       label: "Pastores",       count: 64,   group: "Comunidade",   updated: "ontem",        isPublic: true,  description: "Pastores ordenados, licenciados e em formação.", accentTone: "sage" },
  { id: 3, name: "ministerios",    label: "Ministérios",    count: 21,   group: "Comunidade",   updated: "há 3 dias",    isPublic: true,  description: "Ministérios de ensino, música, missões, juventude e diaconia." },
  { id: 4, name: "cultos",         label: "Cultos & estudos", count: 412, group: "Agenda",     updated: "agora",        isPublic: true,  description: "Cultos dominicais, estudos bíblicos, oração e cerimônias especiais." },
  { id: 5, name: "membros",        label: "Membros",        count: 4283, group: "Comunidade",   updated: "hoje",         isPublic: false, description: "Cadastro pastoral — membros comungantes, não-comungantes e visitantes." },
  { id: 6, name: "presbiterios",   label: "Presbitérios",   count: 4,    group: "Federação",    updated: "há 1 mês",     isPublic: true,  description: "Presbitérios — Capital, Vale, Litoral e Interior." },
  { id: 7, name: "ofertas",        label: "Ofertas & dízimos", count: 1894, group: "Operações", updated: "ontem",        isPublic: false, description: "Registro contábil de ofertas, dízimos e campanhas." },
  { id: 8, name: "boletins",       label: "Boletins",       count: 156,  group: "Acervo",       updated: "há 2 horas",   isPublic: true,  description: "Boletins semanais e cartas pastorais publicados." },
];

const IGREJAS_COLUMNS = [
  { id: 1, name: "id",            type: "integer", required: true,  unique: true,  pk: true,  fk: null },
  { id: 2, name: "nome",          type: "string",  required: true,  unique: false, pk: false, fk: null },
  { id: 3, name: "presbiterio_id", type: "fk",     required: true,  unique: false, pk: false, fk: { table: "presbiterios", column: "id" } },
  { id: 4, name: "cidade",        type: "string",  required: true,  unique: false, pk: false, fk: null },
  { id: 5, name: "fundada_em",    type: "date",    required: false, unique: false, pk: false, fk: null },
  { id: 6, name: "pastor_id",     type: "fk",      required: false, unique: false, pk: false, fk: { table: "pastores", column: "id" } },
  { id: 7, name: "aberta_publico", type: "boolean", required: false, unique: false, pk: false, fk: null },
];

// "igrejas" rows — mirrors TEMPLOS_DATA shape so generic screens just work
const IGREJAS_DATA = [
  { id: 1,  nome: "Igreja Presbiteriana Catedral de São Paulo", linhagem: "Presbitério Capital", linhagem_id: 1, cidade: "São Paulo, SP",         fundado_em: "1888-04-08", abade: "Rev. Augusto Nicodemus", abade_id: 7,   aberto_publico: true,  registros: 1287 },
  { id: 2,  nome: "Igreja Presbiteriana de Pinheiros",           linhagem: "Presbitério Capital", linhagem_id: 1, cidade: "São Paulo, SP",         fundado_em: "1923-09-21", abade: "Rev. Solano Portela",     abade_id: 14,  aberto_publico: true,  registros: 894 },
  { id: 3,  nome: "Igreja Presbiteriana de Santo Amaro",         linhagem: "Presbitério Capital", linhagem_id: 1, cidade: "São Paulo, SP",         fundado_em: "1942-11-04", abade: "Rev. Hernandes Dias Lopes", abade_id: 21, aberto_publico: true, registros: 612 },
  { id: 4,  nome: "Igreja Presbiteriana de Campinas",            linhagem: "Presbitério Interior", linhagem_id: 4, cidade: "Campinas, SP",         fundado_em: "1908-06-15", abade: "Rev. Jonas Madureira",     abade_id: 33,  aberto_publico: true,  registros: 478 },
  { id: 5,  nome: "Igreja Presbiteriana de São José dos Campos", linhagem: "Presbitério Vale",     linhagem_id: 2, cidade: "São José dos Campos, SP", fundado_em: "1965-02-18", abade: "Rev. Marcos André",      abade_id: 41,  aberto_publico: true,  registros: 392 },
  { id: 6,  nome: "Igreja Presbiteriana de Santos",              linhagem: "Presbitério Litoral",  linhagem_id: 3, cidade: "Santos, SP",            fundado_em: "1899-08-30", abade: "Rev. Davi Charles Gomes",  abade_id: 9,   aberto_publico: true,  registros: 521 },
  { id: 7,  nome: "Igreja Presbiteriana do Tatuapé",             linhagem: "Presbitério Capital",  linhagem_id: 1, cidade: "São Paulo, SP",         fundado_em: "1956-05-12", abade: "Rev. Filipe Fontes",      abade_id: 52,  aberto_publico: true,  registros: 287 },
  { id: 8,  nome: "Igreja Presbiteriana de Ribeirão Preto",      linhagem: "Presbitério Interior", linhagem_id: 4, cidade: "Ribeirão Preto, SP",    fundado_em: "1948-07-22", abade: "Rev. Heber Carlos de Campos", abade_id: 28, aberto_publico: true, registros: 198 },
  { id: 9,  nome: "Igreja Presbiteriana de Guarujá",             linhagem: "Presbitério Litoral",  linhagem_id: 3, cidade: "Guarujá, SP",           fundado_em: "1972-10-09", abade: "Rev. Mauro Meister",      abade_id: 64,  aberto_publico: true,  registros: 142 },
  { id: 10, nome: "Igreja Presbiteriana da Mooca",               linhagem: "Presbitério Capital",  linhagem_id: 1, cidade: "São Paulo, SP",         fundado_em: "1934-03-25", abade: "Rev. Cláudio Marra",      abade_id: 17,  aberto_publico: true,  registros: 318 },
  { id: 11, nome: "Igreja Presbiteriana de Taubaté",             linhagem: "Presbitério Vale",     linhagem_id: 2, cidade: "Taubaté, SP",           fundado_em: "1961-12-04", abade: null,                       abade_id: null, aberto_publico: true, registros: 89 },
  { id: 12, nome: "Igreja Presbiteriana de Sorocaba",            linhagem: "Presbitério Interior", linhagem_id: 4, cidade: "Sorocaba, SP",          fundado_em: "1924-09-14", abade: "Rev. Tarcízio José de Freitas", abade_id: 47, aberto_publico: true, registros: 264 },
];

const PRESBITERIOS = [
  { id: 1, name: "Presbitério Capital" },
  { id: 2, name: "Presbitério Vale" },
  { id: 3, name: "Presbitério Litoral" },
  { id: 4, name: "Presbitério Interior" },
];

const PASTORES_SAMPLE = [
  { id: 7,  nome: "Rev. Augusto Nicodemus" }, { id: 14, nome: "Rev. Solano Portela" },
  { id: 21, nome: "Rev. Hernandes Dias Lopes" }, { id: 33, nome: "Rev. Jonas Madureira" },
  { id: 41, nome: "Rev. Marcos André" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED — moderators, admins, dry-run, sheet headers
// ─────────────────────────────────────────────────────────────────────────────

const MODERATORS_BY_WS = {
  centrobudista: [
    { id: 1, name: "Aiko Tanaka",     username: "aiko",     initials: "AT", lastSeen: "agora", tables: ["templos", "associacoes", "linhagens"] },
    { id: 2, name: "Renato Yoshida",  username: "renato",   initials: "RY", lastSeen: "há 3h", tables: ["produtos", "clientes", "doacoes"] },
    { id: 3, name: "Camila Sato",     username: "camila",   initials: "CS", lastSeen: "ontem", tables: ["eventos", "personalidades"] },
    { id: 4, name: "Diego Mendes",    username: "diego",    initials: "DM", lastSeen: "há 1 sem.", tables: ["produtos"] },
  ],
  biblioteca: [
    { id: 1, name: "Beatriz Carvalho",  username: "beatriz",  initials: "BC", lastSeen: "agora",     tables: ["obras", "autores", "periodicos"] },
    { id: 2, name: "Ricardo Pessoa",    username: "ricardo",  initials: "RP", lastSeen: "há 2h",     tables: ["teses", "colecoes"] },
    { id: 3, name: "Marina Schwarz",    username: "marina",   initials: "MS", lastSeen: "ontem",     tables: ["emprestimos", "reservas", "leitores"] },
    { id: 4, name: "Túlio Vasconcelos", username: "tulio",    initials: "TV", lastSeen: "há 4 dias", tables: ["citacoes"] },
  ],
  igreja: [
    { id: 1, name: "Débora Lopes",      username: "debora",   initials: "DL", lastSeen: "agora",     tables: ["igrejas", "pastores", "presbiterios"] },
    { id: 2, name: "Marcos Andrade",    username: "marcos",   initials: "MA", lastSeen: "há 1h",     tables: ["cultos", "ministerios", "boletins"] },
    { id: 3, name: "Rute Vieira",       username: "rute",     initials: "RV", lastSeen: "ontem",     tables: ["membros"] },
    { id: 4, name: "Jonas Coelho",      username: "jonas",    initials: "JC", lastSeen: "há 3 dias", tables: ["ofertas"] },
  ],
};

const ADMINS = [
  { id: 1, name: "Tereza Hashimoto", username: "tereza", initials: "TH", workspace: "Centro Budista do Brasil",     tables: 8,  mods: 4, quotaUsed: 0.34 },
  { id: 2, name: "Helena Marques",   username: "helena", initials: "HM", workspace: "Biblioteca Padre Anchieta · USP", tables: 9, mods: 4, quotaUsed: 0.62 },
  { id: 3, name: "Pedro Almeida",    username: "pedro",  initials: "PA", workspace: "Editora Veredas",                tables: 12, mods: 7, quotaUsed: 0.61 },
  { id: 4, name: "Joana Cardoso",    username: "joana",  initials: "JC", workspace: "Acervo Memória Atlântica",       tables: 21, mods: 3, quotaUsed: 0.78 },
  { id: 5, name: "Otávio Bastos",    username: "otavio", initials: "OB", workspace: "Cooperativa Vinhos do Sul",      tables: 6,  mods: 2, quotaUsed: 0.18 },
];

const SQL_DRY_RUN_BY_WS = {
  centrobudista: [
    { type: "CREATE TABLE", status: "ok",       target: "retiros",         msg: "vai criar — 8 colunas detectadas" },
    { type: "CREATE TABLE", status: "ok",       target: "instrutores",     msg: "vai criar — 5 colunas detectadas" },
    { type: "INSERT INTO",  status: "ok",       target: "retiros",         msg: "230 linhas serão inseridas" },
    { type: "INSERT INTO",  status: "ok",       target: "instrutores",     msg: "47 linhas serão inseridas" },
    { type: "CREATE TABLE", status: "conflict", target: "templos",         msg: "tabela já existe — pulada (use ALTER manualmente)" },
    { type: "DROP TABLE",   status: "blocked",  target: "linhagens",       msg: "operação destrutiva bloqueada por política" },
    { type: "ALTER TABLE",  status: "blocked",  target: "personalidades",  msg: "ALTER não suportado em dry-run; remova do script" },
    { type: "INSERT INTO",  status: "ok",       target: "retiros",         msg: "INSERT múltiplo agrupado, 18 linhas" },
  ],
  biblioteca: [
    { type: "CREATE TABLE", status: "ok",       target: "exemplares",      msg: "vai criar — 9 colunas detectadas" },
    { type: "CREATE TABLE", status: "ok",       target: "tags_assunto",    msg: "vai criar — 3 colunas detectadas" },
    { type: "INSERT INTO",  status: "ok",       target: "exemplares",      msg: "12.847 linhas serão inseridas" },
    { type: "INSERT INTO",  status: "ok",       target: "obras",           msg: "1.203 linhas adicionadas ao acervo" },
    { type: "CREATE TABLE", status: "conflict", target: "autores",         msg: "tabela já existe — pulada (use ALTER manualmente)" },
    { type: "DROP TABLE",   status: "blocked",  target: "obras",           msg: "operação destrutiva bloqueada por política" },
    { type: "ALTER TABLE",  status: "blocked",  target: "leitores",        msg: "ALTER não suportado em dry-run; remova do script" },
    { type: "INSERT INTO",  status: "ok",       target: "citacoes",        msg: "INSERT múltiplo agrupado, 8.421 linhas" },
  ],
  igreja: [
    { type: "CREATE TABLE", status: "ok",       target: "celulas",         msg: "vai criar — 6 colunas detectadas" },
    { type: "CREATE TABLE", status: "ok",       target: "diaconos",        msg: "vai criar — 5 colunas detectadas" },
    { type: "INSERT INTO",  status: "ok",       target: "celulas",         msg: "84 linhas serão inseridas" },
    { type: "INSERT INTO",  status: "ok",       target: "diaconos",        msg: "32 linhas serão inseridas" },
    { type: "CREATE TABLE", status: "conflict", target: "igrejas",         msg: "tabela já existe — pulada (use ALTER manualmente)" },
    { type: "DROP TABLE",   status: "blocked",  target: "membros",         msg: "operação destrutiva bloqueada por política" },
    { type: "ALTER TABLE",  status: "blocked",  target: "ofertas",         msg: "ALTER não suportado em dry-run; remova do script" },
    { type: "INSERT INTO",  status: "ok",       target: "cultos",          msg: "INSERT múltiplo agrupado, 412 linhas" },
  ],
};

const SHEET_HEADERS_BY_WS = {
  centrobudista: [
    { header: "Nome do produto",  suggested: "string",  fieldName: "nome",        sample: "Mālā de sândalo · 108 contas" },
    { header: "Categoria",        suggested: "string",  fieldName: "categoria",   sample: "incenso, mālā, livro, kimono" },
    { header: "Preço (R$)",       suggested: "number",  fieldName: "preco",       sample: "189.00" },
    { header: "Estoque",          suggested: "integer", fieldName: "estoque",     sample: "23" },
    { header: "Linhagem",         suggested: "fk",      fieldName: "linhagem_id", sample: "→ linhagens", fkTo: "linhagens" },
    { header: "Disponível?",      suggested: "boolean", fieldName: "disponivel",  sample: "verdadeiro / falso" },
    { header: "Adicionado em",    suggested: "date",    fieldName: "criado_em",   sample: "2026-04-12" },
    { header: "Foto principal",   suggested: "string",  fieldName: "foto_url",    sample: "https://..." },
  ],
  biblioteca: [
    { header: "Título",           suggested: "string",  fieldName: "titulo",      sample: "Memórias Póstumas de Brás Cubas" },
    { header: "Autor",            suggested: "fk",      fieldName: "autor_id",    sample: "→ autores", fkTo: "autores" },
    { header: "Ano",              suggested: "integer", fieldName: "ano",         sample: "1881" },
    { header: "ISBN",             suggested: "string",  fieldName: "isbn",        sample: "978-85-359-0277-5" },
    { header: "Editora",          suggested: "string",  fieldName: "editora",     sample: "Companhia das Letras" },
    { header: "Coleção",          suggested: "fk",      fieldName: "colecao_id",  sample: "→ colecoes", fkTo: "colecoes" },
    { header: "Disponível?",      suggested: "boolean", fieldName: "disponivel",  sample: "verdadeiro / falso" },
    { header: "Catalogado em",    suggested: "date",    fieldName: "catalogado_em", sample: "2026-04-12" },
  ],
  igreja: [
    { header: "Nome do membro",   suggested: "string",  fieldName: "nome",          sample: "Maria Aparecida Silva" },
    { header: "Tipo",             suggested: "string",  fieldName: "tipo",          sample: "comungante, não-comungante, visitante" },
    { header: "Igreja",           suggested: "fk",      fieldName: "igreja_id",     sample: "→ igrejas", fkTo: "igrejas" },
    { header: "Data de batismo",  suggested: "date",    fieldName: "batismo_em",    sample: "1992-08-15" },
    { header: "Telefone",         suggested: "string",  fieldName: "telefone",      sample: "(11) 91234-5678" },
    { header: "E-mail",           suggested: "string",  fieldName: "email",         sample: "maria@gmail.com" },
    { header: "Ativo?",           suggested: "boolean", fieldName: "ativo",         sample: "verdadeiro / falso" },
    { header: "Cadastrado em",    suggested: "date",    fieldName: "criado_em",     sample: "2026-04-12" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  WORKSPACE-SCOPED ACCESSORS — call these from screens, not the raw constants
// ─────────────────────────────────────────────────────────────────────────────

function getWorkspaceData(wsId) {
  const ws = WORKSPACES[wsId] || WORKSPACES.centrobudista;
  if (wsId === "biblioteca") {
    return {
      WORKSPACE: ws,
      TABLES: TABLES_BIBLIOTECA,
      PRIMARY_TABLE_LABEL: "Obras",
      PRIMARY_COLUMNS: OBRAS_COLUMNS,
      PRIMARY_DATA: OBRAS_DATA,
      CATEGORIES: ASSUNTOS,
      CATEGORY_LABEL: "assunto",
      CATEGORY_LABEL_PLURAL: "assuntos",
      FK_SAMPLE: AUTORES_SAMPLE,
      FK_SAMPLE_LABEL: "autor",
      MODERATORS: MODERATORS_BY_WS.biblioteca,
      SQL_DRY_RUN: SQL_DRY_RUN_BY_WS.biblioteca,
      SHEET_HEADERS: SHEET_HEADERS_BY_WS.biblioteca,
      DETAIL_FIELDS: [
        ["assunto",       "linhagem"],
        ["editora · local", "cidade"],
        ["publicado em",  "fundado_em"],
        ["autor",         "abade"],
        ["aberto ao público", "aberto_publico"],
        ["citações recebidas", "registros"],
      ],
      LIST_RESULT_LABEL: r => `${r.linhagem} · ${r.cidade}${r.abade ? ` · por ${r.abade}` : ""}`,
      LIST_DATE_LABEL: r => `publicado em ${r.fundado_em.slice(0, 4)}`,
    };
  }
  if (wsId === "igreja") {
    return {
      WORKSPACE: ws,
      TABLES: TABLES_IGREJA,
      PRIMARY_TABLE_LABEL: "Igrejas",
      PRIMARY_COLUMNS: IGREJAS_COLUMNS,
      PRIMARY_DATA: IGREJAS_DATA,
      CATEGORIES: PRESBITERIOS,
      CATEGORY_LABEL: "presbitério",
      CATEGORY_LABEL_PLURAL: "presbitérios",
      FK_SAMPLE: PASTORES_SAMPLE,
      FK_SAMPLE_LABEL: "pastor",
      MODERATORS: MODERATORS_BY_WS.igreja,
      SQL_DRY_RUN: SQL_DRY_RUN_BY_WS.igreja,
      SHEET_HEADERS: SHEET_HEADERS_BY_WS.igreja,
      DETAIL_FIELDS: [
        ["presbitério",        "linhagem"],
        ["cidade",             "cidade"],
        ["fundada em",         "fundado_em"],
        ["pastor titular",     "abade"],
        ["aberta ao público",  "aberto_publico"],
        ["membros vinculados", "registros"],
      ],
      LIST_RESULT_LABEL: r => `${r.linhagem} · ${r.cidade}${r.abade ? ` · pastor ${r.abade}` : ""}`,
      LIST_DATE_LABEL: r => `fundada em ${r.fundado_em.slice(0, 4)}`,
    };
  }
  // default — centrobudista
  return {
    WORKSPACE: ws,
    TABLES: TABLES_CENTROBUDISTA,
    PRIMARY_TABLE_LABEL: "Templos",
    PRIMARY_COLUMNS: TEMPLOS_COLUMNS_ORIG,
    PRIMARY_DATA: TEMPLOS_DATA_ORIG,
    CATEGORIES: LINHAGENS_ORIG,
    CATEGORY_LABEL: "linhagem",
    CATEGORY_LABEL_PLURAL: "linhagens",
    FK_SAMPLE: PERSONALIDADES_SAMPLE_ORIG,
    FK_SAMPLE_LABEL: "abade",
    MODERATORS: MODERATORS_BY_WS.centrobudista,
    SQL_DRY_RUN: SQL_DRY_RUN_BY_WS.centrobudista,
    SHEET_HEADERS: SHEET_HEADERS_BY_WS.centrobudista,
    DETAIL_FIELDS: [
      ["linhagem",            "linhagem"],
      ["cidade",              "cidade"],
      ["fundado em",          "fundado_em"],
      ["abade",               "abade"],
      ["aberto ao público",   "aberto_publico"],
      ["registros vinculados","registros"],
    ],
    LIST_RESULT_LABEL: r => `${r.linhagem} · ${r.cidade}${r.abade ? ` · abade ${r.abade}` : ""}`,
    LIST_DATE_LABEL: r => `fundado em ${r.fundado_em.slice(0, 4)}`,
  };
}

// Live globals — reassigned by setActiveWorkspace() before each render
var TABLES = TABLES_CENTROBUDISTA;
var TEMPLOS_COLUMNS = TEMPLOS_COLUMNS_ORIG;
var TEMPLOS_DATA = TEMPLOS_DATA_ORIG;
var LINHAGENS = LINHAGENS_ORIG;
var PERSONALIDADES_SAMPLE = PERSONALIDADES_SAMPLE_ORIG;
var MODERATORS = MODERATORS_BY_WS.centrobudista;
var SQL_DRY_RUN = SQL_DRY_RUN_BY_WS.centrobudista;
var SHEET_HEADERS = SHEET_HEADERS_BY_WS.centrobudista;

function setActiveWorkspace(wsId) {
  const d = getWorkspaceData(wsId);
  WORKSPACE              = d.WORKSPACE;
  TABLES                 = d.TABLES;
  TEMPLOS_COLUMNS        = d.PRIMARY_COLUMNS;
  TEMPLOS_DATA           = d.PRIMARY_DATA;
  LINHAGENS              = d.CATEGORIES;
  PERSONALIDADES_SAMPLE  = d.FK_SAMPLE;
  MODERATORS             = d.MODERATORS;
  SQL_DRY_RUN            = d.SQL_DRY_RUN;
  SHEET_HEADERS          = d.SHEET_HEADERS;
  Object.assign(window, {
    WORKSPACE, TABLES, TEMPLOS_COLUMNS, TEMPLOS_DATA, LINHAGENS,
    PERSONALIDADES_SAMPLE, MODERATORS, SQL_DRY_RUN, SHEET_HEADERS,
  });
  return d;
}

Object.assign(window, {
  WORKSPACE, TABLES, MODERATORS, SQL_DRY_RUN, SHEET_HEADERS,
  TEMPLOS_COLUMNS, TEMPLOS_DATA, LINHAGENS, PERSONALIDADES_SAMPLE, ADMINS,
  WORKSPACES, getWorkspaceData, setActiveWorkspace,
  TABLES_CENTROBUDISTA, TABLES_BIBLIOTECA, TABLES_IGREJA,
  OBRAS_COLUMNS, OBRAS_DATA, ASSUNTOS, AUTORES_SAMPLE,
  IGREJAS_COLUMNS, IGREJAS_DATA, PRESBITERIOS, PASTORES_SAMPLE,
  MODERATORS_BY_WS, SQL_DRY_RUN_BY_WS, SHEET_HEADERS_BY_WS,
});