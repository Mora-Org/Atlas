/**
 * F0 — o corpo do PUT de uma edição de célula.
 *
 * O invariante que estes testes protegem é UM: **o PUT carrega uma coluna só**.
 * Enquanto o DataViewer mandava `{...record, [col]: v}`, dois admins editando
 * células diferentes da mesma linha se sobrescreviam — o segundo PUT reenviava
 * a versão antiga da célula do primeiro, sem erro e sem aviso.
 *
 * O teste correspondente do backend (`test_f0_coedicao.py`) prova o CONTRATO
 * (o servidor aceita e aplica parcial). Ele não prova o conserto, porque manda
 * o PUT parcial direto — o backend sempre aceitou. Quem violava era o cliente,
 * e é aqui que isso fica travado.
 */
import { describe, expect, it } from 'vitest'

import { converterValor, montarPatchDeCelula, valorInvalido } from '../cellPatch'

const LINHA_COMPLETA = {
  id: 7,
  titulo: 'valor que outra pessoa acabou de mudar',
  ano: 1900,
  nota: 'coluna que ninguém tocou',
}

describe('montarPatchDeCelula — o PUT leva UMA coluna', () => {
  it('devolve só a célula editada, nunca a linha', () => {
    const patch = montarPatchDeCelula('ano', 1999)
    expect(Object.keys(patch)).toEqual(['ano'])
    expect(patch).toEqual({ ano: 1999 })
  })

  it('não carrega junto nenhuma outra coluna da linha em memória', () => {
    // O bug em uma asserção: se `titulo` aparecer no corpo, o PUT desfaz a
    // edição que outra pessoa fez nessa coluna enquanto esta tela estava aberta.
    const patch = montarPatchDeCelula('ano', 1999)
    for (const outra of Object.keys(LINHA_COMPLETA)) {
      if (outra === 'ano') continue
      expect(patch, `o corpo levou "${outra}" junto`).not.toHaveProperty(outra)
    }
  })

  it('inclui a coluna mesmo quando o valor é null (limpar é uma edição)', () => {
    const patch = montarPatchDeCelula('nota', null)
    expect(patch).toEqual({ nota: null })
    expect('nota' in patch).toBe(true)
  })
})

describe('converterValor — o campo vazio e o texto inválido', () => {
  it.each([
    ['Integer', '42', 42],
    ['Integer', ' 42 ', 42],
    ['Float', '1.5', 1.5],
    ['String', '42', '42'],
    [undefined, '42', '42'],
  ])('%s "%s" → %s', (tipo, entrada, esperado) => {
    expect(converterValor(entrada, tipo as string | undefined)).toBe(esperado)
  })

  it.each([['Integer'], ['Float']])('%s com campo vazio vira null, não NaN', (tipo) => {
    expect(converterValor('', tipo)).toBeNull()
    expect(converterValor('   ', tipo)).toBeNull()
  })

  it('texto não-numérico continua NaN pra ser recusado, não vira null', () => {
    // Antes: `parseInt('abc')` = NaN, e `JSON.stringify({ano: NaN})` manda
    // `{"ano": null}` — digitar "abc" APAGAVA a célula em silêncio.
    const v = converterValor('abc', 'Integer')
    expect(Number.isNaN(v as number)).toBe(true)
    expect(valorInvalido(v)).toBe(true)
    expect(JSON.stringify({ ano: v })).toBe('{"ano":null}')  // o que aconteceria se passasse
  })

  it('valor válido não é marcado como inválido', () => {
    expect(valorInvalido(converterValor('0', 'Integer'))).toBe(false)
    expect(valorInvalido(converterValor('', 'Integer'))).toBe(false)
    expect(valorInvalido(converterValor('texto', 'String'))).toBe(false)
  })
})
