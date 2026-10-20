/**
 * Índice da ficha (1.4) — o que o SSR precisa pra desenhar a 1ª página igual
 * ao runtime: o texto de uma FK (o título do registro apontado) e o endereço da
 * ficha (`#tabela/chave`).
 *
 * Puro e sem dependência, porque roda nos 3 contextos do `PublicSite` (Studio,
 * RSC público e `renderToStaticMarkup` do ZIP). O `PUBLIC_SITE_RUNTIME` é JS
 * puro numa string e REIMPLEMENTA estas mesmas regras (~20 linhas): duas cópias,
 * por isso o teste `fichaRuntime.test.tsx` renderiza o SSR, roda o runtime por
 * cima e exige o mesmo texto nos dois. Mudou aqui, mude lá.
 */

export type FichaPlacement = 'grade' | 'ficha' | 'oculta';

export interface FichaColuna {
  name: string;
  data_type: string;
  label?: string;
  placement?: FichaPlacement;
}

export interface FichaTabela {
  name: string;
  label?: string;
  key_column?: string | null;
  title_column?: string | null;
  columns: FichaColuna[];
  rows: Record<string, unknown>[];
}

/** Ligação já na direção FK → alvo (o backend normaliza). */
export interface FichaRelacao {
  from: string;
  from_column: string;
  to: string;
  to_column: string;
}

/** Id da aba a partir do nome da tabela — vira âncora (`/slug#templo`). */
export function tabIdDaTabela(nome: string): string {
  return (
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tabela'
  );
}

/** Mesma regra do `texto()` do runtime. */
export function textoValor(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const rotuloColuna = (c: FichaColuna): string => c.label || c.name;
export const naGrade = (c: FichaColuna): boolean => (c.placement ?? 'grade') === 'grade';

/** Endereço da ficha. A chave vai codificada: pode ter espaço, acento ou `/`. */
export function hrefFicha(tabela: string, chave: unknown): string {
  return `#${tabIdDaTabela(tabela)}/${encodeURIComponent(String(chave))}`;
}

export interface CelulaExibida {
  texto: string;
  /** Ficha pra onde a célula leva (título da linha ou alvo da FK); null = texto puro. */
  href: string | null;
}

export function criarIndiceFicha(tabelas: FichaTabela[], relacoes: FichaRelacao[]) {
  const porNome = new Map(tabelas.map((t) => [t.name, t]));
  const rels = relacoes.filter((r) => porNome.has(r.from) && porNome.has(r.to));
  const cache = new Map<string, Map<string, Record<string, unknown>>>();

  // Chave comparada como TEXTO dos dois lados: o import .sql pode trazer FK
  // TEXT apontando pra chave INTEGER.
  function indice(tabela: string, coluna: string) {
    const k = `${tabela}\u0000${coluna}`;
    let m = cache.get(k);
    if (!m) {
      m = new Map();
      for (const linha of porNome.get(tabela)?.rows ?? []) {
        const v = linha[coluna];
        if (v === null || v === undefined) continue;
        if (!m.has(String(v))) m.set(String(v), linha);
      }
      cache.set(k, m);
    }
    return m;
  }

  const fk = (tabela: string, coluna: string) =>
    rels.find((r) => r.from === tabela && r.from_column === coluna) ?? null;

  function titulo(t: FichaTabela, linha: Record<string, unknown>): string {
    const col = t.title_column || t.key_column;
    const v = col ? linha[col] : undefined;
    if (v !== null && v !== undefined && v !== '') return textoValor(v);
    return t.key_column && linha[t.key_column] != null ? String(linha[t.key_column]) : '';
  }

  function href(t: FichaTabela, linha: Record<string, unknown>): string | null {
    if (!t.key_column || linha[t.key_column] === null || linha[t.key_column] === undefined) return null;
    return hrefFicha(t.name, linha[t.key_column]);
  }

  /** O que a célula mostra. FK = título do registro apontado, com link; alvo
   *  fora do recorte = valor cru, sem link (nunca vazio, nunca link quebrado). */
  function celula(t: FichaTabela, coluna: string, linha: Record<string, unknown>): CelulaExibida {
    const rel = fk(t.name, coluna);
    if (rel) {
      const v = linha[coluna];
      const alvo = v === null || v === undefined ? undefined : indice(rel.to, rel.to_column).get(String(v));
      const tAlvo = porNome.get(rel.to);
      if (alvo && tAlvo) return { texto: titulo(tAlvo, alvo), href: href(tAlvo, alvo) };
    }
    if (coluna === t.title_column) return { texto: textoValor(linha[coluna]), href: href(t, linha) };
    return { texto: textoValor(linha[coluna]), href: null };
  }

  return { celula, titulo, href, fk };
}

export type IndiceFicha = ReturnType<typeof criarIndiceFicha>;
