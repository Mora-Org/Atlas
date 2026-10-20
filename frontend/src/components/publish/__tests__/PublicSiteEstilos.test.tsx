/**
 * 1.3.2 — a folha das classes do runtime é montada à mão com cor do tema.
 *
 * O tema vem do admin. No JSX o React escaparia o valor; dentro de um `<style>`
 * montado como texto, uma "cor" com `</style>` fecharia o bloco e o resto
 * viraria HTML executável na página pública — que é a mesma origem do painel.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite, estilosDoRuntime } from '../PublicSite';
import { PRESETS } from '@/contexts/PublishContext';

const TEMA = PRESETS.editorial.config;

describe('estilosDoRuntime', () => {
  it('dá estilo às classes que o runtime cria (linha redesenhada e aba ativa)', () => {
    const css = estilosDoRuntime(TEMA);
    expect(css).toContain('.atlas-td{padding:9px 12px');
    expect(css).toContain(`.atlas-tab-ativa{color:${TEMA.colors.ink}!important;border-bottom-color:${TEMA.colors.accent}!important}`);
    expect(css).toContain('.atlas-pagina-ativa');
  });

  it('cor que não é hex não entra no CSS', () => {
    const hostil = {
      ...TEMA,
      colors: { ...TEMA.colors, accent: 'red}</style><img src=x onerror=alert(1)>', ink: 'url(javascript:alert(1))' },
    };
    const css = estilosDoRuntime(hostil);
    expect(css).not.toContain('</style');
    expect(css).not.toContain('<img');
    expect(css).not.toContain('javascript');
  });

  it('o site publicado embute a folha', () => {
    const html = renderToStaticMarkup(
      <PublicSite themeConfig={TEMA} tables={[]} workspaceName="W" workspaceSlug="w" />,
    );
    expect(html).toContain('<style>.atlas-td{');
  });
});
