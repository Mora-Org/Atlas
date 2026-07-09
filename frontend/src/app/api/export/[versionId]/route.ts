/**
 * Export estático (M6 Fase 5) — GET /api/export/{versionId}
 *
 * O Next é só renderizador + empacotador: o backend continua dono dos
 * dados e guards. Este handler repassa o Authorization do caller pro
 * GET /api/publications/me/versions/{id}/snapshot (master 403, mod
 * herda parent, 404 cross-workspace) e devolve o ZIP montado on-demand.
 * Nada é persistido.
 */
import type { NextRequest } from 'next/server';
import { buildExportZip, type SnapshotPayload } from '@/lib/exportStatic';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// M8 F3: embutir mídia faz o ZIP crescer e o fetch dos bytes leva tempo — o
// default da plataforma (10-15s) estoura em workspace com galeria. 60s dá
// folga; a plataforma (Vercel) lê isto do build output e clampa ao teto do
// plano. `buildMediaBundle` já degrada pra link-mode acima do teto de bytes.
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  if (!/^\d+$/.test(versionId)) {
    return Response.json({ detail: 'versionId inválido' }, { status: 400 });
  }

  const auth = request.headers.get('authorization');
  if (!auth) {
    return Response.json({ detail: 'Não autenticado' }, { status: 401 });
  }

  const upstream = await fetch(`${API}/api/publications/me/versions/${versionId}/snapshot`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  if (!upstream.ok) {
    const detail = await upstream
      .json()
      .then((b: { detail?: string }) => b.detail)
      .catch(() => undefined);
    return Response.json(
      { detail: detail ?? `snapshot ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const snap = (await upstream.json()) as SnapshotPayload;

  try {
    const { fileName, buffer } = await buildExportZip(snap);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    // Falha digna: geração é on-demand, sem estado — o caller pode tentar
    // de novo. 502 = dependência (ex.: Google Fonts) ou render falhou.
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    return Response.json({ detail: `Falha ao gerar o pacote: ${msg}` }, { status: 502 });
  }
}
