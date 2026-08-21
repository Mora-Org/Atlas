#!/usr/bin/env node
/**
 * Catraca de lint — trava a dívida no tamanho de hoje.
 *
 * O `npm run lint` acusa 38 errors e 6 warnings. A maior parte é
 * `react-hooks/set-state-in-effect` e `exhaustive-deps` nos contexts — dívida
 * real, mas de limpeza demorada. As duas saídas óbvias são ruins:
 *
 *   - exigir zero: o CI nasce vermelho e alguém desliga o gate na semana
 *     seguinte;
 *   - não gatear nada: o número cresce calado até a 1.0, que é o que vinha
 *     acontecendo (o `next.config.ts` desligava tsc E o CI não rodava lint).
 *
 * A catraca é o meio-termo honesto: regressão NOVA quebra o build, limpeza
 * abaixa a baseline. O que ela não faz é ficar verde escondendo crescimento.
 *
 * Quando o número cair, ABAIXE as constantes aqui — o script avisa e falha de
 * propósito se você não fizer, senão a folga volta a virar espaço pra crescer.
 *
 * Usa a API do ESLint em vez de `npx eslint`: no Windows, `execFileSync` num
 * `.cmd` levanta EINVAL desde o Node 20, e um gate que só roda no CI não
 * serve pra conferir antes do push.
 */
import { ESLint } from "eslint"

// Medido em 2026-08-14: 44 problems (38 errors, 6 warnings).
// Abaixado pra 37 no F0: o `let v: any` do commitEdit virou `const` tipado ao
// sair pro `lib/cellPatch.ts`. Abaixado pra 36 na 1.1: o fix do B16 aposentou
// o catch vazio do POST de relations do create. Catraca so desce.
const BASE_ERROS = 36
const BASE_WARNINGS = 6

const eslint = new ESLint()
const resultados = await eslint.lintFiles(["."])

const erros = resultados.reduce((n, f) => n + f.errorCount, 0)
const warnings = resultados.reduce((n, f) => n + f.warningCount, 0)

console.log(
  `lint: ${erros} errors (baseline ${BASE_ERROS}), ` +
    `${warnings} warnings (baseline ${BASE_WARNINGS})`
)

const acusa = (rotulo, atual, base) => {
  if (atual > base) {
    console.error(
      `::error::${rotulo} subiu de ${base} para ${atual}. ` +
        `Rode 'npm run lint' e conserte o que entrou nesta branch.`
    )
    return 1
  }
  if (atual < base) {
    console.error(
      `::error::${rotulo} caiu de ${base} para ${atual} — ótimo, mas ABAIXE ` +
        `a baseline em scripts/lint-ratchet.mjs pra travar o ganho.`
    )
    return 1
  }
  return 0
}

const ruim =
  acusa("errors", erros, BASE_ERROS) + acusa("warnings", warnings, BASE_WARNINGS)
if (ruim) process.exit(1)

console.log("catraca ok — dívida de lint parada onde estava.")
