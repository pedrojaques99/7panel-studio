import { describe, expect, it } from 'vitest'
import { gerarNotas } from '@jaques/padroes'
import { celulaEm, codificar, decodificar, notaEm, notasDaPartilha, posCelula, comColuna, type Grade } from './estado'

const g: Grade = { largura: 1400, altura: 700, celula: 20, colunas: 64, linhas: 13 }

describe('geometria da grade', () => {
  it('celulaEm desfaz posCelula em toda a grade', () => {
    for (const [col, row] of [[0, 0], [63, 12], [17, 5], [40, 9]]) {
      const p = posCelula(g, col, row)
      expect(celulaEm(g, p.x + 26, p.y + 26)).toEqual({ col, row })
    }
  })
  it('notaEm acha a nota sob o glifo e -1 fora', () => {
    const notas = gerarNotas('eno', 3)
    const p = posCelula(g, notas[2].col, notas[2].row)
    expect(notaEm(g, notas, p.x + 5, p.y + 5)).toBeGreaterThanOrEqual(0)
    expect(notaEm(g, notas, -50, -50)).toBe(-1)
  })
})

describe('compartilhar', () => {
  it('só estilo + semente restaura a mesma partitura', () => {
    const p = decodificar(codificar({ estilo: 'aphex', seed: 42 }))!
    expect(p).toEqual({ estilo: 'aphex', seed: 42 })
    expect(notasDaPartilha(p)).toEqual(gerarNotas('aphex', 42))
  })
  it('notas editadas e bpm voltam iguais', () => {
    const notas = gerarNotas('prog', 7)
    notas[0] = { ...comColuna('prog', notas[0], 5, 3), acento: true, glifo: 6 }
    const p = decodificar(codificar({ estilo: 'prog', seed: 7, notas, bpm: 120 }))!
    expect(p.bpm).toBe(120)
    expect(p.notas!.map((n) => [n.col, n.row, n.glifo, !!n.acento])).toEqual(
      [...notas].sort((a, b) => a.t - b.t || a.row - b.row).map((n) => [n.col, n.row, n.glifo, !!n.acento]),
    )
  })
  it('lixo no hash não quebra', () => {
    expect(decodificar('nada-a-ver')).toBeNull()
  })
})
