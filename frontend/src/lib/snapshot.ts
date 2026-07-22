/**
 * Tipo canônico do snapshot publicado + fetch (M8.5 F3.2).
 *
 * O `SnapshotPayload` está duplicado em 3 lugares ([workspace]/page.tsx,
 * exportStatic.tsx, api/export route) — dívida pré-existente que o detalhamento
 * anotou. Este módulo é a versão canônica que o código NOVO usa (as páginas de
 * impresso). Inclui `source` por-tabela (proveniência, F3.1) e preserva
 * `truncated`/`total_rows` (honestidade M6 F5), que o mapeamento do PublicSite
 * dropa hoje.
 */
import type { ThemeConfig } from '@/contexts/PublishContext';
import type { PublicSiteChartData } from '@/components/publish/PublicSite';

export interface SnapshotTable {
  name: string;
  layout: 'list' | 'grid' | 'essay';
  /** M8.5 F3.1: proveniência citável. NULL = sem origem informada (não fabricar fonte). */
  source: string | null;
  columns: { name: string; data_type: string }[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  total_rows: number;
  error?: string;
}

export interface SnapshotPayload {
  schema_version: 1;
  owner: { workspace_slug: string; workspace_name: string };
  version_number: number;
  created_at: string;
  description: string | null;
  theme: ThemeConfig;
  tables: SnapshotTable[];
  charts?: PublicSiteChartData[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchSnapshot(slug: string): Promise<SnapshotPayload | null> {
  const r = await fetch(`${API}/public/${encodeURIComponent(slug)}/snapshot`, {
    next: { revalidate: 30 },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`/public/${slug}/snapshot ${r.status}`);
  return r.json();
}

/** Data de publicação em pt-BR (o snapshot grava `created_at` UTC naive). */
export function formatPublishedDate(createdAt: string): string {
  const d = new Date(createdAt.endsWith('Z') ? createdAt : createdAt + 'Z');
  if (Number.isNaN(d.getTime())) return createdAt;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Citação honesta de uma tabela do conjunto publicado (estilo citação de
 * dataset). Cita `source` se informado; senão cita só o metadado do snapshot —
 * NUNCA fabrica bibliografia (decisão D2 do Diretor).
 */
export function citeTable(snap: SnapshotPayload, table: SnapshotTable): string {
  const date = formatPublishedDate(snap.created_at);
  const base = `${snap.owner.workspace_name}. ${table.name} [conjunto de dados]. `
    + `Versão ${snap.version_number}, ${date}.`;
  const src = (table.source || '').trim();
  const origin = src ? ` Fonte: ${src}.` : '';
  return `${base}${origin} Publicado via Atlas.`;
}
