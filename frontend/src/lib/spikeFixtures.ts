/**
 * M7 spike — gerador de fixtures no shape real de TableResponse
 * (backend/schemas.py:102-110). Sobrevive ao spike: vira a fixture suja
 * dos unit tests do schemaGraph no PR2.
 *
 * Determinístico (PRNG seedado): a fixture de escala N é sempre a mesma,
 * pra que medições de candidatos diferentes sejam comparáveis.
 *
 * Sujeira proposital (cada uma é um estado difícil do plano, seção 7):
 *  - tabelas órfãs (sem FK in/out)
 *  - fk_table apontando pra tabela inexistente ("tabela_fantasma")
 *  - auto-referência (parent_id → própria tabela)
 *  - ciclo de FK (a→b→c→a) a partir da escala 30
 *  - relations[]: espelho DynamicRelation de FK física (duplicata a dedupar),
 *    relação puramente lógica e relação com column names NULL
 */

export interface ColumnLite {
  id: number
  name: string
  type: string
  required: boolean
  is_unique: boolean
  is_primary: boolean
  fk_table: string | null
  fk_column: string | null
}

export interface TableLite {
  id: number
  name: string
  description: string | null
  owner_id: number
  group_id: number | null
  is_public: boolean
  created_at: string
  columns: ColumnLite[]
  meta: { row_count: number; column_count: number; relation_count: number }
}

/** Shape de RelationInfo (schemas.py:129-137) com nulls possíveis no banco. */
export interface RelationLite {
  id: number
  name: string
  from_table: string
  from_column_name: string | null
  to_table: string
  to_column_name: string | null
  relation_type: string
}

export interface SpikeFixture {
  tables: TableLite[]
  relations: RelationLite[]
}

// mulberry32 — PRNG minúsculo e determinístico
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Vocabulário dos workspaces do handoff (data.jsx) — nomes reais, não "table_42"
const CLUSTER_VOCAB: string[][] = [
  ['templos', 'linhagens', 'personalidades', 'retiros', 'praticas'],
  ['livros', 'autores', 'colecoes', 'editoras', 'emprestimos'],
  ['igrejas', 'presbiterios', 'pastores', 'congregacoes', 'eventos'],
  ['produtos', 'categorias', 'fornecedores', 'pedidos', 'clientes'],
  ['turmas', 'professores', 'alunos', 'disciplinas', 'salas'],
]

const SCALAR_TYPES = ['string', 'integer', 'number', 'date', 'boolean', 'longtext', 'json']

export function generateFixture(scale: number, seed = 42): SpikeFixture {
  const rand = rng(seed + scale)
  const tables: TableLite[] = []
  const relations: RelationLite[] = []
  let colId = 1
  let relId = 1

  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

  // nomes únicos: vocabulário ciclado com sufixo numérico após a 1ª volta
  const names: string[] = []
  outer: for (let round = 0; ; round++) {
    for (const cluster of CLUSTER_VOCAB) {
      for (const base of cluster) {
        names.push(round === 0 ? base : `${base}_${round + 1}`)
        if (names.length >= scale) break outer
      }
    }
  }

  for (let i = 0; i < scale; i++) {
    const cols: ColumnLite[] = [
      { id: colId++, name: 'id', type: 'integer', required: true, is_unique: true, is_primary: true, fk_table: null, fk_column: null },
      { id: colId++, name: 'nome', type: 'string', required: true, is_unique: false, is_primary: false, fk_table: null, fk_column: null },
    ]
    const extra = 2 + Math.floor(rand() * 5) // 4–8 colunas no total
    for (let c = 0; c < extra; c++) {
      cols.push({
        id: colId++,
        name: ['descricao', 'cidade', 'criado_em', 'ativo', 'ordem', 'config', 'notas'][c % 7],
        type: pick(SCALAR_TYPES),
        required: rand() > 0.5,
        is_unique: false,
        is_primary: false,
        fk_table: null,
        fk_column: null,
      })
    }
    tables.push({
      id: i + 1,
      name: names[i],
      description: rand() > 0.6 ? `Tabela de ${names[i]} do workspace` : null,
      owner_id: 1,
      group_id: rand() > 0.4 ? 1 + Math.floor(rand() * 4) : null,
      is_public: rand() > 0.7,
      created_at: '2026-05-01T12:00:00',
      columns: cols,
      meta: { row_count: Math.floor(rand() * 900), column_count: cols.length, relation_count: 0 },
    })
  }

  const addFk = (from: TableLite, toName: string, colName?: string) => {
    const col: ColumnLite = {
      id: colId++,
      name: colName ?? `${toName.replace(/_\d+$/, '')}_id`,
      type: 'fk',
      required: rand() > 0.5,
      is_unique: false,
      is_primary: false,
      fk_table: toName,
      fk_column: 'id',
    }
    from.columns.push(col)
    from.meta.column_count = from.columns.length
    from.meta.relation_count++
    return col
  }

  // ~12% órfãs deliberadas (nunca recebem nem emitem FK)
  const orphanCount = Math.max(1, Math.floor(scale * 0.12))
  const orphanIdx = new Set<number>()
  while (orphanIdx.size < orphanCount) orphanIdx.add(Math.floor(rand() * scale))
  const connectable = tables.filter((_, i) => !orphanIdx.has(i))

  // FKs em clusters de 5 (espelha o vocabulário): cada tabela aponta pra
  // 1–2 vizinhas do cluster; 1 cross-cluster ocasional = grafo realista
  for (let i = 0; i < connectable.length; i++) {
    const t = connectable[i]
    const clusterStart = Math.floor(i / 5) * 5
    const fkCount = i % 5 === 0 ? 0 : 1 + (rand() > 0.65 ? 1 : 0) // raiz do cluster não emite
    for (let k = 0; k < fkCount; k++) {
      const targetIdx = clusterStart + Math.floor(rand() * Math.min(5, connectable.length - clusterStart))
      const target = connectable[targetIdx]
      if (!target || target.id === t.id) continue
      if (t.columns.some(c => c.fk_table === target.name)) continue
      addFk(t, target.name)
    }
    if (i % 7 === 3 && connectable.length > 10) {
      const far = connectable[(i + 9) % connectable.length]
      if (far.id !== t.id && !t.columns.some(c => c.fk_table === far.name)) addFk(t, far.name)
    }
  }

  // ── sujeira ───────────────────────────────────────────────────────────
  // 1. FK pra tabela que não existe (deletada/renomeada)
  addFk(connectable[1], 'tabela_fantasma')

  // 2. auto-referência
  addFk(connectable[2], connectable[2].name, 'parent_id')

  // 3. ciclo a→b→c→a (escala ≥ 30)
  if (scale >= 30) {
    const [a, b, c] = [connectable[5], connectable[6], connectable[7]]
    if (!a.columns.some(x => x.fk_table === b.name)) addFk(a, b.name)
    if (!b.columns.some(x => x.fk_table === c.name)) addFk(b, c.name)
    if (!c.columns.some(x => x.fk_table === a.name)) addFk(c, a.name)
  }

  // 4. espelhos DynamicRelation de FKs físicas (duplicatas a dedupar) —
  //    main.py:580-591 cria esses registros junto com a constraint
  let mirrored = 0
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.fk_table && c.fk_table !== 'tabela_fantasma' && mirrored < Math.max(2, scale / 10)) {
        relations.push({
          id: relId++,
          name: `${t.name}_${c.name}_fk`,
          from_table: t.name,
          from_column_name: c.name,
          to_table: c.fk_table,
          to_column_name: c.fk_column,
          relation_type: 'many_to_one',
        })
        mirrored++
      }
    }
  }

  // 5. relação puramente lógica (POST /api/relations, sem constraint física)
  const [lf, lt] = [connectable[3], connectable[connectable.length - 1]]
  relations.push({
    id: relId++,
    name: `${lf.name}_para_${lt.name}`,
    from_table: lf.name,
    from_column_name: 'nome',
    to_table: lt.name,
    to_column_name: 'nome',
    relation_type: 'many_to_one',
  })

  // 6. relação lógica com column names NULL (banco real permite)
  relations.push({
    id: relId++,
    name: 'relacao_sem_colunas',
    from_table: connectable[4].name,
    from_column_name: null,
    to_table: connectable[0].name,
    to_column_name: null,
    relation_type: 'many_to_one',
  })

  return { tables, relations }
}
