/**
 * Diff de linhas, só o suficiente pra faixa de proposta dizer o tamanho da mudança.
 *
 * Por que não contar linha por diferença de conjunto: `stack(` aparece em quase
 * todo padrão, e mover um bloco de lugar contaria como 6 adicionadas e 6 removidas.
 * LCS custa ~30 linhas e não mente. Padrão de Strudel tem dezenas de linhas, não
 * milhares, então o O(n·m) aqui é irrelevante.
 */

export type Diff = {
  adicionadas: number
  removidas: number
  /** true quando os dois lados são o mesmo texto (fora espaço no fim das linhas). */
  igual: boolean
}

function linhas(s: string): string[] {
  return s.replace(/\s+$/gm, '').split('\n')
}

export function diffLinhas(antes: string, depois: string): Diff {
  const a = linhas(antes)
  const b = linhas(depois)

  // tabela de LCS clássica
  const m = a.length
  const n = b.length
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const comuns = lcs[0][0]
  const removidas = m - comuns
  const adicionadas = n - comuns
  return { adicionadas, removidas, igual: adicionadas === 0 && removidas === 0 }
}

/** "+4 −1" — o rótulo curto que cabe na faixa. Vazio quando não mudou nada. */
export function rotuloDiff(d: Diff): string {
  if (d.igual) return 'idêntico'
  const partes: string[] = []
  if (d.adicionadas) partes.push(`+${d.adicionadas}`)
  if (d.removidas) partes.push(`−${d.removidas}`)
  return partes.join(' ')
}
