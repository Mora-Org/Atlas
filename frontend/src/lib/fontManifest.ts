/**
 * As fontes que o Atlas versiona, e quais variantes cada família cobre.
 *
 * FONTE ÚNICA pros dois consumidores, de propósito (B14):
 *   - `app/layout.tsx` declara os arquivos ao `next/font/local`;
 *   - `lib/exportStatic.tsx` embute o `.woff2` da fonte do tema no ZIP.
 *
 * Duas listas separadas divergiriam em silêncio — foi o que o B12 já custou
 * duas vezes neste projeto. Aqui a divergência vira teste vermelho:
 * `__tests__/fontManifest.test.ts` assere que TODA combinação que o Publish
 * Studio consegue produzir (família × peso × itálico) resolve pra um arquivo
 * que existe em disco.
 *
 * A receita de download mora em `scripts/fetch-fonts.mjs`. Mexer em peso ou
 * subset lá é mudança VISUAL, não manutenção.
 */

export interface ArquivoFonte {
  /** Nome do arquivo em `src/fonts/`. */
  arquivo: string;
  /** `'400'`, ou faixa `'100 900'` quando é fonte variável. */
  peso: string;
  italico: boolean;
}

/** Chave = nome da família exatamente como aparece na stack CSS do tema. */
export const FONTES_LOCAIS: Record<string, ArquivoFonte[]> = {
  Fraunces: [
    // Variável com os eixos opsz/SOFT (o Atlas usa os dois). A itálica da
    // Fraunces é arquivo separado na Google, não um eixo da romana.
    { arquivo: 'fraunces-100-900.woff2', peso: '100 900', italico: false },
    { arquivo: 'fraunces-italic-100-900-italic.woff2', peso: '100 900', italico: true },
  ],
  'EB Garamond': [
    { arquivo: 'eb-garamond-400.woff2', peso: '400', italico: false },
    { arquivo: 'eb-garamond-500.woff2', peso: '500', italico: false },
    { arquivo: 'eb-garamond-600.woff2', peso: '600', italico: false },
    { arquivo: 'eb-garamond-400-italic.woff2', peso: '400', italico: true },
    { arquivo: 'eb-garamond-500-italic.woff2', peso: '500', italico: true },
    { arquivo: 'eb-garamond-600-italic.woff2', peso: '600', italico: true },
  ],
  'IBM Plex Serif': [
    { arquivo: 'plex-serif-400.woff2', peso: '400', italico: false },
    { arquivo: 'plex-serif-500.woff2', peso: '500', italico: false },
    { arquivo: 'plex-serif-600.woff2', peso: '600', italico: false },
    { arquivo: 'plex-serif-400-italic.woff2', peso: '400', italico: true },
    { arquivo: 'plex-serif-500-italic.woff2', peso: '500', italico: true },
    { arquivo: 'plex-serif-600-italic.woff2', peso: '600', italico: true },
  ],
  'IBM Plex Sans': [
    { arquivo: 'plex-sans-300.woff2', peso: '300', italico: false },
    { arquivo: 'plex-sans-400.woff2', peso: '400', italico: false },
    { arquivo: 'plex-sans-500.woff2', peso: '500', italico: false },
    { arquivo: 'plex-sans-600.woff2', peso: '600', italico: false },
    { arquivo: 'plex-sans-700.woff2', peso: '700', italico: false },
  ],
  'IBM Plex Mono': [
    { arquivo: 'plex-mono-400.woff2', peso: '400', italico: false },
    { arquivo: 'plex-mono-500.woff2', peso: '500', italico: false },
    { arquivo: 'plex-mono-600.woff2', peso: '600', italico: false },
  ],
  Inter: [
    { arquivo: 'inter-400.woff2', peso: '400', italico: false },
    { arquivo: 'inter-500.woff2', peso: '500', italico: false },
    { arquivo: 'inter-600.woff2', peso: '600', italico: false },
    { arquivo: 'inter-400-italic.woff2', peso: '400', italico: true },
    { arquivo: 'inter-500-italic.woff2', peso: '500', italico: true },
    { arquivo: 'inter-600-italic.woff2', peso: '600', italico: true },
  ],
  'JetBrains Mono': [
    { arquivo: 'jetbrains-mono-400.woff2', peso: '400', italico: false },
  ],
};

/** Uma faixa de fonte variável (`'100 900'`) cobre o peso pedido? */
function cobre(peso: string, pedido: number): boolean {
  const partes = peso.trim().split(/\s+/).map(Number);
  if (partes.length === 2) return pedido >= partes[0] && pedido <= partes[1];
  return partes[0] === pedido;
}

/**
 * Acha o arquivo que atende (família, itálico, peso), ou `null` se a família
 * não é versionada — caso em que o consumidor deve degradar pra fonte de
 * sistema, nunca falhar.
 *
 * Peso exato ganha da faixa variável: quando existem as duas formas, o
 * estático é o que o Google entregava antes, e trocar mudaria o desenho.
 */
export function resolverFonte(
  familia: string,
  italico: boolean,
  peso: number
): ArquivoFonte | null {
  const candidatos = (FONTES_LOCAIS[familia] ?? []).filter((f) => f.italico === italico);
  if (candidatos.length === 0) return null;
  return (
    candidatos.find((f) => f.peso === String(peso)) ??
    candidatos.find((f) => cobre(f.peso, peso)) ??
    null
  );
}
