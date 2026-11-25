import { describe, expect, it } from 'vitest'
import { PADRAO, rng, agendar } from './modelo'
import { corDoSample, graoParaTraco, type Paleta } from './pintura'

const PALETA: Paleta = {
  stops: [[200, 60, 50], [230, 140, 40], [220, 200, 60], [240, 180, 90], [90, 190, 100]],
  neutro: [120, 115, 110],
  fundo: [14, 13, 12],
}

describe('pintura (portões do PLANO-visual-era6.md)', () => {
  it('determinismo: a mesma lista de grãos dá os mesmos traços', () => {
    const tracos = (seed: number) => agendar({ ...PADRAO, rev: 0.4 }, 30, 0, 20, rng(seed)).graos
      .map((g, k) => graoParaTraco(g, { camada: k % 6, frac: g.offset / 30, mao: false, deriva: k % 2 === 0, cor: [1, 2, 3] }))
    expect(JSON.stringify(tracos(1618))).toBe(JSON.stringify(tracos(1618)))
    expect(JSON.stringify(tracos(1619))).not.toBe(JSON.stringify(tracos(1618)))
  })

  it('paleta: toda cor é mistura dos tokens (fica dentro do envelope deles)', () => {
    const todos = [...PALETA.stops, PALETA.neutro]
    const lo = [0, 1, 2].map(c => Math.min(...todos.map(t => t[c])))
    const hi = [0, 1, 2].map(c => Math.max(...todos.map(t => t[c])))
    const r = rng(3)
    for (let i = 0; i < 500; i++) {
      const cor = corDoSample(50 + r() * 12000, r() * 0.5, PALETA)
      cor.forEach((v, c) => { expect(v).toBeGreaterThanOrEqual(lo[c] - 1e-9); expect(v).toBeLessThanOrEqual(hi[c] + 1e-9) })
    }
  })

  it('ruído puxa pro neutro, tonal mantém a cor', () => {
    const tonal = corDoSample(500, 0, PALETA)
    const ruido = corDoSample(500, 0.3, PALETA)
    const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))
    expect(dist(ruido, PALETA.neutro)).toBeLessThan(dist(tonal, PALETA.neutro))
  })

  it('grão ao contrário corre pra esquerda; y = lugar no sample; grave inclina pra baixo', () => {
    const base = { t: 0, offset: 1, dur: 0.2, pan: 0, ganho: 0.5 }
    const info = { camada: 2, frac: 0.5, mao: true, deriva: false, cor: [0, 0, 0] as [number, number, number] }
    const frente = graoParaTraco({ ...base, rate: 1, reverso: false }, info)
    const tras = graoParaTraco({ ...base, rate: 1, reverso: true }, info)
    const grave = graoParaTraco({ ...base, rate: 0.25, reverso: false }, info)
    const agudo = graoParaTraco({ ...base, rate: 2, reverso: false }, info)
    const inicio = graoParaTraco({ ...base, rate: 1, reverso: false }, { ...info, frac: 0.05 })
    expect(frente.sentido).toBe(1)
    expect(tras.sentido).toBe(-1)
    expect(grave.inclina).toBeLessThan(0)
    expect(agudo.inclina).toBeGreaterThan(0)
    expect(inicio.y).toBeLessThan(frente.y)
    expect(frente.nitida).toBe(true)
  })

  it('cobre a tela: grão espalhado pelo sample e pelo pan ocupa os 4 quadrantes', () => {
    const r = rng(11)
    const q = new Set<string>()
    for (let k = 0; k < 400; k++) {
      const t = graoParaTraco({ t: 0, offset: 0, dur: 0.1, rate: 1, reverso: false, pan: r() * 2 - 1, ganho: 0.5 },
        { camada: 0, frac: r(), mao: false, deriva: false, cor: [0, 0, 0] })
      q.add(`${t.x < 1024 ? 'e' : 'd'}${t.y < 1024 ? 'c' : 'b'}`)
    }
    expect(q.size).toBe(4)
  })
})
