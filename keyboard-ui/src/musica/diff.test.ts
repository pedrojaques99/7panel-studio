import { describe, it, expect } from 'vitest'
import { diffLinhas, rotuloDiff } from './diff'

describe('diffLinhas', () => {
  it('texto igual é idêntico', () => {
    const d = diffLinhas('a\nb\nc', 'a\nb\nc')
    expect(d).toEqual({ adicionadas: 0, removidas: 0, igual: true })
    expect(rotuloDiff(d)).toBe('idêntico')
  })

  it('espaço no fim da linha não conta como mudança', () => {
    expect(diffLinhas('a  \nb', 'a\nb').igual).toBe(true)
  })

  it('conta linha acrescentada e linha tirada', () => {
    const d = diffLinhas('a\nb\nc', 'a\nX\nc\nd')
    expect(d).toEqual({ adicionadas: 2, removidas: 1, igual: false })
    expect(rotuloDiff(d)).toBe('+2 −1')
  })

  it('bloco movido não vira reescrita inteira', () => {
    // o motivo do LCS: diferença de conjunto contaria 3 e 3 aqui
    const antes = 'stack(\n  bd,\n  hh,\n  pad\n)'
    const depois = 'stack(\n  hh,\n  bd,\n  pad\n)'
    const d = diffLinhas(antes, depois)
    expect(d.adicionadas + d.removidas).toBeLessThanOrEqual(2)
  })

  it('de vazio pra código conta tudo como adicionado', () => {
    expect(diffLinhas('', 'a\nb').adicionadas).toBe(2)
  })
})
