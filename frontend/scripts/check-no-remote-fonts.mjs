#!/usr/bin/env node
/**
 * Impede que a dependência de CDN de fonte volte (B14).
 *
 * O bug não foi um erro de digitação: `next/font/google` é o caminho que a
 * documentação do Next ensina, e `fonts.googleapis.com` é o que qualquer
 * tutorial manda colar. A próxima fonte que alguém adicionar vai chegar por
 * um desses dois, e vai passar despercebida — o build só quebra quando o
 * Google tem soluço, que foi exatamente o que aconteceu em 14/08/2026.
 *
 * Este gate falha o CI antes disso. Se um dia a decisão for voltar a baixar
 * da CDN, o certo é apagar este arquivo com a decisão registrada, não abrir
 * exceção aqui.
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const RAIZ = path.join(process.cwd(), "src")

const PROIBIDOS = [
  { padrao: /from\s+['"]next\/font\/google['"]/, motivo: "next/font/google baixa a fonte em tempo de build" },
  { padrao: /fonts\.googleapis\.com/, motivo: "CSS de fonte vindo da CDN do Google" },
  { padrao: /fonts\.gstatic\.com/, motivo: "arquivo de fonte vindo da CDN do Google" },
]

// Comentários que EXPLICAM o B14 citam as URLs de propósito. Ignorar por
// arquivo seria frouxo demais; ignorar a linha que é comentário é suficiente.
const ehComentario = (linha) => /^\s*(\/\/|\*|\/\*)/.test(linha)

/* Teste é escopo errado pra este gate, e a primeira execução no CI provou:
 * `expect(html).not.toContain('fonts.gstatic.com')` citou a CDN justamente pra
 * asserir que ela NÃO aparece, e caiu aqui. Arquivo de teste não entra em
 * bundle nenhum — o que este gate protege é o que é SERVIDO. */
const ehTeste = (p) => /[\\/]__tests__[\\/]|\.(test|spec)\.[jt]sx?$/.test(p)

async function* arquivos(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* arquivos(p)
    else if (/\.(ts|tsx|js|jsx|css)$/.test(e.name) && !ehTeste(p)) yield p
  }
}

const achados = []
for await (const arq of arquivos(RAIZ)) {
  const linhas = (await readFile(arq, "utf8")).split("\n")
  linhas.forEach((linha, i) => {
    if (ehComentario(linha)) return
    for (const { padrao, motivo } of PROIBIDOS) {
      if (padrao.test(linha)) {
        achados.push({ arq: path.relative(process.cwd(), arq), linha: i + 1, motivo, texto: linha.trim().slice(0, 90) })
      }
    }
  })
}

if (achados.length > 0) {
  console.error(`::error::${achados.length} referência(s) a fonte remota — as fontes do Atlas são versionadas em src/fonts/ (B14)`)
  for (const a of achados) console.error(`  ${a.arq}:${a.linha}  ${a.motivo}\n    ${a.texto}`)
  console.error("\n  Pra adicionar uma família: scripts/fetch-fonts.mjs + src/lib/fontManifest.ts.")
  process.exit(1)
}

console.log("ok — nenhuma fonte vem de CDN.")
