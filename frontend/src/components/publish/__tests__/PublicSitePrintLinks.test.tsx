/**
 * M8.5 F3.3 — o rodapé oferece os impressos, mas SÓ na rota pública.
 *
 * O mesmo `<PublicSite>` é servido em 3 contextos (rota pública, preview do
 * Studio, export estático). Nos dois últimos as rotas `/{slug}/academico` e
 * `/{slug}/panfleto` não existem — o ZIP roda offline, de um arquivo solto. Por
 * isso o link é opt-in (`printLinks`) e não padrão: sem a trava, o export
 * ganharia link morto, que é a versão-navegação do "artefato que mente".
 *
 * `renderToStaticMarkup` é o caminho real do RSC público e do export.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicSite } from '../PublicSite'
import { PRESETS } from '@/contexts/PublishContext'

const THEME = PRESETS.editorial.config

const render = (printLinks?: boolean) =>
  renderToStaticMarkup(
    <PublicSite
      themeConfig={THEME}
      tables={[]}
      workspaceName="Acervo"
      workspaceSlug="acervo"
      {...(printLinks ? { printLinks: true } : {})}
    />,
  )

describe('links dos impressos no rodapé público', () => {
  it('oferece panfleto e acadêmico quando ligado', () => {
    const html = render(true)
    expect(html).toContain('href="/acervo/panfleto"')
    expect(html).toContain('href="/acervo/academico"')
    expect(html).toContain('Versão acadêmica')
  })

  it('não exige JS (âncora crua, não router)', () => {
    expect(render(true)).not.toContain('<script')
  })

  it('nomeia a navegação pra leitor de tela', () => {
    expect(render(true)).toContain('aria-label="Versões imprimíveis"')
  })

  it('fica FORA por padrão — preview do Studio e export ZIP não ganham link morto', () => {
    const html = render()
    expect(html).not.toContain('/acervo/panfleto')
    expect(html).not.toContain('/acervo/academico')
    // o rodapé em si continua lá
    expect(html).toContain('Publicado via Atlas')
  })
})
