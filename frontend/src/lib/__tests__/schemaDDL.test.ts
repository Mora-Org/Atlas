/**
 * M7 PR4 — unit tests do gerador de DDL. Dirigidos pelo pipeline real
 * (buildSchemaGraph), cobrindo: síntese de PK, mapa de tipos nos 2 dialetos,
 * FK física (PG ALTER vs SQLite inline), relação lógica como comentário,
 * fantasma como comentário, quoting, dual-shape (data_type vs type) e
 * nullability (is_nullable vs required).
 */
import { describe, expect, it } from 'vitest'
import { buildSchemaGraph, type SchemaTable, type SchemaColumn, type SchemaRelation } from '../schemaGraph'
import { generateDDL, typeKind, sqlType, friendlyColumnType } from '../schemaDDL'

const NOW = new Date('2026-06-13T12:00:00Z')

function tbl(name: string, columns: Array<Partial<SchemaColumn> & { name: string }>): SchemaTable {
  return {
    id: name.length,
    name,
    columns: columns.map((c, i) => ({ id: i + 1, ...c })),
  }
}

const ddl = (tables: SchemaTable[], dialect: 'postgres' | 'sqlite', relations: SchemaRelation[] = []) =>
  generateDDL(buildSchemaGraph(tables, relations), dialect, { now: NOW, workspace: 'teste' })

describe('typeKind — normalização dos 3 vocabulários', () => {
  it('SQLAlchemy capitalizado (API real)', () => {
    expect(typeKind('Integer')).toBe('int')
    expect(typeKind('String')).toBe('string')
    expect(typeKind('Float')).toBe('float')
    expect(typeKind('Boolean')).toBe('boolean')
    expect(typeKind('DateTime')).toBe('datetime')
    expect(typeKind('Date')).toBe('date')
    expect(typeKind('Text')).toBe('text')
  })
  it('lógico minúsculo (fixtures)', () => {
    expect(typeKind('integer')).toBe('int')
    expect(typeKind('longtext')).toBe('text')
    expect(typeKind('json')).toBe('json')
    expect(typeKind('number')).toBe('float')
    expect(typeKind('fk')).toBe('int')
  })
  it('SQL cru com tamanho (import)', () => {
    expect(typeKind('VARCHAR(255)')).toBe('string')
    expect(typeKind('numeric(10,2)')).toBe('float')
    expect(typeKind('BIGINT')).toBe('int')
    expect(typeKind('timestamp without time zone')).toBe('datetime')
  })
  it('desconhecido → unknown (vira TEXT, nunca quebra)', () => {
    expect(typeKind('geography')).toBe('unknown')
    expect(typeKind('')).toBe('unknown')
  })
})

describe('sqlType — divergências entre dialetos', () => {
  it('float/datetime/json divergem', () => {
    expect(sqlType('float', 'postgres')).toBe('DOUBLE PRECISION')
    expect(sqlType('float', 'sqlite')).toBe('REAL')
    expect(sqlType('datetime', 'postgres')).toBe('TIMESTAMP')
    expect(sqlType('datetime', 'sqlite')).toBe('DATETIME')
    expect(sqlType('json', 'postgres')).toBe('JSONB')
    expect(sqlType('json', 'sqlite')).toBe('TEXT')
  })
})

describe('síntese de PK (espelha _build_columns do backend)', () => {
  it('sem PK → id sintético; PG SERIAL, SQLite AUTOINCREMENT', () => {
    const tables = [tbl('notas', [{ name: 'texto', data_type: 'Text' }])]
    expect(ddl(tables, 'postgres')).toContain('"id" SERIAL PRIMARY KEY')
    expect(ddl(tables, 'sqlite')).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT')
  })

  it('coluna do usuário chamada "id" sem ser PK é pulada quando há síntese', () => {
    const tables = [tbl('notas', [
      { name: 'id', data_type: 'String', is_primary: false },
      { name: 'texto', data_type: 'Text' },
    ])]
    const out = ddl(tables, 'postgres')
    expect(out).toContain('"id" SERIAL PRIMARY KEY')
    // não pode haver uma segunda definição de "id" como VARCHAR
    expect(out).not.toContain('"id" VARCHAR(255)')
  })

  it('PK declarada → inline PRIMARY KEY, sem síntese', () => {
    const tables = [tbl('clientes', [
      { name: 'id', data_type: 'Integer', is_primary: true },
      { name: 'nome', data_type: 'String' },
    ])]
    const out = ddl(tables, 'postgres')
    expect(out).toContain('"id" INTEGER PRIMARY KEY')
    expect(out).not.toContain('SERIAL')
  })

  it('PK composta → constraint de tabela PRIMARY KEY (a, b)', () => {
    const tables = [tbl('itens', [
      { name: 'pedido_id', data_type: 'Integer', is_primary: true },
      { name: 'produto_id', data_type: 'Integer', is_primary: true },
    ])]
    const out = ddl(tables, 'postgres')
    expect(out).toContain('PRIMARY KEY ("pedido_id", "produto_id")')
  })
})

describe('constraints de coluna', () => {
  it('NOT NULL via is_nullable=false (API) e via required=true (fixture)', () => {
    const apiShape = ddl([tbl('a', [{ name: 'x', data_type: 'String', is_nullable: false }])], 'postgres')
    const fixtureShape = ddl([tbl('b', [{ name: 'x', type: 'string', required: true }])], 'postgres')
    expect(apiShape).toContain('"x" VARCHAR(255) NOT NULL')
    expect(fixtureShape).toContain('"x" VARCHAR(255) NOT NULL')
  })

  it('UNIQUE em coluna não-PK; PK não recebe NOT NULL/UNIQUE redundante', () => {
    const out = ddl([tbl('a', [
      { name: 'id', data_type: 'Integer', is_primary: true, is_unique: true, is_nullable: false },
      { name: 'email', data_type: 'String', is_unique: true, is_nullable: false },
    ])], 'postgres')
    expect(out).toContain('"email" VARCHAR(255) NOT NULL UNIQUE')
    expect(out).toContain('"id" INTEGER PRIMARY KEY')
    expect(out).not.toContain('"id" INTEGER PRIMARY KEY NOT NULL')
  })

  it('default: coluna sem nullability é NULLABLE (sem NOT NULL)', () => {
    const out = ddl([tbl('a', [{ name: 'obs', data_type: 'Text' }])], 'postgres')
    expect(out).toContain('"obs" TEXT')
    expect(out).not.toContain('"obs" TEXT NOT NULL')
  })
})

describe('chaves estrangeiras físicas', () => {
  const tables = () => [
    tbl('pedidos', [
      { name: 'id', data_type: 'Integer', is_primary: true },
      { name: 'cliente_id', data_type: 'Integer', fk_table: 'clientes', fk_column: 'id' },
    ]),
    tbl('clientes', [{ name: 'id', data_type: 'Integer', is_primary: true }]),
  ]

  it('Postgres: ALTER TABLE ADD CONSTRAINT no fim', () => {
    const out = ddl(tables(), 'postgres')
    expect(out).toContain('ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id");')
    // não inline DENTRO do CREATE TABLE (escopo até o primeiro ';')
    expect(out).not.toMatch(/CREATE TABLE "pedidos" \([^;]*FOREIGN KEY/)
  })

  it('SQLite: FOREIGN KEY inline no CREATE TABLE', () => {
    const out = ddl(tables(), 'sqlite')
    expect(out).toMatch(/CREATE TABLE "pedidos"[\s\S]*FOREIGN KEY \("cliente_id"\) REFERENCES "clientes" \("id"\)/)
    expect(out).not.toContain('ALTER TABLE')
  })

  it('toColumn ausente → REFERENCES ... ("id") por padrão', () => {
    const t = [
      tbl('a', [{ name: 'b_ref', data_type: 'Integer', fk_table: 'b' }]),
      tbl('b', [{ name: 'id', data_type: 'Integer', is_primary: true }]),
    ]
    expect(ddl(t, 'postgres')).toContain('REFERENCES "b" ("id")')
  })

  it('auto-referência vira FK válida', () => {
    const t = [tbl('categorias', [
      { name: 'id', data_type: 'Integer', is_primary: true },
      { name: 'pai_id', data_type: 'Integer', fk_table: 'categorias', fk_column: 'id' },
    ])]
    expect(ddl(t, 'postgres')).toContain('FOREIGN KEY ("pai_id") REFERENCES "categorias" ("id")')
  })
})

describe('relações lógicas e fantasmas viram comentário, não constraint', () => {
  it('relação lógica (DynamicRelation sem FK física) → comentário', () => {
    const tables = [
      tbl('posts', [{ name: 'id', data_type: 'Integer', is_primary: true }, { name: 'autor', data_type: 'String' }]),
      tbl('autores', [{ name: 'id', data_type: 'Integer', is_primary: true }]),
    ]
    const rels: SchemaRelation[] = [{
      id: 1, name: 'r', from_table: 'posts', from_column_name: 'autor',
      to_table: 'autores', to_column_name: 'id', relation_type: 'many_to_one',
    }]
    const out = ddl(tables, 'postgres', rels)
    expect(out).toContain('-- relações declaradas (lógicas')
    expect(out).toContain('--   posts.autor → autores.id')
    expect(out).not.toContain('FOREIGN KEY')
  })

  it('FK pra tabela ausente (fantasma) → comentário "ausente", não constraint', () => {
    const tables = [tbl('a', [
      { name: 'id', data_type: 'Integer', is_primary: true },
      { name: 'x_id', data_type: 'Integer', fk_table: 'deletada', fk_column: 'id' },
    ])]
    const out = ddl(tables, 'postgres')
    expect(out).toContain('-- FKs ignoradas')
    expect(out).toContain('--   a.x_id → deletada (ausente)')
    expect(out).not.toContain('ALTER TABLE "a" ADD CONSTRAINT')
  })
})

describe('quoting e robustez', () => {
  it('nome reservado/com espaço é sempre quotado', () => {
    const out = ddl([tbl('order', [{ name: 'select', data_type: 'String' }])], 'postgres')
    expect(out).toContain('CREATE TABLE "order"')
    expect(out).toContain('"select" VARCHAR(255)')
  })

  it('aspas no identificador são dobradas (anti-injeção de DDL)', () => {
    const out = ddl([tbl('a"b', [{ name: 'c', data_type: 'String' }])], 'postgres')
    expect(out).toContain('CREATE TABLE "a""b"')
  })

  it('grafo vazio → só cabeçalho, sem CREATE TABLE', () => {
    const out = generateDDL(buildSchemaGraph([]), 'postgres', { now: NOW, workspace: 'vazio' })
    expect(out).toContain('-- Atlas — esquema lógico de vazio')
    expect(out).toContain('0 tabelas')
    expect(out).not.toContain('CREATE TABLE')
  })

  it('cabeçalho traz dialeto e contagem corretos', () => {
    const out = ddl([tbl('a', [{ name: 'id', data_type: 'Integer', is_primary: true }])], 'sqlite')
    expect(out).toContain('dialeto: SQLite')
    expect(out).toContain('1 tabela, 0 chaves estrangeiras')
  })
})

describe('tipos exóticos de import SQL (achados da review)', () => {
  it('underscore do reflect: DOUBLE_PRECISION → float', () => {
    expect(typeKind('DOUBLE_PRECISION')).toBe('float')
    expect(sqlType(typeKind('DOUBLE_PRECISION'), 'postgres')).toBe('DOUBLE PRECISION')
  })
  it('uuid → string; blob/bytea → text', () => {
    expect(typeKind('uuid')).toBe('string')
    expect(typeKind('BLOB')).toBe('text')
    expect(typeKind('bytea')).toBe('text')
  })
  it('friendlyColumnType: unknown degrada legível, sem nome técnico cru', () => {
    expect(friendlyColumnType({ id: 1, name: 'g', data_type: 'GEOGRAPHY' })).toBe('geography')
    expect(friendlyColumnType({ id: 1, name: 'q', data_type: 'Date' })).toBe('data')
    expect(friendlyColumnType({ id: 1, name: 't', type: 'longtext' })).toBe('texto longo')
  })
})

describe('decisão: tipo LÓGICO preservado (Date→DATE, Text→TEXT), não a degradação física', () => {
  it('Date e Text saem como DATE/TEXT no DDL (intenção do usuário, não VARCHAR)', () => {
    const out = ddl([tbl('e', [
      { name: 'id', data_type: 'Integer', is_primary: true },
      { name: 'quando', data_type: 'Date' },
      { name: 'corpo', data_type: 'Text' },
    ])], 'postgres')
    expect(out).toContain('"quando" DATE')
    expect(out).toContain('"corpo" TEXT')
  })
})
