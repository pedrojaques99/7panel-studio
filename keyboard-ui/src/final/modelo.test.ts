import { describe, expect, it } from 'vitest'
import {
  aparar, audivel, desfazer, dividir, duplicarClipe, empurrar, encaixar, grauParaMidi, historicoDe,
  moverClipe, mudarPonto, naEscala, valorAutomacao, novaTrilha, novoProjeto, prenderNaEscala, refazer, substituir, duracaoProjeto,
  type Clipe, type Projeto,
} from './modelo'

function comDuas(): Projeto {
  const p = novoProjeto('t')
  const a = novaTrilha('audio', 'a'); a.clipes = [{ id: 'c1', inicio: 2, dur: 10, arquivo: 'x.wav', offset: 0 }]
  const b = novaTrilha('audio', 'b')
  const m = novaTrilha('melodia', 'm'); m.clipes = [{ id: 'c2', inicio: 0, dur: 4, notas: [{ id: 'n1', t: 1, dur: 1, midi: 62, vel: 0.8 }, { id: 'n2', t: 3, dur: 1, midi: 64, vel: 0.8 }] }]
  return { ...p, trilhas: [a, b, m] }
}

describe('solo e mudo', () => {
  it('mudo cala; solo isola', () => {
    const p = comDuas()
    const [a, b, m] = p.trilhas
    expect(audivel(p.trilhas)).toEqual(new Set([a.id, b.id, m.id]))
    expect(audivel([{ ...a, solo: true }, b, m])).toEqual(new Set([a.id]))
    expect(audivel([{ ...a, solo: true, mudo: true }, b, m])).toEqual(new Set())
  })
})

describe('mover', () => {
  it('leva o clipe pra outra trilha de áudio', () => {
    const p = comDuas()
    const q = moverClipe(p, 'c1', 5, p.trilhas[1].id)
    expect(q.trilhas[0].clipes).toHaveLength(0)
    expect(q.trilhas[1].clipes[0]).toMatchObject({ id: 'c1', inicio: 5 })
  })
  it('não deixa áudio cair em trilha de melodia', () => {
    const p = comDuas()
    const q = moverClipe(p, 'c1', 5, p.trilhas[2].id)
    expect(q.trilhas[0].clipes[0].inicio).toBe(5)
    expect(q.trilhas[2].clipes.map(c => c.id)).toEqual(['c2'])
  })
  it('nunca vai pra antes do zero', () => {
    expect(moverClipe(comDuas(), 'c1', -3).trilhas[0].clipes[0].inicio).toBe(0)
  })
})

describe('aparar', () => {
  const c: Clipe = { id: 'c', inicio: 2, dur: 10, arquivo: 'x', offset: 1 }
  it('borda esquerda mantém o áudio no lugar (offset anda junto)', () => {
    const d = aparar(c, 'esq', 4)
    expect(d).toMatchObject({ inicio: 4, dur: 8, offset: 3 })
  })
  it('borda esquerda não passa do começo do arquivo', () => {
    expect(aparar(c, 'esq', 0)).toMatchObject({ inicio: 1, offset: 0, dur: 11 })
  })
  it('borda direita não passa do fim do arquivo', () => {
    expect(aparar(c, 'dir', 30, 8).dur).toBe(7)
  })
})

describe('dividir', () => {
  it('parte áudio no meio e o segundo pedaço continua de onde parou', () => {
    const q = dividir(comDuas(), 'c1', 5)
    const [a, b] = q.trilhas[0].clipes
    expect(a).toMatchObject({ inicio: 2, dur: 3 })
    expect(b).toMatchObject({ inicio: 5, dur: 7, offset: 3 })
  })
  it('parte melodia e cada nota fica no seu pedaço', () => {
    const q = dividir(comDuas(), 'c2', 2)
    const [a, b] = q.trilhas[2].clipes
    expect(a.notas!.map(n => n.midi)).toEqual([62])
    expect(b.notas!.map(n => [n.midi, n.t])).toEqual([[64, 1]])
  })
  it('fora do clipe não faz nada', () => {
    const p = comDuas()
    expect(dividir(p, 'c1', 20)).toBe(p)
  })
})

describe('duplicar', () => {
  it('cola logo depois, com ids novos', () => {
    const { projeto, id } = duplicarClipe(comDuas(), 'c2')
    const [, b] = projeto.trilhas[2].clipes
    expect(b.id).toBe(id)
    expect(b.inicio).toBe(4)
    expect(b.notas![0].id).not.toBe('n1')
  })
})

describe('tempo', () => {
  it('encaixa na grade e grade 0 é livre', () => {
    expect(encaixar(1.3, 0.5)).toBe(1.5)
    expect(encaixar(1.3, 0)).toBe(1.3)
  })
  it('duração do projeto é o fim do último clipe', () => {
    expect(duracaoProjeto(comDuas())).toBe(12)
  })
})

describe('escala', () => {
  // D dórico: D E F G A B C
  it('grau 0 é a raiz e o grau anda pela escala', () => {
    expect(grauParaMidi(0, 2, 1)).toBe(62)
    expect(grauParaMidi(2, 2, 1)).toBe(65)
    expect(grauParaMidi(7, 2, 1)).toBe(74)
    expect(grauParaMidi(-1, 2, 1)).toBe(60)
  })
  it('prender puxa pra nota da escala de baixo', () => {
    expect(naEscala(63, 2, 1)).toBe(false)
    expect(prenderNaEscala(63, 2, 1)).toBe(62)
  })
})

describe('histórico', () => {
  it('desfaz e refaz; edição nova apaga o futuro', () => {
    const p0 = novoProjeto()
    const p1 = { ...p0, bpm: 80 }
    const p2 = { ...p0, bpm: 90 }
    let h = empurrar(historicoDe(p0), p1)
    h = desfazer(h)
    expect(h.presente).toBe(p0)
    h = refazer(h)
    expect(h.presente).toBe(p1)
    h = empurrar(desfazer(h), p2)
    expect(h.futuro).toHaveLength(0)
  })
  it('substituir não vira passo (meio do arrasto)', () => {
    const p0 = novoProjeto()
    const h = substituir(historicoDe(p0), { ...p0, bpm: 100 })
    expect(h.passado).toHaveLength(0)
  })
})

describe('automação', () => {
  const ps = [{ id: 'a', t: 10, db: -20 }, { id: 'b', t: 0, db: 0 }]
  it('sem ponto devolve o fader', () => {
    expect(valorAutomacao(undefined, 5, -6)).toBe(-6)
  })
  it('interpola entre pontos fora de ordem e segura as pontas', () => {
    expect(valorAutomacao(ps, 5, -6)).toBe(-10)
    expect(valorAutomacao(ps, 30, -6)).toBe(-20)
    expect(valorAutomacao([{ id: 'x', t: 4, db: -3 }], 0, -6)).toBe(-3)
  })
  it('mudar ponto prende no limite e mantém ordenado', () => {
    const t = mudarPonto({ ...novaTrilha('audio', 'a'), automacao: ps }, { id: 'c', t: 5, db: 40 })
    expect(t.automacao!.map(p => [p.t, p.db])).toEqual([[0, 0], [5, 6], [10, -20]])
  })
})

describe('relógio', () => {
  it('nunca mostra minuto negativo nem 60 segundos', async () => {
    const { relogio, compassoBatida } = await import('./modelo')
    expect(relogio(-0.001)).toBe('0:00.0')
    expect(relogio(59.97)).toBe('1:00.0')
    expect(relogio(233)).toBe('3:53.0')
    expect(compassoBatida(-0.001, { bpm: 120, compasso: 4 })).toBe('1.1')
    expect(compassoBatida(0.5, { bpm: 120, compasso: 4 })).toBe('1.2')
  })
})
