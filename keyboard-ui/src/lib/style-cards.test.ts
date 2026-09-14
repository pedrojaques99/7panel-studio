import { describe, it, expect } from 'vitest'
import { matchStyleCards, getAvailableStyles, MUTATIONS } from './style-cards'

/* ── helpers ─────────────────────────────────────────────────────── */

function mutar(id: string, code: string): string {
  const m = MUTATIONS.find(x => x.id === id)
  if (!m) throw new Error(`mutação ${id} não existe — ids: ${MUTATIONS.map(x => x.id).join(', ')}`)
  return m.apply(code)
}

/** todos os argumentos numéricos de um método encadeado, na ordem */
function args(code: string, method: string): number[] {
  const re = new RegExp(`\\.${method}\\((-?\\d+(?:\\.\\d+)?)\\)`, 'g')
  return [...code.matchAll(re)].map(m => parseFloat(m[1]))
}

/** conta ocorrências de uma substring literal */
function conta(code: string, needle: string): number {
  return code.split(needle).length - 1
}

/** o card do Eno é identificado pelo cabeçalho do prompt */
const ENO_HEAD = 'STYLE: Brian Eno'
const casouEno = (msg: string) => matchStyleCards(msg).some(p => p.startsWith(ENO_HEAD))

/* ── entradas realistas ──────────────────────────────────────────── */

// conteúdo de piano-leve-strudel.txt — patch real que passou por esse pipeline
const PIANO_LEVE = `stack(
  note("<[c3,e3,g3,b3] [a2,c3,e3,g3] [f2,a2,c3,e3] [g2,b2,d3,f3]>")
    .s("piano")
    .slow(4)
    .gain(sine.slow(0.1).range(0.3, 0.55))
    .pan(sine.slow(0.08).range(-0.4, 0.4))
    .room(0.8)
    .size(0.8)
    .lpf(sine.slow(0.05).range(800, 1800)),
  note("<[~ g4 ~ b4] [~ e4 ~ a4] [~ c4 ~ e4] [~ d4 ~ g4]>")
    .s("piano")
    .slow(4)
    .gain(rand.range(0.2, 0.45))
    .pan(cosine.slow(0.12).range(-0.7, 0.7))
    .delay(0.4)
    .delaytime(0.5)
    .delayfeedback(0.6)
    .room(0.9)
)`

// o mesmo tipo de patch, mas com groove — o caso que a mutação existe pra resolver
const COM_GROOVE = `stack(
  s("bd*4").bank("RolandTR909").gain(0.8),
  s("~ sd ~ sd").gain(0.6).room(0.3),
  s("hh*8").gain(0.25).hpf(6000),
  s("cp").euclid(3, 8).gain(0.4),
  s("rim*2").gain(0.2),
  note("<[c3,e3,g3] [a2,c3,e3]>").s("piano").slow(2).attack(0.5).release(1.5).room(0.7).lpf(2400)
)`

const SO_PERCUSSAO = `stack(
  s("bd*4").gain(0.8),
  s("~ sd ~ sd").gain(0.6),
  s("hh*16").gain(0.2)
)`

const QUEBRADO = `stack(
  note("<[c3,e3,g3]" .s("piano"
  s("hh*8").gain(`

/* ══════════════════════════════════════════════════════════════════ */

describe('matchStyleCards — card eno', () => {
  it.each([
    'eno',
    'brian eno',
    'music for airports',
    'paulstretch',
  ])('casa o card eno para %j', (msg) => {
    expect(casouEno(msg)).toBe(true)
  })

  it('casa também com a frase inteira e com caixa alta', () => {
    expect(casouEno('quero algo tipo Brian Eno, Music For Airports')).toBe(true)
    expect(casouEno('PAULSTRETCH nisso aqui')).toBe(true)
  })

  it('o prompt do eno proíbe percussão e manda envelope longo', () => {
    const p = matchStyleCards('paulstretch').find(x => x.startsWith(ENO_HEAD))!
    expect(p).toMatch(/SEM percussão/i)
    expect(p).toContain('attack(2)')
    expect(p).toContain('release(6)')
  })

  it('não casa o eno em pedido sem relação', () => {
    expect(casouEno('quero um beat de techno de berghain')).toBe(false)
  })

  it('o id eno está no catálogo público de estilos', () => {
    expect(getAvailableStyles()).toContain('eno')
  })
})

describe('mutação sem-pulso — (a) tira percussão', () => {
  it('remove bd/sd/hh/cp/rim e .bank(), preservando a camada harmônica', () => {
    const out = mutar('sem-pulso', COM_GROOVE)

    for (const p of ['bd', 'sd', 'hh', 'cp', 'rim']) {
      expect(out, `sobrou percussão "${p}"`).not.toMatch(new RegExp(`["'\`][^"'\`]*\\b${p}\\b`))
    }
    expect(out).not.toContain('.bank(')

    // a camada de piano continua lá, inteira
    expect(out).toContain('.s("piano")')
    expect(out).toContain('note("<[c3,e3,g3] [a2,c3,e3]>")')
  })

  it('não mexe num patch que já não tem percussão', () => {
    const out = mutar('sem-pulso', PIANO_LEVE)
    expect(conta(out, 'note(')).toBe(conta(PIANO_LEVE, 'note('))
    expect(conta(out, '.s("piano")')).toBe(2)
  })

  it('stack só de percussão NÃO fica vazio', () => {
    const out = mutar('sem-pulso', SO_PERCUSSAO)

    expect(out.trim()).not.toBe('')
    expect(out).not.toMatch(/stack\(\s*\)/)
    // sobrou material sonoro — nenhuma camada foi engolida
    expect(conta(out, 's(')).toBe(conta(SO_PERCUSSAO, 's('))
  })
})

describe('mutação sem-pulso — (b) alarga o tempo', () => {
  it('dobra o argumento de .slow() existente: 4 → 8', () => {
    const out = mutar('sem-pulso', PIANO_LEVE)
    // as duas camadas do patch estavam em .slow(4)
    expect(args(PIANO_LEVE, 'slow')).toEqual([4, 0.1, 0.08, 0.05, 4, 0.12])
    expect(args(out, 'slow')).toEqual([8, 0.2, 0.16, 0.1, 8, 0.24])
  })

  it('.slow(8) é MAIS LENTO que .slow(4) — nenhum argumento diminui', () => {
    const antes = args(PIANO_LEVE, 'slow')
    const depois = args(mutar('sem-pulso', PIANO_LEVE), 'slow')

    expect(depois).toHaveLength(antes.length)
    antes.forEach((v, i) => {
      // em Strudel, slow(n) maior = ciclo mais longo = modulação mais lenta
      expect(depois[i], `slow(${v}) deveria crescer, virou ${depois[i]}`).toBeGreaterThan(v)
      expect(depois[i]).toBeCloseTo(v * 2, 6)
    })
  })

  it('não acelera nada: não introduz .fast() nem encurta ciclo', () => {
    const out = mutar('sem-pulso', PIANO_LEVE)
    expect(out).not.toContain('.fast(')
    expect(Math.min(...args(out, 'slow'))).toBeGreaterThan(Math.min(...args(PIANO_LEVE, 'slow')))
  })

  it('insere .slow(2) na camada que não tinha nenhum .slow()', () => {
    const semSlow = `stack(
  note("c3 e3 g3").s("piano").room(0.7),
  note("g4 b4").s("piano").room(0.8)
)`
    const out = mutar('sem-pulso', semSlow)
    expect(args(semSlow, 'slow')).toEqual([])
    expect(args(out, 'slow')).toEqual([2, 2])
  })

  it('numa expressão solta (sem stack) também garante .slow(2)', () => {
    const out = mutar('sem-pulso', 'note("c3 e3 g3").s("piano").room(0.7)')
    expect(args(out, 'slow')).toEqual([2])
  })

  it('não duplica .slow() em quem já tem', () => {
    const out = mutar('sem-pulso', 'note("c3").s("piano").slow(3)')
    expect(args(out, 'slow')).toEqual([6])
    expect(conta(out, '.slow(')).toBe(1)
  })
})

describe('mutação sem-pulso — (c) alonga o envelope', () => {
  const ENV = 'note("c3 e3").s("piano").attack(0.5).release(1.5).slow(2)'

  it('attack e release crescem (piso 2 s / 6 s)', () => {
    const out = mutar('sem-pulso', ENV)
    expect(args(out, 'attack')).toEqual([2])   // max(2, 0.5*2)
    expect(args(out, 'release')).toEqual([6])  // max(6, 1.5*2)
  })

  it('envelope já longo dobra em vez de ser cortado pelo piso', () => {
    const out = mutar('sem-pulso', 'note("c3").attack(4).release(10).slow(2)')
    expect(args(out, 'attack')).toEqual([8])
    expect(args(out, 'release')).toEqual([20])
  })

  it('nunca encurta: attack/release depois >= antes', () => {
    const out = mutar('sem-pulso', COM_GROOVE)
    expect(Math.min(...args(out, 'attack'))).toBeGreaterThanOrEqual(2)
    expect(Math.min(...args(out, 'release'))).toBeGreaterThanOrEqual(6)
  })
})

describe('mutação sem-pulso — robustez', () => {
  it('código sintaticamente quebrado volta INTACTO e não estoura', () => {
    let out!: string
    expect(() => { out = mutar('sem-pulso', QUEBRADO) }).not.toThrow()
    expect(out).toBe(QUEBRADO)
  })

  it.each([
    ['string vazia', ''],
    ['só espaço', '   \n  '],
    ['texto que não é código', 'não sei tocar isso'],
    ['stack sem fechar', 'stack(note("c3"'],
    ['parênteses invertidos', ')))((('],
  ])('não estoura com %s', (_nome, code) => {
    expect(() => mutar('sem-pulso', code)).not.toThrow()
    expect(typeof mutar('sem-pulso', code)).toBe('string')
  })

  it('é idempotente no sentido de nunca perder material entre aplicações', () => {
    const uma = mutar('sem-pulso', PIANO_LEVE)
    const duas = mutar('sem-pulso', uma)
    expect(conta(duas, 'note(')).toBe(conta(uma, 'note('))
    expect(Math.min(...args(duas, 'slow'))).toBeGreaterThan(Math.min(...args(uma, 'slow')))
  })
})

describe('mutações existentes — fumaça', () => {
  const COM_PARAMS = 'note("c3").s("piano").lpf(2000).hpf(400).room(0.5).size(0.5).crush(8).degradeBy(0.3).delay(0.2)'

  it('darker escurece o filtro e molha mais', () => {
    const out = mutar('darker', COM_PARAMS)
    expect(args(out, 'lpf')).toEqual([1400])   // 2000 * 0.7
    expect(args(out, 'room')).toEqual([0.65])  // 0.5 + 0.15
    expect(args(out, 'hpf')).toEqual([400])    // não é assunto do darker
  })

  it('wetter aplica os TRÊS passos, não só o último', () => {
    // Regressão de um bug de uma letra: o terceiro passo lia de `code` em vez de
    // `c`, então `room` e `size` eram calculados e jogados fora — só o `delay`
    // sobrevivia. Passava despercebido porque a mutação "funcionava": mexia em
    // alguma coisa. Este teste exige as três de uma vez.
    const out = mutar('wetter', COM_PARAMS)
    expect(args(out, 'room')).toEqual([0.7])    // 0.5 + 0.2
    expect(args(out, 'size')).toEqual([0.65])   // 0.5 + 0.15
    expect(args(out, 'delay')).toEqual([0.35])  // 0.2 + 0.15
  })

  it('warmer baixa crush, hpf e lpf', () => {
    const out = mutar('warmer', COM_PARAMS)
    expect(args(out, 'crush')).toEqual([6])    // 8 - 2
    expect(args(out, 'hpf')).toEqual([200])    // 400 * 0.5
    expect(args(out, 'lpf')).toEqual([1700])   // 2000 * 0.85
  })

  it('degrade só mexe em degradeBy', () => {
    const out = mutar('degrade', COM_PARAMS)
    expect(args(out, 'degradeBy')).toEqual([0.45]) // 0.3 + 0.15
    expect(args(out, 'lpf')).toEqual([2000])
    expect(args(out, 'room')).toEqual([0.5])
  })

  it('nenhuma mutação estoura, some com o código ou devolve não-string', () => {
    for (const m of MUTATIONS) {
      for (const code of [PIANO_LEVE, COM_GROOVE, COM_PARAMS, QUEBRADO, '']) {
        let out!: string
        expect(() => { out = m.apply(code) }, `${m.id} estourou`).not.toThrow()
        expect(typeof out, `${m.id} não devolveu string`).toBe('string')
        if (code.trim()) expect(out.trim(), `${m.id} apagou o código`).not.toBe('')
      }
    }
  })
})
