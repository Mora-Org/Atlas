import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchSnapshot } from '@/lib/snapshot';
import { PanfletoPrint } from '@/components/print/PanfletoPrint';

interface Props {
  params: Promise<{ workspace: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace).catch(() => null);
  if (!snap) return { title: 'Workspace não encontrado · Atlas' };
  return { title: `${snap.owner.workspace_name} — panfleto · Atlas` };
}

/**
 * M8.5 F3.2b — panfleto imprimível do workspace publicado.
 * Consome o MESMO snapshot da página pública; render visual pra divulgação
 * (contraponto do /academico, que é sóbrio pra citação).
 */
export default async function PanfletoPage({ params }: Props) {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace);
  if (!snap) notFound();
  return <PanfletoPrint snap={snap} />;
}
