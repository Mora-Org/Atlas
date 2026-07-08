/**
 * M8 F3 — unit tests do embed de mídia no export estático (buildMediaBundle).
 * Cobre: coleta por data_type da coluna, discriminação gerenciada-vs-externa
 * por marcador estrutural, dedup de reuso da biblioteca, derivação do nome no
 * ZIP, mapa de rewrite (abs → ./assets/media/), e link-mode em fetch falho.
 * fetch é mockado — sem rede.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMediaBundle, type SnapshotPayload } from '../exportStatic'

const DEV = 'http://localhost:8000/api/assets/dev/10/'
const SUP = 'https://x.supabase.co/storage/v1/object/public/workspace-media/10/'
const EXT = 'https://imgur.com/externa.png'

function snap(tables: SnapshotPayload['tables']): SnapshotPayload {
  return {
    schema_version: 1,
    owner: { workspace_slug: 'w', workspace_name: 'W' },
    version_number: 1,
    created_at: '2026-07-08T00:00:00Z',
    description: null,
    // theme não é tocado por buildMediaBundle
    theme: {} as SnapshotPayload['theme'],
    tables,
  }
}

function tbl(
  columns: { name: string; data_type: string }[],
  rows: Record<string, unknown>[],
): SnapshotPayload['tables'][number] {
  return { name: 't', layout: 'list', columns, rows, truncated: false, total_rows: rows.length }
}

/** fetch mock: bytes por URL; ausente = 404. */
function mockFetch(bytesByUrl: Record<string, number>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const n = bytesByUrl[url]
      if (n == null) return { ok: false, status: 404 } as unknown as Response
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array(n).buffer,
      } as unknown as Response
    }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('buildMediaBundle', () => {
  it('embute mídia gerenciada (dev), ignora externa, dedup de reuso', async () => {
    mockFetch({ [DEV + 'a.png']: 100 })
    const s = snap([
      tbl(
        [
          { name: 'titulo', data_type: 'String' },
          { name: 'foto', data_type: 'image' },
        ],
        [
          { titulo: 'A', foto: DEV + 'a.png' },
          { titulo: 'B', foto: DEV + 'a.png' }, // reuso → 1 cópia só
          { titulo: 'C', foto: EXT }, // externa → ignorada (não é nossa)
        ],
      ),
    ])
    const b = await buildMediaBundle(s)
    expect(b.embedded).toBe(1)
    expect(b.linkMode).toBe(0) // externa não conta como link-mode (nunca foi nossa)
    expect(b.files.size).toBe(1)
    expect([...b.files.keys()]).toEqual(['10-a.png']) // slice(-2).join('-')
    expect(b.rewrites.get(DEV + 'a.png')).toBe('./assets/media/10-a.png')
    expect(b.rewrites.has(EXT)).toBe(false)
  })

  it('reconhece o marcador do bucket Supabase', async () => {
    mockFetch({ [SUP + 'pub/v3__x.png']: 50 })
    const s = snap([tbl([{ name: 'foto', data_type: 'image' }], [{ foto: SUP + 'pub/v3__x.png' }])])
    const b = await buildMediaBundle(s)
    expect(b.embedded).toBe(1)
    // últimos 2 segmentos: pub/v3__x.png → pub-v3__x.png
    expect([...b.files.keys()]).toEqual(['pub-v3__x.png'])
  })

  it('coluna NÃO-mídia com valor de URL é ignorada', async () => {
    mockFetch({ [DEV + 'a.png']: 100 })
    const s = snap([tbl([{ name: 'link', data_type: 'String' }], [{ link: DEV + 'a.png' }])])
    const b = await buildMediaBundle(s)
    expect(b.embedded).toBe(0)
    expect(b.files.size).toBe(0)
  })

  it('fetch falho (404/cópia morta) degrada pra link-mode, não derruba', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch({}) // toda URL 404a
    const s = snap([tbl([{ name: 'foto', data_type: 'file' }], [{ foto: DEV + 'morta.pdf' }])])
    const b = await buildMediaBundle(s)
    expect(b.embedded).toBe(0)
    expect(b.linkMode).toBe(1)
    expect(b.rewrites.size).toBe(0) // fica como link absoluto no html
  })

  it('snapshot sem coluna de mídia = bundle vazio, zero fetch', async () => {
    mockFetch({})
    const s = snap([tbl([{ name: 'nome', data_type: 'String' }], [{ nome: 'x' }])])
    const b = await buildMediaBundle(s)
    expect(b.embedded).toBe(0)
    expect(b.linkMode).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})
