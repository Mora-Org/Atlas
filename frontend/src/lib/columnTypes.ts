/**
 * columnTypes — fonte ÚNICA dos tipos de coluna (M8 F2a).
 *
 * Antes vivia inline em tables/create/page.tsx com um ternário que terminava
 * num fallback silencioso `: 'Text'` — adicionar um tipo à união sem casar a
 * branch gravava 'Text' calado. Aqui o mapa tem UMA entrada por tipo com o
 * `backend` canônico explícito, então create-wizard e o editor de schema
 * (add-column) compartilham a mesma verdade e não driftam de
 * `ALLOWED_DATA_TYPES` (backend/schemas.py).
 *
 * Grafias de mídia são MINÚSCULAS de propósito (image/file/attachment) —
 * congelam assim no snapshot; todo o resto é Capitalizado. 'Image' daria 422
 * no validador do backend.
 */
import type { IconName } from '@/components/ui'

export type DataType =
  | 'integer' | 'float' | 'string' | 'text' | 'boolean' | 'date' | 'datetime'
  | 'image' | 'file' | 'attachment'

export interface TypeMeta {
  icon: IconName
  label: string
  sql: string
  /** valor canônico enviado ao backend — DEVE estar em ALLOWED_DATA_TYPES. */
  backend: string
  media?: boolean
}

export const TYPE_META: Record<DataType, TypeMeta> = {
  integer:    { icon: 'rows',      label: 'inteiro',          sql: 'INTEGER',       backend: 'Integer' },
  float:      { icon: 'rows',      label: 'decimal',          sql: 'DECIMAL(10,2)', backend: 'Float' },
  string:     { icon: 'columns',   label: 'texto curto',      sql: 'VARCHAR(255)',  backend: 'String' },
  text:       { icon: 'list',      label: 'texto longo',      sql: 'TEXT',          backend: 'Text' },
  boolean:    { icon: 'check',     label: 'verdadeiro/falso', sql: 'BOOLEAN',       backend: 'Boolean' },
  date:       { icon: 'file',      label: 'data',             sql: 'DATE',          backend: 'Date' },
  datetime:   { icon: 'file',      label: 'data e hora',      sql: 'TIMESTAMP',     backend: 'DateTime' },
  image:      { icon: 'image',     label: 'imagem',           sql: 'VARCHAR(255)',  backend: 'image',      media: true },
  file:       { icon: 'file',      label: 'arquivo',          sql: 'VARCHAR(255)',  backend: 'file',       media: true },
  attachment: { icon: 'paperclip', label: 'anexo',            sql: 'VARCHAR(255)',  backend: 'attachment', media: true },
}

/** Todos os tipos, na ordem de exibição. */
export const DATA_TYPES = Object.keys(TYPE_META) as DataType[]

/** Tipos de mídia (F2b usa pra decidir render/upload). */
export const MEDIA_TYPES = DATA_TYPES.filter((t) => TYPE_META[t].media)

/** DataType (front) → grafia canônica do backend. Sem fallback silencioso. */
export function toBackendDataType(dt: DataType): string {
  return TYPE_META[dt].backend
}

/**
 * Grafia canônica do backend → DataType (front). Reverso do toBackendDataType,
 * pro Select do editor de schema partir do tipo inferido pelo import (M8 F4).
 * Default 'string' pra grafia desconhecida (nunca quebra o Select).
 */
export function fromBackendDataType(backend: string): DataType {
  return DATA_TYPES.find((t) => TYPE_META[t].backend === backend) ?? 'string'
}

/**
 * Grafia do backend → label amigável, pra exibir colunas EXISTENTES.
 * Colunas legadas do import SQL trazem tipos refletidos (VARCHAR/TEXT/…) que
 * não estão no mapa — nesse caso devolve a própria string crua.
 */
export function labelForBackendType(backend: string): string {
  const dt = DATA_TYPES.find((t) => TYPE_META[t].backend === backend)
  return dt ? TYPE_META[dt].label : backend
}

/** True se a grafia do backend é um dos 3 tipos de mídia. */
export function isMediaBackendType(backend: string): boolean {
  return MEDIA_TYPES.some((t) => TYPE_META[t].backend === backend)
}
