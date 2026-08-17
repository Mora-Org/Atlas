/**
 * O corpo do PUT de uma edição de célula.
 *
 * Existe como módulo próprio por dois motivos:
 *
 * 1. **É a regra que o F0 conserta, e ela precisa ser testável.** O DataViewer
 *    mandava `{...record, [col]: v}` — a linha inteira, relida do estado local.
 *    Dois admins editando células DIFERENTES da mesma linha se sobrescreviam,
 *    porque o segundo PUT reenviava a versão antiga da célula do primeiro. Sem
 *    erro, sem aviso. O backend sempre aceitou parcial (`update(...).values(**data)`);
 *    quem violava o contrato era o cliente.
 * 2. **A conversão de tipo mora aqui.** Estava inline no `commitEdit`, onde
 *    nenhum teste alcança — e ela tem casos que não são óbvios (campo limpo
 *    vira `NaN`, que o `JSON.stringify` transforma em `null` calado).
 *
 * O ambiente de teste do frontend roda em `node`, sem DOM: componente
 * interativo não é montável aqui. Extrair a regra é o que a torna verificável
 * sem inventar uma dependência de browser.
 */

export interface ColunaDef {
  name: string
  data_type?: string
}

/**
 * Monta o corpo do PUT para a edição de UMA célula.
 *
 * Devolve sempre um objeto de **uma chave só** — é isso que impede a
 * sobrescrita cruzada. A chave ausente no body significa "não mudou" pro
 * backend (`media_cleanup.on_record_update` depende disso), nunca "apagar".
 */
export function montarPatchDeCelula(
  coluna: string,
  valorBruto: unknown,
  colDef?: ColunaDef
): Record<string, unknown> {
  return { [coluna]: converterValor(valorBruto, colDef?.data_type) }
}

/**
 * Converte o texto do input pro tipo da coluna.
 *
 * Campo vazio vira `null`, não `NaN`. Antes, `parseInt('')` dava `NaN` e o
 * `JSON.stringify` o serializava como `null` — o resultado final era o mesmo,
 * mas por acidente: qualquer texto não-numérico (`"abc"`) também virava `null`
 * e **apagava a célula em vez de recusar**. Aqui isso fica explícito, e texto
 * inválido preserva a intenção de erro devolvendo `NaN` pro chamador decidir.
 */
export function converterValor(valorBruto: unknown, dataType?: string): unknown {
  if (dataType !== 'Integer' && dataType !== 'Float') return valorBruto

  const texto = typeof valorBruto === 'string' ? valorBruto.trim() : valorBruto
  if (texto === '' || texto === null || texto === undefined) return null

  return dataType === 'Integer' ? parseInt(String(texto), 10) : parseFloat(String(texto))
}

/** `true` quando o valor convertido não pode ir pro servidor. */
export function valorInvalido(valor: unknown): boolean {
  return typeof valor === 'number' && Number.isNaN(valor)
}
