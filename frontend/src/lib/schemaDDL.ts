/**
 * M7 PR4 — geração de DDL (CREATE TABLE) a partir do schema LÓGICO do
 * workspace, 100% client-side. Adição do Diretor (decisão 6 do rebate):
 * exportar o schema como SQL em dialetos que façam sentido — PostgreSQL e
 * SQLite, os dois mundos em que o produto vive (dynamic_schema.py).
 *
 * Princípio "reuso de dados": nada de endpoint novo. A entrada é o mesmo
 * `SchemaGraph` que o canvas já tem (nós = tabelas com colunas, edges já
 * deduplicadas e marcadas física/lógica). O que sai é o schema lógico —
 * SEM o `tenant_id`/RLS/prefixo que a implementação física adiciona; o
 * objetivo é recriar o desenho em qualquer banco, não clonar o tenant.
 *
 * Fidelidade ao schema LÓGICO, não ao físico:
 *  - se nenhuma coluna é PK, sintetiza `id` autoincrement e pula uma
 *    eventual coluna do usuário chamada 'id' (idêntico a _build_columns);
 *  - os tipos preservam o que o USUÁRIO escolheu (Date→DATE, Text→TEXT).
 *    O backend HOJE materializa Date/Text como VARCHAR (get_sqlalchemy_type
 *    só conhece Integer/String/Boolean/DateTime/Float; o resto cai em
 *    String), mas o export recria o DESENHO — mantém o tipo lógico
 *    pretendido, não a degradação física.
 *
 * Tolerância: o vocabulário de `data_type` é bagunçado (ver SchemaColumn).
 * O normalizador é case-insensitive e cobre nomes SQLAlchemy, SQL crus
 * (import) e lógicos (fixtures). Desconhecido → TEXT, nunca quebra.
 *
 * FKs: só as FÍSICAS viram constraint (são as de integridade real).
 *  - Postgres: `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` no fim,
 *    pra não depender de ordem topológica nem sofrer com ciclos.
 *  - SQLite: inline no CREATE TABLE (SQLite não tem ALTER ADD CONSTRAINT;
 *    forward-reference é permitida).
 * Relações lógicas (declaradas via POST /api/relations, sem constraint
 * física) saem como COMENTÁRIO — o DDL não mente sobre o que é enforced.
 */
import type { SchemaGraph, SchemaColumn, SchemaTable, SchemaEdge } from '@/lib/schemaGraph'

export type Dialect = 'postgres' | 'sqlite'

type TypeKind =
  | 'int' | 'float' | 'string' | 'text'
  | 'boolean' | 'date' | 'datetime' | 'json' | 'unknown'

/** Tipo efetivo da coluna, lendo a fonte real ou a de fixture. */
function effectiveType(c: SchemaColumn): string {
  return (c.data_type ?? c.type ?? '').trim()
}

/** Nullability: API usa `is_nullable`; fixture usa `required` (invertido). */
function isNullable(c: SchemaColumn): boolean {
  if (typeof c.is_nullable === 'boolean') return c.is_nullable
  if (typeof c.required === 'boolean') return !c.required
  return true
}

/** data_type cru (qualquer dos 3 vocabulários) → kind canônico. */
export function typeKind(raw: string): TypeKind {
  // normaliza: tira sufixo de tamanho/precisão ('VARCHAR(255)'→'varchar') e
  // troca '_' por espaço — o reflect do import SQL grava nomes de classe tipo
  // 'DOUBLE_PRECISION', que sem isso cairiam em 'unknown'
  const t = raw.toLowerCase().replace(/\s*\(.*$/, '').replace(/_/g, ' ').trim()
  if (['integer', 'int', 'int2', 'int4', 'int8', 'bigint', 'smallint', 'serial', 'bigserial', 'fk'].includes(t)) return 'int'
  if (['float', 'double', 'double precision', 'real', 'decimal', 'numeric', 'number', 'money'].includes(t)) return 'float'
  if (['string', 'varchar', 'char', 'character', 'character varying', 'nvarchar', 'nchar', 'uuid'].includes(t)) return 'string'
  if (['text', 'longtext', 'mediumtext', 'tinytext', 'clob', 'ntext', 'blob', 'bytea', 'binary', 'varbinary'].includes(t)) return 'text'
  if (['boolean', 'bool'].includes(t)) return 'boolean'
  if (t === 'date') return 'date'
  if (['datetime', 'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone', 'time'].includes(t)) return 'datetime'
  if (['json', 'jsonb'].includes(t)) return 'json'
  return 'unknown'
}

const PG_TYPE: Record<TypeKind, string> = {
  int: 'INTEGER', float: 'DOUBLE PRECISION', string: 'VARCHAR(255)', text: 'TEXT',
  boolean: 'BOOLEAN', date: 'DATE', datetime: 'TIMESTAMP', json: 'JSONB', unknown: 'TEXT',
}
const SQLITE_TYPE: Record<TypeKind, string> = {
  int: 'INTEGER', float: 'REAL', string: 'VARCHAR(255)', text: 'TEXT',
  boolean: 'BOOLEAN', date: 'DATE', datetime: 'DATETIME', json: 'TEXT', unknown: 'TEXT',
}

/** kind → tipo SQL do dialeto. */
export function sqlType(kind: TypeKind, dialect: Dialect): string {
  return dialect === 'postgres' ? PG_TYPE[kind] : SQLITE_TYPE[kind]
}

const KIND_LABEL: Record<TypeKind, string> = {
  int: 'inteiro', float: 'número', string: 'texto', text: 'texto longo',
  boolean: 'sim / não', date: 'data', datetime: 'data e hora', json: 'json', unknown: '',
}

/**
 * Rótulo PT-BR amigável do tipo de uma coluna — lê `data_type ?? type`
 * (ver SchemaColumn). Compartilhado por TableNode e DetailPanel pra
 * corrigir o bug latente em que o rótulo saía em branco com dados reais
 * (a API devolve `data_type`, não o `type` lógico das fixtures).
 */
export function friendlyColumnType(c: SchemaColumn): string {
  const raw = (c.data_type ?? c.type ?? '').trim()
  const k = typeKind(raw)
  // unknown (tipo exótico de import): degrada legível, sem vazar o nome
  // técnico cru no editorial (ex.: 'GEOGRAPHY' → 'geography')
  return k === 'unknown' ? raw.replace(/_/g, ' ').toLowerCase() : KIND_LABEL[k]
}

/** Aspas em identificador (PG e SQLite aceitam "..."); aspas internas dobradas. */
function q(id: string): string {
  return `"${String(id).replace(/"/g, '""')}"`
}

interface DDLOptions {
  /** nome do workspace pro cabeçalho */
  workspace?: string
  /** injeção pra teste determinístico; default = agora */
  now?: Date
}

/** Uma FK física pronta pra emitir. */
interface Fk {
  from: string
  fromColumn: string
  to: string
  toColumn: string
}

function physicalFk(e: SchemaEdge): Fk | null {
  if (e.logical || !e.fromColumn) return null
  return { from: e.from, fromColumn: e.fromColumn, to: e.to, toColumn: e.toColumn ?? 'id' }
}

function tableDDL(table: SchemaTable, dialect: Dialect, inlineFks: Fk[]): string {
  const cols = table.columns ?? []
  const pkCols = cols.filter(c => c.is_primary)
  const hasPk = pkCols.length > 0
  const lines: string[] = []

  // sem PK declarada → sintetiza `id` (espelha _build_columns do backend)
  if (!hasPk) {
    lines.push(`  ${q('id')} ${dialect === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}`)
  }

  for (const c of cols) {
    // backend pula a coluna 'id' do usuário quando sintetiza a própria PK
    if (!hasPk && c.name.toLowerCase() === 'id') continue
    const parts = [`  ${q(c.name)} ${sqlType(typeKind(effectiveType(c)), dialect)}`]
    // PK inline só se for a única PK; composta vira constraint de tabela abaixo
    if (hasPk && pkCols.length === 1 && c.is_primary) parts.push('PRIMARY KEY')
    if (!isNullable(c) && !c.is_primary) parts.push('NOT NULL')
    if (c.is_unique && !c.is_primary) parts.push('UNIQUE')
    lines.push(parts.join(' '))
  }

  if (hasPk && pkCols.length > 1) {
    lines.push(`  PRIMARY KEY (${pkCols.map(c => q(c.name)).join(', ')})`)
  }

  // SQLite: FK inline (não há ALTER ADD CONSTRAINT)
  for (const fk of inlineFks) {
    lines.push(`  FOREIGN KEY (${q(fk.fromColumn)}) REFERENCES ${q(fk.to)} (${q(fk.toColumn)})`)
  }

  return `CREATE TABLE ${q(table.name)} (\n${lines.join(',\n')}\n);`
}

/**
 * Gera o script DDL completo do grafo no dialeto pedido.
 * Determinístico dado (graph, dialect, opts) — sem efeitos colaterais.
 */
export function generateDDL(graph: SchemaGraph, dialect: Dialect, opts: DDLOptions = {}): string {
  const tables = graph.nodes
    .filter(n => !n.ghost && n.table)
    .map(n => n.table as SchemaTable)
  const present = new Set(tables.map(t => t.name))

  const fks = graph.edges.map(physicalFk).filter((f): f is Fk => f !== null)
  const fksToPresent = fks.filter(f => present.has(f.from) && present.has(f.to))
  const fksToGhost = fks.filter(f => present.has(f.from) && !present.has(f.to))
  const logical = graph.edges.filter(e => e.logical)

  const dialectLabel = dialect === 'postgres' ? 'PostgreSQL' : 'SQLite'
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10)
  const ws = opts.workspace || 'workspace'

  const out: string[] = []
  out.push(`-- Atlas — esquema lógico de ${ws}`)
  out.push(`-- dialeto: ${dialectLabel} · gerado em ${stamp}`)
  out.push(`-- ${tables.length} ${tables.length === 1 ? 'tabela' : 'tabelas'}, ${fksToPresent.length} ${fksToPresent.length === 1 ? 'chave estrangeira' : 'chaves estrangeiras'}`)
  out.push(`-- representação do schema LÓGICO — sem tenant_id/RLS da camada física`)
  out.push('')

  for (const t of tables) {
    const inline = dialect === 'sqlite' ? fksToPresent.filter(f => f.from === t.name) : []
    out.push(tableDDL(t, dialect, inline))
    out.push('')
  }

  // Postgres: FKs como ALTER no fim (sem depender de ordem nem sofrer ciclo)
  if (dialect === 'postgres' && fksToPresent.length) {
    out.push('-- chaves estrangeiras')
    for (const f of fksToPresent) {
      out.push(
        `ALTER TABLE ${q(f.from)} ADD CONSTRAINT ${q(`${f.from}_${f.fromColumn}_fkey`)} ` +
        `FOREIGN KEY (${q(f.fromColumn)}) REFERENCES ${q(f.to)} (${q(f.toColumn)});`,
      )
    }
    out.push('')
  }

  // relações declaradas (lógicas, sem constraint física) — só comentário
  if (logical.length) {
    out.push('-- relações declaradas (lógicas, sem constraint física no banco):')
    for (const e of logical) {
      const fromCol = e.fromColumn ? `.${e.fromColumn}` : ''
      const toCol = e.toColumn ? `.${e.toColumn}` : ''
      out.push(`--   ${e.from}${fromCol} → ${e.to}${toCol}`)
    }
    out.push('')
  }

  // FKs que apontam pra tabelas ausentes do schema (fantasma/sem acesso)
  if (fksToGhost.length) {
    out.push('-- FKs ignoradas (tabela referenciada ausente do schema):')
    for (const f of fksToGhost) {
      out.push(`--   ${f.from}.${f.fromColumn} → ${f.to} (ausente)`)
    }
    out.push('')
  }

  return out.join('\n').replace(/\n+$/, '\n')
}
