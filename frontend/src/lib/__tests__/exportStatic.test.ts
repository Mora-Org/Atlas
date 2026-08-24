/**
 * M8 F3 — unit tests do embed de mídia no export estático (buildMediaBundle).
 * Cobre: coleta por data_type da coluna, discriminação gerenciada-vs-externa
 * por marcador estrutural, dedup de reuso da biblioteca, derivação do nome no
 * ZIP, mapa de rewrite (abs → ./assets/media/), e link-mode em fetch falho.
 * fetch é mockado — sem rede.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFontBundle, buildMediaBundle, type SnapshotPayload } from '../exportStatic'

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

/* ─────────────────── B14: fontes do ZIP vêm do disco, não da rede ─────────────────── */

describe('buildFontBundle', () => {
  /** Tema mínimo com só o que collectFontRequests lê. */
  const tema = (display: string, italic: boolean, weight: number, body: string, mono: string) =>
    ({
      typography: {
        display: { family: display, italic, size: 64, weight },
        body: { family: body },
        mono: { family: mono },
      },
    }) as unknown as Parameters<typeof buildFontBundle>[0]

  it('não faz nenhuma requisição de rede', async () => {
    // O ponto do B14. Antes isto batia em fonts.googleapis.com + gstatic e
    // LEVANTAVA quando a resposta não vinha — um ZIP cujo contrato é ser
    // offline dependia da rede pra existir.
    const espiao = vi.spyOn(globalThis, 'fetch')
    await buildFontBundle(tema("'Fraunces', Georgia, serif", true, 400, "'IBM Plex Sans', sans-serif", "'IBM Plex Mono', monospace"))
    expect(espiao).not.toHaveBeenCalled()
    espiao.mockRestore()
  })

  it('embute os bytes das 3 famílias do tema e declara o @font-face', async () => {
    const b = await buildFontBundle(
      tema("'Fraunces', Georgia, serif", true, 400, "'IBM Plex Sans', sans-serif", "'IBM Plex Mono', monospace")
    )
    expect(b.files.size).toBe(3)
    for (const [nome, bytes] of b.files) {
      // wOF2 é a assinatura do formato — prova que veio arquivo, não string vazia.
      expect(bytes.subarray(0, 4).toString('ascii'), nome).toBe('wOF2')
      expect(b.css).toContain(`./assets/fonts/${nome}`)
    }
    expect(b.css).toContain("font-family:'Fraunces'")
    expect(b.css).toContain('font-style:italic')
  })

  it('o itálico do display escolhe arquivo DIFERENTE do romano', async () => {
    // O toggle de itálico é da UI. Se os dois resolvessem pro mesmo arquivo, o
    // ZIP sairia romano com o navegador sintetizando o itálico — falha visual
    // silenciosa, que é o modo de falha que este bug já teve uma vez.
    const romano = await buildFontBundle(tema("'Fraunces', Georgia, serif", false, 400, "'Inter', sans-serif", "'IBM Plex Mono', monospace"))
    const italico = await buildFontBundle(tema("'Fraunces', Georgia, serif", true, 400, "'Inter', sans-serif", "'IBM Plex Mono', monospace"))
    const soFraunces = (b: Awaited<ReturnType<typeof buildFontBundle>>) =>
      [...b.files.keys()].filter((k) => k.startsWith('fraunces'))
    expect(soFraunces(romano)).not.toEqual(soFraunces(italico))
  })

  it('família de sistema não quebra o export — só não embute', async () => {
    const b = await buildFontBundle(tema('Georgia, serif', false, 400, 'system-ui, sans-serif', 'monospace'))
    expect(b.files.size).toBe(0)
    expect(b.css).toBe('')
  })

  it('dedup: display e corpo na mesma família geram um arquivo só', async () => {
    const b = await buildFontBundle(tema("'Inter', sans-serif", false, 400, "'Inter', sans-serif", "'IBM Plex Mono', monospace"))
    expect([...b.files.keys()].filter((k) => k.startsWith('inter'))).toHaveLength(1)
  })
})

describe('buildExportZip — o pacote sai self-contained', () => {
  it('leva as fontes e a licença OFL dentro do ZIP', async () => {
    const { buildExportZip } = await import('../exportStatic')
    const { PRESETS } = await import('@/contexts/PublishContext')
    const JSZip = (await import('jszip')).default

    const s = snap([])
    s.theme = PRESETS.editorial.config as unknown as SnapshotPayload['theme']

    const { buffer, fileName } = await buildExportZip(s)
    const zip = await JSZip.loadAsync(buffer)
    const nomes = Object.keys(zip.files)

    const fontes = nomes.filter((n) => n.startsWith('assets/fonts/') && n.endsWith('.woff2'))
    expect(fontes.length, `fontes no ZIP: ${nomes.join(', ')}`).toBeGreaterThanOrEqual(3)

    // A OFL exige o texto junto das CÓPIAS. O ZIP redistribui os .woff2 pro
    // cliente, então citar no README (como fazia) não cumpre a licença.
    expect(nomes).toContain('assets/fonts/LICENSES.md')
    const licenca = await zip.file('assets/fonts/LICENSES.md')!.async('string')
    expect(licenca).toContain('SIL Open Font License')

    // O HTML tem que apontar pros arquivos que realmente estão no pacote —
    // @font-face órfão é o mesmo que não ter fonte, só que silencioso.
    const html = await zip.file('index.html')!.async('string')
    for (const f of fontes) expect(html).toContain(`./${f}`)
    expect(html).not.toContain('fonts.gstatic.com')
    expect(html).not.toContain('fonts.googleapis.com')

    expect(fileName).toMatch(/\.zip$/)
  })

  it('leva o runtime e o SheetJS — a interatividade do ZIP é offline (1.3)', async () => {
    const { buildExportZip } = await import('../exportStatic')
    const { PRESETS } = await import('@/contexts/PublishContext')
    const JSZip = (await import('jszip')).default

    // Tabela REAL com layout `tabela`: sem isso o `data-atlas-*` casaria com o
    // texto do próprio runtime inline, e a asserção não provaria nada.
    const s = snap([
      {
        name: 'templo',
        layout: 'tabela',
        columns: [{ name: 'nome', data_type: 'String' }, { name: 'estado', data_type: 'String' }],
        rows: [{ nome: 'Templo Zu Lai', estado: 'SP' }],
        truncated: false,
        total_rows: 1,
      },
    ])
    s.theme = PRESETS.editorial.config as unknown as SnapshotPayload['theme']
    const zip = await JSZip.loadAsync((await buildExportZip(s)).buffer)
    const nomes = Object.keys(zip.files)

    // Até o 1.2 o ZIP era script-free por contrato; o Diretor derrubou o
    // contrato no 1.3 pra ter abas/filtro/Excel também no offline.
    expect(nomes).toContain('assets/xlsx.mini.min.js')
    expect(nomes).toContain('assets/xlsx-LICENSE.txt')

    const html = await zip.file('index.html')!.async('string')
    // O SheetJS vem do pacote, nunca de CDN — o ZIP é offline por contrato, e
    // o B14 já provou que dependência de rede quebra em produção.
    expect(html).toContain('assets/xlsx.mini.min.js')
    expect(html).not.toContain('//cdn.')
    expect(html).not.toContain('unpkg.com')

    // markup da tabela interativa, com os ganchos que o runtime procura
    expect(html).toContain('data-atlas-table="templo"')
    expect(html).toContain('data-atlas-filter="nome"')
    expect(html).toContain('data-atlas-pagesize')
    expect(html).toContain('data-atlas-export')
    // aba da tabela + a de início
    expect(html).toContain('data-atlas-tab="templo"')
    expect(html).toContain('data-atlas-panel="inicio"')
    // e o dado embutido pro filtro/paginação funcionarem offline
    expect(html).toContain('data-atlas-data')
    expect(html).toContain('Templo Zu Lai')
  })

  it('a célula com </script> não escapa do bloco JSON dentro do ZIP', async () => {
    const { buildExportZip } = await import('../exportStatic')
    const { PRESETS } = await import('@/contexts/PublishContext')
    const JSZip = (await import('jszip')).default

    const s = snap([
      {
        name: 'ataque',
        layout: 'tabela',
        columns: [{ name: 'nome', data_type: 'String' }],
        rows: [{ nome: '</script><img src=x onerror=alert(1)>' }],
        truncated: false,
        total_rows: 1,
      },
    ])
    s.theme = PRESETS.editorial.config as unknown as SnapshotPayload['theme']
    const zip = await JSZip.loadAsync((await buildExportZip(s)).buffer)
    const html = await zip.file('index.html')!.async('string')

    // O React escapa o `<td>`; o bloco JSON é montado à mão e precisa do
    // `jsonParaScript`. Um `</script` cru fecharia o bloco e o resto do
    // arquivo viraria HTML executável.
    const bloco = html.slice(html.indexOf('data-atlas-data'))
    const fim = bloco.indexOf('</script>')
    expect(bloco.slice(0, fim)).not.toContain('</script')
    expect(html).not.toContain('onerror=alert(1)>')
  })
})

describe('procedência dentro do ZIP', () => {
  it('o index.html diz a versão e a data', async () => {
    // No ZIP isto pesa mais que na rota pública: o pacote é aberto por `file://`,
    // meses depois, sem URL e sem contexto. O README já avisa que os dados não
    // se atualizam — mas quem abre o index.html direto não lê README.
    const { buildExportZip } = await import('../exportStatic')
    const { PRESETS } = await import('@/contexts/PublishContext')
    const JSZip = (await import('jszip')).default

    const s = snap([])
    s.theme = PRESETS.editorial.config as unknown as SnapshotPayload['theme']
    s.version_number = 7
    s.created_at = '2026-08-12T14:30:00'

    const zip = await JSZip.loadAsync((await buildExportZip(s)).buffer)
    const html = await zip.file('index.html')!.async('string')
    expect(html).toContain('Versão 7')
    expect(html).toContain('12 de agosto de 2026')
  })
})
