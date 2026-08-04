/**
 * B1 — o Toggle tem que entregar o PRÓXIMO valor pra quem escuta.
 *
 * A assinatura antiga era `onChange: () => void` e o componente chamava
 * `onChange()` sem argumento. Quem escrevia `onChange={v => patch({ x: v })}`
 * — o import de planilha fazia exatamente isso — recebia `undefined`, gravava
 * `undefined` no estado, e `JSON.stringify` sumia com a chave no request. O
 * backend caía no default e o usuário nunca via erro nenhum.
 *
 * A suíte roda em `environment: 'node'` (decisão do M8.5 F2.2), então o teste
 * invoca o handler direto do elemento retornado em vez de clicar num DOM — o
 * Toggle não tem hook, é função pura de props. Testa comportamento, não tipo:
 * a versão quebrada compilava com um `as any` e passaria num teste que só
 * olhasse "chamou?".
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Toggle from '../Toggle'

/** Dispara o onClick do <button> que o Toggle devolve. */
function click(props: React.ComponentProps<typeof Toggle>) {
  const el = Toggle(props) as React.ReactElement<{ onClick?: () => void }>
  el.props.onClick?.()
}

describe('Toggle', () => {
  it('entrega o próximo valor (true → false)', () => {
    const onChange = vi.fn()
    click({ label: 'Aceita nulo', checked: true, onChange })
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('entrega o próximo valor (false → true)', () => {
    const onChange = vi.fn()
    click({ label: 'Aceita nulo', checked: false, onChange })
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('nunca entrega undefined — era esse o bug', () => {
    const onChange = vi.fn()
    click({ label: 'x', checked: true, onChange })
    expect(typeof onChange.mock.calls[0][0]).toBe('boolean')
  })

  it('desabilitado não dispara', () => {
    const onChange = vi.fn()
    click({ label: 'x', checked: true, disabled: true, onChange })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('sem label visível ainda tem nome acessível', () => {
    // uso compacto (linha de grade com cabeçalho próprio): antes o leitor de
    // tela ouvia só "botão, pressionado"
    const html = renderToStaticMarkup(
      <Toggle checked ariaLabel='Coluna "preco" aceita valor vazio' onChange={() => {}} />,
    )
    expect(html).toContain('aria-label="Coluna &quot;preco&quot; aceita valor vazio"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('com label, o texto aparece e não vira aria-label redundante', () => {
    const html = renderToStaticMarkup(<Toggle label="Único" checked={false} onChange={() => {}} />)
    expect(html).toContain('Único')
    expect(html).not.toContain('aria-label')
  })
})
