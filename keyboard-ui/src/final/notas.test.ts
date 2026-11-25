import { describe, expect, it } from 'vitest'
import { acorde, andarLinha, colar, legato, copiar, duplicar, esticar, fantasmas, moverNotas, noLaco, oitava, quantizar, velocity } from './notas'
import type { Nota } from './modelo'

const n = (id: string, t: number, midi: number, dur = 1, vel = 0.8): Nota => ({ id, t, dur, midi, vel })
// D dórico de 62 a 50, do agudo pro grave, como o roll mostra
const LINHAS = [62, 60, 59, 57, 55, 53, 52, 50]

describe('andar por linha', () => {
  it('↑ vai pro próximo grau, não pro semitom', () => {
    expect(andarLinha(57, 1, LINHAS)).toBe(59)
    expect(andarLinha(57, -1, LINHAS)).toBe(55)
  })
  it('prende na ponta', () => {
    expect(andarLinha(62, 3, LINHAS)).toBe(62)
    expect(andarLinha(50, -1, LINHAS)).toBe(50)
  })
  it('nota fora das linhas parte da mais próxima', () => {
    expect(andarLinha(58, 1, LINHAS)).toBe(60)
  })
})

describe('grupo', () => {
  const ns = [n('a', 1, 57), n('b', 2, 60), n('c', 3, 50)]
  const ab = new Set(['a', 'b'])

  it('move junto e não passa do zero', () => {
    const r = moverNotas(ns, ab, -5, 1, LINHAS)
    expect(r.map(x => [x.t, x.midi])).toEqual([[0, 59], [1, 62], [3, 50]])
  })
  it('oitava: o acorde inteiro cabe ou ninguém anda', () => {
    expect(oitava(ns, ab, 1, 36, 84).map(x => x.midi)).toEqual([69, 72, 50])
    expect(oitava(ns, ab, 1, 36, 70)).toBe(ns)
  })
  it('esticar tem piso', () => {
    expect(esticar(ns, ab, -2).map(x => x.dur)).toEqual([0.05, 0.05, 1])
  })
  it('velocity presa em [0.05, 1]', () => {
    expect(velocity(ns, ab, 0.5).map(x => x.vel)).toEqual([1, 1, 0.8])
  })
})

describe('prancheta', () => {
  const ns = [n('a', 2, 57), n('b', 3, 60, 2)]
  it('copia relativo e cola com id novo', () => {
    const p = copiar(ns, new Set(['a', 'b']))
    expect(p.map(x => x.t)).toEqual([0, 1])
    const r = colar(ns, p, 8)
    expect(r.notas).toHaveLength(4)
    expect(r.notas.slice(2).map(x => x.t)).toEqual([8, 9])
    expect([...r.ids].some(id => id === 'a' || id === 'b')).toBe(false)
  })
  it('⌘D cai logo depois, arredondado na grade', () => {
    // seleção de 2 a 5 (3 s); grade de 2 s → passo 4
    const r = duplicar(ns, new Set(['a', 'b']), 2)
    expect(r.notas.slice(2).map(x => x.t)).toEqual([6, 7])
  })
})

describe('laço', () => {
  it('pega quem toca o retângulo, em qualquer direção de arrasto', () => {
    const ns = [n('a', 0, 62), n('b', 2, 57), n('c', 5, 50)]
    const linhaDe = (m: number) => LINHAS.indexOf(m)
    expect(noLaco(ns, 3, 0.5, 4, 0, linhaDe)).toEqual(new Set(['a', 'b']))
  })
})

describe('quantizar', () => {
  const ns = [n('a', 0.9, 60), n('b', 2.2, 62)]
  it('100% cola na grade, 50% vai metade', () => {
    expect(quantizar(ns, new Set(['a', 'b']), 1).map(x => x.t)).toEqual([1, 2])
    expect(quantizar(ns, new Set(['a', 'b']), 1, 0.5).map(x => +x.t.toFixed(3))).toEqual([0.95, 2.1])
  })
  it('grade desligada não mexe', () => {
    expect(quantizar(ns, new Set(['a']), 0)).toBe(ns)
  })
})

describe('fantasmas', () => {
  it('traz as notas das outras melodias no tempo do clipe, e ignora áudio e o próprio clipe', () => {
    const trilhas = [
      { tipo: 'melodia', clipes: [{ id: 'eu', inicio: 4, notas: [n('x', 0, 60)] }, { id: 'outro', inicio: 0, notas: [n('y', 5, 64), n('z', 1, 65)] }] },
      { tipo: 'audio', clipes: [{ id: 'au', inicio: 4 }] },
      { tipo: 'melodia', clipes: [{ id: 'm2', inicio: 6, notas: [n('w', 0, 67)] }] },
    ]
    expect(fantasmas(trilhas, 'eu', 4, 4).map(x => [x.id, x.t])).toEqual([['y', 1], ['w', 2]])
  })
})

describe('acorde na escala', () => {
  // D dórico do grave pro agudo
  const GRAUS = [50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]
  it('tríade empilha terças da escala (D → D F A) e a seleção cresce', () => {
    const r = acorde([n('a', 0, 50)], new Set(['a']), GRAUS, false, 84)
    expect(r.notas.map(x => x.midi)).toEqual([50, 53, 57])
    expect(r.ids.size).toBe(3)
  })
  it('tétrade em E dá E G B D; nota já presente não duplica', () => {
    const r = acorde([n('a', 0, 52), n('b', 0, 55)], new Set(['a']), GRAUS, true, 84)
    expect(r.notas.map(x => x.midi).sort((a, b) => a - b)).toEqual([52, 55, 59, 62])
  })
  it('o teto corta só o que passa dele', () => {
    const r = acorde([n('a', 0, 69)], new Set(['a']), GRAUS, false, 71)
    expect(r.notas.map(x => x.midi)).toEqual([69])
  })
})

describe('legato', () => {
  it('estica até a próxima; acorde anda junto; a última fica', () => {
    const ns = [n('a', 0, 60, 0.2), n('b', 0, 64, 0.2), n('c', 1, 62, 0.2), n('d', 3, 65, 0.5)]
    expect(legato(ns, new Set(['a', 'b', 'c', 'd'])).map(x => x.dur)).toEqual([1, 1, 2, 0.5])
  })
})
