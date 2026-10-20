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
/** 1.5: como a coluna se filtra. Ausente = `texto` (comportamento da 1.4). */
export type FichaFiltro = 'texto' | 'lista' | 'data' | 'nenhum';

export interface FichaColuna {
  name: string;
  data_type: string;
  label?: string;
  placement?: FichaPlacement;
  filter?: FichaFiltro;
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

/** Mesma regra do `normaliza()` do runtime: sem acento e sem caixa. */
export function normalizaTexto(v: unknown): string {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** `Date`/`DateTime` do Atlas e as grafias refletidas (`DATE`, `TIMESTAMP`). */
export function ehData(dataType: string | undefined): boolean {
  const t = (dataType ?? '').toUpperCase();
  return t.includes('DATE') || t.includes('TIMESTAMP');
}

/**
 * 1.5: data em dd/mm/aaaa, fatiando o texto ISO (`AAAA-MM-DD…`). Sem `Intl`
 * nem `toLocaleDateString` de propósito: o SSR (Node) e o navegador têm de
 * produzir o MESMO texto, e fuso/ICU diferentes já mudariam o dia. `DateTime`
 * mostra só a data. O que não parece ISO sai como veio.
 */
export function dataExibida(v: unknown): string {
  const s = textoValor(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
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

  // título que é coluna de data sai em dd/mm/aaaa, como a própria coluna na grade
  const textoDe = (t: FichaTabela, col: string, v: unknown) =>
    ehData(t.columns.find((c) => c.name === col)?.data_type) ? dataExibida(v) : textoValor(v);

  function titulo(t: FichaTabela, linha: Record<string, unknown>): string {
    const col = t.title_column || t.key_column;
    const v = col ? linha[col] : undefined;
    if (col && v !== null && v !== undefined && v !== '') return textoDe(t, col, v);
    return t.key_column && linha[t.key_column] != null ? textoDe(t, t.key_column, linha[t.key_column]) : '';
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
    const meta = t.columns.find((c) => c.name === coluna);
    const texto = ehData(meta?.data_type) ? dataExibida(linha[coluna]) : textoValor(linha[coluna]);
    if (coluna === t.title_column) return { texto, href: href(t, linha) };
    return { texto, href: null };
  }

  return { celula, titulo, href, fk };
}

export type IndiceFicha = ReturnType<typeof criarIndiceFicha>;
