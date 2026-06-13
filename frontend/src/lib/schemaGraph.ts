/**
 * M7 — schemaGraph: TableResponse[] (+ relações lógicas, quando o PR2b
 * existir) → grafo {nodes, edges}. Módulo PURO e testável — zero React,
 * zero engine de render (princípio 6 do plano).
 *
 * Tolerante a inconsistências desde o dia 1 (seção 7 do plano):
 *  - fk_table ausente da resposta → nó fantasma (tabela deletada/renomeada
 *    ou fora das permissões do moderator)
 *  - duplicata FK física + DynamicRelation espelho → dedup por
 *    (from_table, from_column, to_table)
 *  - relação lógica sem column names → entra sem âncora de coluna
 *  - auto-referência e ciclos → preservados (o layout é quem corta)
 */

export interface SchemaColumn {
  id: number
  name: string
  /**
   * Tipo da coluna. DUAS fontes possíveis e divergentes:
   *  - API real (`GET /tables/` → ColumnResponse): `data_type` com nomes
   *    SQLAlchemy capitalizados ('String'/'Integer'/'Float'/'Boolean'/
   *    'DateTime'/'Date'/'Text') ou, vindo de import SQL, nomes SQL crus
   *    ('VARCHAR'/'INTEGER'/...).
   *  - Fixtures de teste (spikeFixtures): `type` com vocabulário lógico
   *    minúsculo ('integer'/'string'/'longtext'/'json'/'fk').
   * Quem consome (TableNode, DetailPanel, schemaDDL) lê `data_type ?? type`.
   */
  data_type?: string
  type?: string
  /** nullability: API usa `is_nullable`; fixtures usam `required` (invertido). */
  is_nullable?: boolean
  required?: boolean
  is_unique?: boolean
  is_primary?: boolean
  fk_table?: string | null
  fk_column?: string | null
}

/** Shape mínimo de TableResponse (backend/schemas.py:102-110). */
export interface SchemaTable {
  id: number
  name: string
  description?: string | null
  owner_id?: number | null
  group_id?: number | null
  is_public?: boolean
  created_at?: string
  columns: SchemaColumn[]
  meta?: { row_count: number; column_count: number; relation_count: number } | null
}

/** Shape de RelationInfo (schemas.py:129-137), nulls possíveis no banco. */
export interface SchemaRelation {
  id: number
  name: string
  from_table: string
  from_column_name: string | null
  to_table: string
  to_column_name: string | null
  relation_type: string
}

export interface SchemaNode {
  name: string
  table: SchemaTable | null   // null = fantasma
  ghost: boolean
  orphan: boolean
}

export interface SchemaEdge {
  id: string
  from: string
  to: string
  fromColumn: string | null
  toColumn: string | null
  /** true = só DynamicRelation (tracejada); false = FK física (sólida). */
  logical: boolean
  selfRef: boolean
}

export interface SchemaGraph {
  nodes: SchemaNode[]
  edges: SchemaEdge[]
  /** nomes na ordem da resposta — útil pra busca/painel */
  ghostCount: number
  orphanCount: number
}

export function buildSchemaGraph(
  tables: SchemaTable[],
  relations: SchemaRelation[] = [],
): SchemaGraph {
  const nodeByName = new Map<string, SchemaNode>()
  for (const t of tables) {
    nodeByName.set(t.name, { name: t.name, table: t, ghost: false, orphan: false })
  }

  const edgeKeys = new Set<string>()
  const edges: SchemaEdge[] = []

  const ensureGhost = (name: string) => {
    if (!nodeByName.has(name)) {
      nodeByName.set(name, { name, table: null, ghost: true, orphan: false })
    }
  }

  // FKs físicas: a aresta mora literalmente na coluna (fato-âncora do plano)
  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.fk_table) continue
      const key = `${t.name}|${c.name}|${c.fk_table}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      ensureGhost(c.fk_table)
      edges.push({
        id: `fk:${key}`,
        from: t.name,
        to: c.fk_table,
        fromColumn: c.name,
        toColumn: c.fk_column ?? null,
        logical: false,
        selfRef: c.fk_table === t.name,
      })
    }
  }

  // Relações lógicas (PR2b): tracejadas; espelho de FK física deduplicado.
  for (const r of relations) {
    if (!r.from_table || !r.to_table) continue
    const key = `${r.from_table}|${r.from_column_name ?? '∅'}|${r.to_table}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    ensureGhost(r.from_table)
    ensureGhost(r.to_table)
    edges.push({
      id: `rel:${r.id}`,
      from: r.from_table,
      to: r.to_table,
      fromColumn: r.from_column_name,
      toColumn: r.to_column_name,
      logical: true,
      selfRef: r.from_table === r.to_table,
    })
  }

  // órfãs = grau zero (auto-referência não conta como conexão)
  const connected = new Set<string>()
  for (const e of edges) {
    if (e.selfRef) continue
    connected.add(e.from)
    connected.add(e.to)
  }
  let orphanCount = 0
  let ghostCount = 0
  for (const n of nodeByName.values()) {
    n.orphan = !n.ghost && !connected.has(n.name)
    if (n.orphan) orphanCount++
    if (n.ghost) ghostCount++
  }

  return { nodes: [...nodeByName.values()], edges, ghostCount, orphanCount }
}

/**
 * Vizinhos diretos de um nó (pra highlight de seleção, PR3).
 * Auto-referência não torna o nó vizinho de si mesmo.
 */
export function neighborsOf(graph: SchemaGraph, name: string): Set<string> {
  const out = new Set<string>()
  for (const e of graph.edges) {
    if (e.selfRef) continue
    if (e.from === name) out.add(e.to)
    if (e.to === name) out.add(e.from)
  }
  out.delete(name)
  return out
}
