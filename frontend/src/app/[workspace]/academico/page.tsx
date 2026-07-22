import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchSnapshot } from '@/lib/snapshot';
import { AcademicPrint } from '@/components/print/AcademicPrint';

interface Props {
  params: Promise<{ workspace: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace).catch(() => null);
  if (!snap) return { title: 'Workspace não encontrado · Atlas' };
  return { title: `${snap.owner.workspace_name} — versão acadêmica · Atlas` };
}

/**
 * M8.5 F3.2a — versão acadêmica imprimível do workspace publicado.
 * Consome o MESMO snapshot da página pública; render sóbrio pra citação.
 */
export default async function AcademicPage({ params }: Props) {
  const { workspace } = await params;
  const snap = await fetchSnapshot(workspace);
  if (!snap) notFound();
  return <AcademicPrint snap={snap} />;
}
