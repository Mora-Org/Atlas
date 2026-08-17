import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PublicSite, type PublicSiteTableData, type PublicSiteChartData } from '@/components/publish/PublicSite';
import type { ThemeConfig } from '@/contexts/PublishContext';

interface SnapshotPayload {
  schema_version: 1;
  owner: { workspace_slug: string; workspace_name: string };
  version_number: number;
  created_at: string;
  description: string | null;
  theme: ThemeConfig;
  tables: {
    name: string;
    layout: 'list' | 'grid' | 'essay';
    columns: { name: string; data_type: string }[];
    rows: Record<string, unknown>[];
    truncated: boolean;
    total_rows: number;
    error?: string;
  }[];
  // M8.5 F2: chave aditiva — snapshot antigo (sem `charts`) continua válido,
  // por isso é opcional e o `schema_version` NÃO bumpou.
  charts?: PublicSiteChartData[];
}

interface Props {
  params: Promise<{ workspace: string }>;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchSnapshot(slug: string): Promise<SnapshotPayload | null> {
  const r = await fetch(`${API}/public/${encodeURIComponent(slug)}/snapshot`, {
    // Snapshot só muda quando admin publica versão nova — pequena janela de
    // revalidação evita rebuild a cada hit sem segurar mudança recente.
    next: { revalidate: 30 },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`/public/${slug}/snapshot ${r.status}`);
  return r.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace).catch(() => null);
  if (!snap) return { title: 'Workspace não encontrado · Atlas' };
  return {
    title: `${snap.owner.workspace_name} · Atlas`,
    description: snap.theme.copy?.hero_sub ?? undefined,
  };
}

export default async function PublicWorkspacePage({ params }: Props) {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace);
  if (!snap) notFound();

  // Adapta payload do backend pra props do <PublicSite>.
  // `table_id` no PublicSite é só pra key — uso o índice como fallback.
  const tables: PublicSiteTableData[] = snap.tables.map((t, idx) => ({
    table_id: idx,
    name: t.name,
    layout: t.layout,
    columns: t.columns,
    rows: t.rows,
    total_rows: t.total_rows,
  }));

  return (
    <PublicSite
      themeConfig={snap.theme}
      tables={tables}
      charts={snap.charts ?? []}
      workspaceName={snap.owner.workspace_name}
      workspaceSlug={snap.owner.workspace_slug}
      // Procedência: o snapshot é congelado por decisão, então precisa dizer
      // de quando ele é. O acadêmico já dizia; a tela, não.
      versionNumber={snap.version_number}
      publishedAt={snap.created_at}
      // M8.5 F3.3: só a rota pública oferece os impressos (ver `printLinks`).
      printLinks
    />
  );
}
