/**
 * O público diz DE QUANDO é o que ele mostra.
 *
 * O snapshot é congelado por decisão do M6 — ele não se atualiza sozinho. Isso
 * só é honesto se a página disser a data: senão um gráfico gerado há três meses
 * se apresenta ao visitante como o número de hoje, e não há nada na tela que
 * permita desconfiar.
 *
 * A incoerência que motivou isto: o impresso acadêmico JÁ dizia
 * ("Versão 3 · publicado em 12 de agosto de 2026") enquanto a tela do mesmo
 * dado só dizia "Publicado via Atlas". O `created_at` e o `version_number`
 * estavam no snapshot, chegavam na página e eram descartados.
 *
 * Render por `renderToStaticMarkup` porque é o caminho real: RSC público e
 * export estático script-free.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicSite, type PublicSiteProps } from '../PublicSite';
import { PRESETS } from '@/contexts/PublishContext';

const BASE: PublicSiteProps = {
  themeConfig: PRESETS.editorial.config,
  tables: [{
    table_id: 1,
    name: 'acervo',
    layout: 'list',
    columns: [{ name: 'titulo', data_type: 'String' }],
    rows: [{ id: 1, titulo: 'um' }],
    total_rows: 1,
  }],
  workspaceName: 'Centro',
  workspaceSlug: 'centro',
};

const render = (extra: Partial<PublicSiteProps> = {}) =>
  renderToStaticMarkup(<PublicSite {...BASE} {...extra} />);

describe('procedência no rodapé público', () => {
  it('mostra a versão e a data quando o snapshot as tem', () => {
    const html = render({ versionNumber: 3, publishedAt: '2026-08-12T14:30:00' })
    expect(html).toContain('Versão 3')
    expect(html).toContain('publicado em')
    expect(html).toContain('12 de agosto de 2026')
  })

  it('emite <time> com o carimbo legível por máquina, não só o texto', () => {
    // Data em português serve pra gente; o atributo é o que um agregador, um
    // leitor de tela ou uma citação automática conseguem ler.
    //
    // MEDIDO: o `renderToStaticMarkup` do React 19 serializa o atributo em
    // camelCase (`dateTime="..."`), não em minúsculas como o HTML canônico.
    // Funciona porque o parser de HTML normaliza nome de atributo — mas a
    // asserção precisa ser insensível a caixa, senão trava numa escolha de
    // serialização do React em vez de travar o comportamento.
    const html = render({ versionNumber: 1, publishedAt: '2026-08-12T14:30:00' })
    expect(html.toLowerCase()).toContain('<time datetime="2026-08-12t14:30:00"')
  })

  it('não inventa data quando o snapshot não tem', () => {
    // O preview do Studio renderiza o mesmo componente e ainda não tem versão
    // publicada. Carimbar "hoje" ali seria fabricar procedência — o pecado que
    // a M8.5 F3 existiu pra evitar.
    const html = render()
    expect(html).not.toContain('publicado em')
    expect(html).not.toContain('<time')
  })

  it('mostra a data mesmo sem número de versão', () => {
    const html = render({ publishedAt: '2026-08-12T14:30:00' })
    expect(html).toContain('publicado em')
    expect(html).not.toContain('Versão')
  })

  it('a data convive com os links de impresso no mesmo rodapé', () => {
    const html = render({ versionNumber: 2, publishedAt: '2026-08-12T14:30:00', printLinks: true })
    expect(html).toContain('Versão acadêmica')
    expect(html).toContain('publicado em')
  })
})
