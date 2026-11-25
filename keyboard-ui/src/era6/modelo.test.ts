import { describe, expect, it } from 'vitest'
import {
  PADRAO, rng, agendar, morph, respiracao, agendarEstalos, passoDeriva, comDeriva, prender, sortearParams, orbita,
  agendarNotas, agendarGolpes, padraoPerc, alternarPasso, passoS, ESCALAS, MANUAL,
  agendarFrase, alternarCelula, escreverNota, semitomDoGrau,
  type ParamsCamada,
} from './modelo'
import { medirEspectro, dinamica, portoes } from './medidor'

const p = (x: Partial<ParamsCamada> = {}): ParamsCamada => ({ ...PADRAO, ...x })

describe('agenda de grãos (portão F1)', () => {
  it('mesma seed dá a mesma sequência de grãos', () => {
    const a = agendar(p(), 60, 0, 10, rng(1618)).graos
    const b = agendar(p(), 60, 0, 10, rng(1618)).graos
    expect(a).toEqual(b)
    expect(agendar(p(), 60, 0, 10, rng(1619)).graos).not.toEqual(a)
  })

  it('agendar em pedaços de tick é igual a agendar de uma vez', () => {
    const r1 = rng(7), r2 = rng(7)
    const inteiro = agendar(p(), 30, 0, 5, r1).graos
    const picado = []
    let prox = 0
    for (let t = 0; t < 5 - 1e-9; t += 0.1) {
      const res = agendar(p(), 30, Math.max(prox, t), t + 0.1, r2)
      picado.push(...res.graos)
      prox = res.prox
    }
    expect(picado.length).toBe(inteiro.length)
    expect(picado.map(g => g.t)).toEqual(inteiro.map(g => g.t))
  })

  it('densidade média bate com o knob (±10 %)', () => {
    const g = agendar(p({ dens: 20 }), 60, 0, 60, rng(3)).graos
    expect(g.length / 60).toBeGreaterThan(18)
    expect(g.length / 60).toBeLessThan(22)
  })

  it('grão nunca sai do sample e spray 0 fica na posição', () => {
    const g = agendar(p({ spray: 0, pos: 0.5, tam: 200 }), 10, 0, 5, rng(1)).graos
    for (const x of g) {
      expect(x.offset).toBeGreaterThanOrEqual(0)
      expect(x.offset + x.dur).toBeLessThanOrEqual(10 + 1e-9)
      expect(Math.abs(x.offset - 5)).toBeLessThan(1e-9)
    }
  })

  it('ganho cai com a sobreposição: densidade não vira volume', () => {
    const baixo = agendar(p({ dens: 2, tam: 200 }), 30, 0, 2, rng(1)).graos[0].ganho
    const alto = agendar(p({ dens: 60, tam: 200 }), 30, 0, 2, rng(1)).graos[0].ganho
    // energia ~ n·ganho²: 60/s × 0,2 s = 12 grãos sobrepostos → ganho² × 12 ≈ 1
    expect(alto * alto * 12).toBeCloseTo(1, 1)
    expect(baixo).toBe(1)
  })
})

describe('deriva', () => {
  it('pitch com deriva continua em semitom inteiro', () => {
    const r = rng(5)
    let d = 0
    for (let i = 0; i < 200; i++) {
      d = passoDeriva('pitch', d, { ligada: true, quanto: 0.5 }, r)
      expect(Number.isInteger(comDeriva('pitch', 0, d))).toBe(true)
    }
  })
  it('deriva desligada volta pro valor da mão', () => {
    let d = 0.5
    for (let i = 0; i < 100; i++) d = passoDeriva('pos', d, { ligada: false, quanto: 0.3 }, rng(1))
    expect(Math.abs(d)).toBeLessThan(1e-3)
  })
  it('respira só assume Fibonacci', () => {
    expect(prender('respira', 10)).toBe(8)
    expect(prender('respira', 0.4)).toBe(0)
  })
})

describe('cenas (portão F2)', () => {
  it('morph chega exatamente na cena B', () => {
    const a = [p({ pos: 0.1, tam: 50, lp: 400 })]
    const b = [p({ pos: 0.9, tam: 800, lp: 3000, respira: 13 })]
    expect(morph(a, b, 1)).toEqual(b)
    expect(morph(a, b, 0)).toEqual(a)
    // meio do caminho em escala log pro tamanho do grão: √(50·800) = 200
    expect(morph(a, b, 0.5)[0].tam).toBeCloseTo(200, 5)
  })
})

describe('respira e estalo', () => {
  it('respira 0 = sempre ligado; período fecha o ciclo', () => {
    expect(respiracao(0, 3.3)).toBe(1)
    expect(respiracao(8, 0)).toBeCloseTo(0)
    expect(respiracao(8, 4)).toBeCloseTo(1)
  })
  it('estalos por minuto batem com o knob (±15 %)', () => {
    const e = agendarEstalos(60, 0, 600, rng(9))
    expect(e.length / 10).toBeGreaterThan(51)
    expect(e.length / 10).toBeLessThan(69)
  })
})

describe('medidor (portões Sonmi451)', () => {
  const sr = 48000, n = 1024
  const espectroCom = (f: number) => {
    const db = new Float32Array(n).fill(-140)
    db[Math.round((f * 2 * n) / sr)] = 0
    return db
  }
  it('tom em 300 Hz: centroide 300, tudo em 120–500, nada no agudo', () => {
    const m = medirEspectro(espectroCom(300), sr)
    expect(m.centroide).toBeGreaterThan(280)
    expect(m.centroide).toBeLessThan(320)
    expect(m.grave).toBeGreaterThan(99)
    expect(m.agudo).toBeLessThan(0.01)
  })
  it('tom em 5 kHz reprova o portão de agudo', () => {
    const m = medirEspectro(espectroCom(5000), sr)
    const g = portoes(m, 20, 40)
    expect(g.find(x => x.id === 'agudo')!.ok).toBe(false)
    expect(g.find(x => x.id === 'dinamica')!.ok).toBe(true)
  })
  it('dinâmica P95–P5 ignora silêncio 60 dB abaixo', () => {
    const h = [...Array(50).fill(-20), ...Array(50).fill(-40), ...Array(30).fill(-120)]
    expect(dinamica(h)).toBeCloseTo(20, 5)
  })
})

describe('sortear knobs (botão 🔀)', () => {
  it('fica nas faixas do estilo e não mexe no nível', () => {
    const r = rng(42)
    for (let i = 0; i < 200; i++) {
      const s = sortearParams(p({ nivel: -17 }), r)
      expect(s.nivel).toBe(-17)
      expect(s.lp).toBeGreaterThanOrEqual(600)
      expect(s.lp).toBeLessThanOrEqual(3000)
      expect([-24, -12, -7, -5, 0, 7]).toContain(s.pitch)
      expect([0, 8, 13, 21, 34]).toContain(s.respira)
      for (const k of Object.keys(s) as (keyof ParamsCamada)[]) expect(prender(k, s[k])).toBeCloseTo(s[k], 9)
    }
  })
})

describe('pan em órbita (surround)', () => {
  it('vai de um lado ao outro no período da camada e fica em −1..1', () => {
    const vals = Array.from({ length: 500 }, (_, k) => orbita(0, 0, (k / 500) * 5, 0.7))
    expect(Math.min(...vals)).toBeLessThan(-0.95)
    expect(Math.max(...vals)).toBeGreaterThan(0.95)
    for (const v of vals) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1) }
    expect(orbita(0, 0, 0, 0.7)).toBeCloseTo(orbita(0, 0, 5, 0.7), 9)   // fecha em 5 s na camada 1
  })
  it('camadas diferentes não andam juntas', () => {
    expect(orbita(0, 0, 3, 0.5)).not.toBeCloseTo(orbita(0, 1, 3, 0.5), 2)
  })
  it('grão respeita o centro: pan todo pra esquerda com width 0', () => {
    const g = agendar({ ...PADRAO, centro: -1, pan: 0 }, 10, 0, 2, rng(1)).graos
    for (const x of g) expect(x.pan).toBe(-1)
  })
})

describe('melodia (PLANO-tipos-camada-era6.md, T1)', () => {
  // agenda tick a tick, como o motor faz
  const picada = (x: ParamsCamada, raiz: number | null, seed: number, dur = 60) => {
    const r = rng(seed)
    const out = []
    let prox = 0, grau = -1
    for (let t = 0; t < dur - 1e-9; t += 0.1) {
      const res = agendarNotas(x, 20, raiz, Math.max(prox, t), t + 0.1, grau, r)
      out.push(...res.graos)
      prox = res.prox
      grau = res.grau
    }
    return out
  }
  it('mesma seed dá as mesmas notas', () => {
    expect(picada(p({ notas: 30 }), 3, 5)).toEqual(picada(p({ notas: 30 }), 3, 5))
    expect(picada(p({ notas: 30 }), 3, 5)).not.toEqual(picada(p({ notas: 30 }), 3, 6))
  })
  it('toda nota cai na escala pedida, a partir da nota do sample', () => {
    for (const escala of [0, 1, 3]) {
      const x = p({ notas: 60, raiz: 2, escala, salto: 1 })   // D
      const permitidas = new Set(ESCALAS[escala].semitons.map(s => (s + 2) % 12))
      const notas = picada(x, 9, 1)   // sample em A
      expect(notas.length).toBeGreaterThan(30)
      for (const g of notas) {
        const pc = (((9 + Math.round(12 * Math.log2(g.rate))) % 12) + 12) % 12
        expect(permitidas).toContain(pc)
      }
    }
  })
  it('é esparsa: a taxa bate com notes/min (±25 %)', () => {
    const n = picada(p({ notas: 12 }), 0, 9, 300).length
    expect(n).toBeGreaterThan(45)
    expect(n).toBeLessThan(75)
  })
})

describe('percussão (PLANO-tipos-camada-era6.md, T1)', () => {
  it('Euclides 5 em 16 com giro e máscara manual', () => {
    expect(padraoPerc(p({ pulsos: 5, passos: 16, giro: 0 })).filter(Boolean)).toHaveLength(5)
    const g0 = padraoPerc(p({ pulsos: 3, passos: 8, giro: 0 }))
    const g1 = padraoPerc(p({ pulsos: 3, passos: 8, giro: 1 }))
    expect(g1).toEqual([g0[7], ...g0.slice(0, 7)])
    const x = p({ pulsos: 3, passos: 8 })
    const m = alternarPasso(x, 1)
    expect(m).toBeGreaterThanOrEqual(MANUAL)
    expect(padraoPerc({ ...x, mascara: m })[1]).toBe(!g0[1])
  })
  it('golpe cai na grade do bpm, com atraso só até o humanize', () => {
    const x = p({ bpm: 90, pulsos: 16, passos: 16, prob: 1, humano: 20 })
    const ps = passoS(90)
    const gs = agendarGolpes(x, 2, 0, 0, 8, rng(3))
    expect(gs.length).toBe(Math.ceil(8 / ps))
    for (const g of gs) {
      const resto = g.t - Math.floor(g.t / ps + 1e-9) * ps
      expect(resto).toBeLessThanOrEqual(0.02 + 1e-9)
    }
  })
  it('picado em ticks é igual a de uma vez (nenhum passo some ou dobra na borda)', () => {
    const x = p({ bpm: 75, pulsos: 7, passos: 12, prob: 0.6 })
    const inteiro = agendarGolpes(x, 3, 0.05, 0.05, 20.05, rng(11))
    const r = rng(11)
    const picado = []
    let t = 0.05
    for (let k = 0; k < 200; k++) { picado.push(...agendarGolpes(x, 3, 0.05, t, t + 0.1, r)); t = t + 0.1 }
    expect(picado).toEqual(inteiro)
  })
  it('tipos novos morfam em degrau: escala não passa por escala intermediária', () => {
    const a = [p({ escala: 0, raiz: 0 })], b = [p({ escala: 5, raiz: 7 })]
    expect(morph(a, b, 0.3)[0].escala).toBe(0)
    expect(morph(a, b, 0.7)[0].raiz).toBe(7)
  })
})

describe('melodia escrita à mão (grade e teclado)', () => {
  it('a frase toca no passo escrito, no grau certo, e repete a cada 16 batidas', () => {
    const x = p({ bpm: 60, raiz: 2, escala: 1 })   // Ré dórico, 1 passo = 1 s
    const frase = [{ passo: 0, grau: 0, len: 2 }, { passo: 4, grau: 4, len: 1 }]
    const gs = agendarFrase(x, frase, 10, 2, 0, 0, 32)   // sample em Ré: sem transposição de base
    expect(gs.map(g => g.t)).toEqual([0, 4, 16, 20])
    expect(Math.round(12 * Math.log2(gs[1].rate))).toBe(semitomDoGrau(1, 4))   // Lá = +7
    expect(gs[0].dur).toBeCloseTo(2 * 0.95, 5)
  })
  it('picado em ticks é igual a de uma vez', () => {
    const x = p({ bpm: 66 })
    const frase = [{ passo: 1, grau: 2, len: 3 }, { passo: 9, grau: 0, len: 1 }]
    const inteiro = agendarFrase(x, frase, 10, 0, 0.05, 0.05, 40.05)
    const picado = []
    let t = 0.05
    for (let k = 0; k < 400; k++) { picado.push(...agendarFrase(x, frase, 10, 0, 0.05, t, t + 0.1)); t += 0.1 }
    expect(picado).toEqual(inteiro)
  })
  it('clicar cria e apaga; escrever por cima substitui só na mesma linha', () => {
    let f = alternarCelula([], 3, 2)
    expect(f).toEqual([{ passo: 3, grau: 2, len: 1 }])
    f = escreverNota(f, 2, 2, 4)           // cobre o passo 3 na mesma linha
    expect(f).toEqual([{ passo: 2, grau: 2, len: 4 }])
    f = escreverNota(f, 2, 5, 1)           // outra linha: convive
    expect(f).toHaveLength(2)
    expect(alternarCelula(f, 4, 2)).toEqual([{ passo: 2, grau: 5, len: 1 }])   // clicar no meio da nota apaga ela
    expect(escreverNota([], 14, 0, 8)[0].len).toBe(2)   // não passa do fim do loop
  })
})

describe('melodia livre (fora da grade)', () => {
  it('nota gravada solta toca no tempo quebrado exato, e repete a cada volta', () => {
    const x = p({ bpm: 60 })   // 1 passo = 1 s, volta de 16 s
    const gs = agendarFrase(x, [{ passo: 2.37, grau: 0, len: 0.6 }], 10, 0, 0, 0, 40)
    expect(gs.map(g => +g.t.toFixed(6))).toEqual([2.37, 18.37, 34.37])
    expect(gs[0].dur).toBeCloseTo(0.6 * 0.95, 6)
  })
  it('picado em ticks é igual a de uma vez com nota solta', () => {
    const x = p({ bpm: 71 })
    const frase = [{ passo: 0.4, grau: 1, len: 1.3 }, { passo: 11.92, grau: 3, len: 0.25 }]
    const inteiro = agendarFrase(x, frase, 10, 0, 0.05, 0.05, 50.05)
    const picado = []
    let t = 0.05
    for (let k = 0; k < 500; k++) { picado.push(...agendarFrase(x, frase, 10, 0, 0.05, t, t + 0.1)); t += 0.1 }
    expect(picado).toEqual(inteiro)
  })
  it('escrever livre não arredonda; com snap arredonda', () => {
    expect(escreverNota([], 3.3, 0, 0.7, true)).toEqual([{ passo: 3.3, grau: 0, len: 0.7 }])
    expect(escreverNota([], 3, 0, 0.7)[0].len).toBe(1)
    expect(alternarCelula([{ passo: 3.3, grau: 0, len: 0.7 }], 3, 0)).toEqual([])   // a célula 3 apaga a nota solta
  })
})
