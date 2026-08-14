#!/usr/bin/env node
/**
 * Baixa os `.woff2` das 6 famílias e gera o manifesto que o `layout.tsx` usa.
 *
 * POR QUE ISTO EXISTE (B14): `next/font/google` baixa a fonte **em tempo de
 * build**. Em 14/08/2026 a CDN do Google entregou ao build URLs que ela mesma
 * responde com 404 — o commit tinha passado 6 min antes. Isso derruba o CI e,
 * pior, pode derrubar um **deploy da Vercel**, que roda o mesmo `next build`.
 * Com os arquivos versionados, o build não fala com a rede.
 *
 * Este script roda **sob demanda**, não no build. Ele existe pra provar de onde
 * os arquivos vieram e pra permitir atualizar depois sem arqueologia.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * O que ele NÃO faz de propósito: escolher pesos por conta própria. A lista
 * abaixo é cópia literal do que o `layout.tsx` pedia ao `next/font/google` —
 * mudar peso ou subset aqui é mudança VISUAL, e tem que ser decisão explícita.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

// UA moderno: sem ele o Google devolve `.ttf` em vez de `.woff2`.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const DESTINO = path.join(process.cwd(), "src", "fonts")

/* Duas listas porque são dois consumidores com necessidades diferentes:
 *
 *  APP     — o chrome do Atlas (`layout.tsx`). Espelha 1:1 o que o
 *            `next/font/google` pedia antes, pra a troca ter risco visual ZERO.
 *
 *  EXPORT  — o ZIP publicado (`lib/exportStatic.tsx`), que embute a fonte do
 *            TEMA escolhido pelo admin. O espaço de opções é fechado e foi
 *            medido no `PublishContext`: 4 famílias de display × {400,500,600}
 *            × {normal, itálico}, 4 de corpo sempre em 400 normal, e 2
 *            monoespaçadas em 400. O peso NÃO é editável na UI (vem do preset);
 *            o itálico É um toggle, então toda família de display precisa das
 *            duas variantes.
 *
 * `query` é o parâmetro `family` da API css2 — os eixos vão em ordem
 * alfabética, registrados (minúsculos) antes dos customizados (maiúsculos),
 * senão a API devolve 400.
 */
const FAMILIAS = [
  // ── APP ──────────────────────────────────────────────────────────────
  {
    id: "fraunces",
    nome: "Fraunces",
    // era: axes: ['opsz', 'SOFT'] — variável, sem lista de peso
    query: "Fraunces:opsz,wght,SOFT@9..144,100..900,0..100",
  },
  {
    id: "plex-sans",
    nome: "IBM Plex Sans",
    query: "IBM+Plex+Sans:wght@300;400;500;600;700",
  },
  {
    id: "plex-mono",
    nome: "IBM Plex Mono",
    query: "IBM+Plex+Mono:wght@400;500;600",
  },
  {
    id: "plex-serif",
    nome: "IBM Plex Serif",
    // 600 entra por causa do EXPORT (preset "moderno" usa peso 600 e o admin
    // pode trocar a família de display sem trocar o peso).
    query: "IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600",
  },
  {
    id: "eb-garamond",
    nome: "EB Garamond",
    query: "EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600",
  },
  {
    id: "inter",
    nome: "Inter",
    // itálico entra pelo EXPORT: o toggle de itálico vale pra qualquer
    // família de display, inclusive as que os presets usam em romano.
    query: "Inter:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600",
  },
  // ── só EXPORT ────────────────────────────────────────────────────────
  {
    id: "fraunces-italic",
    nome: "Fraunces (itálico)",
    // A Fraunces itálica é um arquivo separado na Google, não um eixo.
    query: "Fraunces:ital,opsz,wght,SOFT@1,9..144,100..900,0..100",
  },
  {
    id: "jetbrains-mono",
    nome: "JetBrains Mono",
    // Preset "moderno" usa JetBrains Mono como monoespaçada.
    query: "JetBrains+Mono:wght@400",
  },
]

/** Quebra o CSS em blocos e devolve só os do subset `latin`.
 *
 * O Google marca cada `@font-face` com um comentário de subset logo acima
 * (`/* latin *​/`). O layout pedia `subsets: ['latin']`, então trazer
 * cyrillic/greek/vietnamese aqui inflaria o repo com o que o build de hoje já
 * descarta. `latin-ext` também fica de fora: o português cabe no `latin`
 * (U+0000-00FF cobre ã, ç, õ, é). */
function blocosLatin(css) {
  const blocos = []
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g
  let m
  while ((m = re.exec(css)) !== null) {
    if (m[1] !== "latin") continue
    const corpo = m[2]
    const pega = (chave) => {
      const r = new RegExp(`${chave}:\\s*([^;]+);`).exec(corpo)
      return r ? r[1].trim() : null
    }
    const src = /src:\s*url\(([^)]+)\)/.exec(corpo)
    blocos.push({
      estilo: pega("font-style") || "normal",
      peso: pega("font-weight") || "400",
      url: src ? src[1] : null,
    })
  }
  return blocos.filter((b) => b.url)
}

async function baixar(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ao baixar ${url}`)
  return Buffer.from(await r.arrayBuffer())
}

await mkdir(DESTINO, { recursive: true })

const manifesto = []

for (const fam of FAMILIAS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${fam.query}&display=swap`
  const r = await fetch(cssUrl, { headers: { "User-Agent": UA } })
  if (!r.ok) throw new Error(`${r.status} no CSS de ${fam.nome}: ${cssUrl}`)
  const blocos = blocosLatin(await r.text())
  if (blocos.length === 0) throw new Error(`nenhum bloco latin em ${fam.nome}`)

  const arquivos = []
  for (const b of blocos) {
    // Peso "100 900" (variável) vira "100-900" no nome do arquivo.
    const sufPeso = b.peso.replace(/\s+/g, "-")
    const sufEstilo = b.estilo === "italic" ? "-italic" : ""
    const nome = `${fam.id}-${sufPeso}${sufEstilo}.woff2`
    const bytes = await baixar(b.url)
    await writeFile(path.join(DESTINO, nome), bytes)
    arquivos.push({ nome, peso: b.peso, estilo: b.estilo, kb: Math.round(bytes.length / 1024) })
    console.log(`  ${nome.padEnd(34)} ${String(b.peso).padStart(7)} ${b.estilo.padEnd(6)} ${Math.round(bytes.length / 1024)} KB`)
  }
  manifesto.push({ ...fam, arquivos })
  console.log(`${fam.nome}: ${arquivos.length} arquivo(s)`)
}

const total = manifesto.flatMap((f) => f.arquivos).reduce((n, a) => n + a.kb, 0)
console.log(`\ntotal: ${manifesto.flatMap((f) => f.arquivos).length} arquivos, ${total} KB`)
console.log("\n--- src pro next/font/local ---")
for (const f of manifesto) {
  console.log(`\n// ${f.nome}`)
  for (const a of f.arquivos) {
    console.log(`{ path: '../fonts/${a.nome}', weight: '${a.peso}', style: '${a.estilo}' },`)
  }
}
