import { describe, expect, it } from 'vitest'
import { colarClipes, copiarClipes, duplicarClipes, moverClipes, removerClipes } from './clipes'
import { novaTrilha, novoProjeto, type Projeto } from './modelo'

function dois(): Projeto {
  const a = novaTrilha('audio', 'a'); a.clipes = [{ id: 'c1', inicio: 2, dur: 4, arquivo: 'x.wav' }]
  const m = novaTrilha('melodia', 'm'); m.clipes = [{ id: 'c2', inicio: 4, dur: 2, notas: [{ id: 'n', t: 0, dur: 1, midi: 60, vel: 0.8 }] }]
  return { ...novoProjeto('t'), trilhas: [a, m] }
}
const inicios = (p: Projeto) => p.trilhas.map(t => t.clipes.map(c => c.inicio))

describe('grupo de clipes', () => {
  it('move junto, cada um na sua trilha, sem passar do zero', () => {
    expect(inicios(moverClipes(dois(), ['c1', 'c2'], 3))).toEqual([[5], [7]])
    expect(inicios(moverClipes(dois(), ['c1', 'c2'], -10))).toEqual([[0], [2]])
  })
  it('apaga o grupo', () => {
    expect(removerClipes(dois(), ['c1', 'c2']).trilhas.map(t => t.clipes.length)).toEqual([0, 0])
  })
  it('copia e cola na agulha mantendo o desenho e a trilha de origem; nota ganha id novo', () => {
    const p = dois()
    expect(copiarClipes(p, ['c1', 'c2'])).toBe(2)
    const r = colarClipes(p, 10)
    expect(inicios(r.projeto)).toEqual([[2, 10], [4, 12]])
    expect(r.ids).toHaveLength(2)
    expect(r.projeto.trilhas[1].clipes[1].notas![0].id).not.toBe('n')
  })
  it('⌘D cai logo depois do fim do grupo e não troca a prancheta', () => {
    const p = dois()
    copiarClipes(p, ['c2'])
    const d = duplicarClipes(p, ['c1', 'c2'])
    // grupo de 2 a 6 → cópia começa em 6
    expect(inicios(d.projeto)).toEqual([[2, 6], [4, 8]])
    expect(inicios(colarClipes(p, 0).projeto)).toEqual([[2], [4, 0]])
  })
})
