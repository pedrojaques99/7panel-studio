import { describe, it, expect } from 'vitest'
import { CacheEventos, eventosDoCiclo, avaliarCamadas, camadasSemSom, TETO_EVENTOS } from './consulta'

/** Um padrão falso com o contrato mínimo: `queryArc(a, b)` devolvendo haps. */
function padraoFalso(porCiclo: number, conta?: { n: number }) {
  return {
    queryArc(a: number, b: number) {
      if (conta) conta.n++
      const out = []
      for (let i = 0; i < porCiclo; i++) {
        const ini = a + i / porCiclo
        out.push({ whole: {}, part: { begin: ini, end: ini + 1 / porCiclo } })
      }
      void b
      return out
    },
  }
}

describe('eventosDoCiclo', () => {
  it('devolve posição ABSOLUTA em ciclos, não relativa ao ciclo', () => {
    const evs = eventosDoCiclo(padraoFalso(4), 10)
    expect(evs[0].ini).toBe(10)
    expect(evs[3].ini).toBeCloseTo(10.75, 9)
  })

  // Sinal contínuo ocuparia a faixa inteira e não diria nada.
  it('descarta hap sem `whole` (perlin, sine)', () => {
    const p = { queryArc: () => [{ part: { begin: 0, end: 1 } }, { whole: {}, part: { begin: 0, end: 0.5 } }] }
    expect(eventosDoCiclo(p, 0)).toHaveLength(1)
  })

  it('respeita o teto por ciclo', () => {
    expect(eventosDoCiclo(padraoFalso(5000), 0)).toHaveLength(TETO_EVENTOS)
  })

  it('ignora hap com posição não-finita em vez de desenhar NaN', () => {
    const p = { queryArc: () => [{ whole: {}, part: { begin: NaN, end: 1 } }] }
    expect(eventosDoCiclo(p, 0)).toHaveLength(0)
  })
})

describe('cache', () => {
  it('não reconsulta ciclo que já está em cache', () => {
    const conta = { n: 0 }
    const c = new CacheEventos()
    c.trocar([padraoFalso(4, conta)], [false])
    c.garantir(0, 8)
    expect(conta.n).toBe(8)
    c.garantir(0, 8)          // rolar e voltar é de graça
    expect(conta.n).toBe(8)
    c.garantir(4, 12)         // só os 4 novos
    expect(conta.n).toBe(12)
  })

  it('trocar o padrão joga o cache fora — senão desenharia o take de antes', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(4)], [false])
    c.garantir(0, 8)
    expect(c.tamanho).toBe(8)
    c.trocar([padraoFalso(4)], [false])
    expect(c.tamanho).toBe(0)
  })

  it('camada ilegível vira ciclo vazio, não derruba a tela', () => {
    const c = new CacheEventos()
    c.trocar([null, padraoFalso(2)], [true, false])
    const r = c.garantir(0, 4)
    expect(r.ilegiveis).toEqual([true, false])
    expect(c.ler(0, 0)).toEqual([])
    expect(c.ler(1, 0)).toHaveLength(2)
  })

  it('padrão que estoura num ciclo devolve vazio, não marca ilegível', () => {
    const c = new CacheEventos()
    c.trocar([{ queryArc: () => { throw new Error('arco ruim') } }], [false])
    const r = c.garantir(0, 2)
    expect(r.ilegiveis).toEqual([false])
    expect(c.ler(0, 0)).toEqual([])
  })

  it('ciclo ainda não consultado é null — diferente de "vazio"', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(2)], [false])
    expect(c.ler(0, 5)).toBeNull()
    c.garantir(5, 6)
    expect(c.ler(0, 5)).toHaveLength(2)
  })
})

describe('orçamento', () => {
  /**
   * O relógio é injetado pra o teste provar o comportamento sem depender de a
   * máquina de CI estar lenta naquele segundo. Aqui cada leitura anda 5ms, então
   * o orçamento de 8ms estoura logo no começo.
   */
  const relogioQueCorre = (passo: number) => { let t = 0; return () => (t += passo) }

  it('para de consultar quando estoura, e AVISA', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(2)], [false])
    const r = c.garantir(0, 64, relogioQueCorre(5), 8)
    expect(r.parcial).toBe(true)
    expect(c.tamanho).toBeLessThan(64)
  })

  it('o que coube no orçamento fica certo e permanente', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(2)], [false])
    c.garantir(0, 64, relogioQueCorre(5), 8)
    const primeiro = c.tamanho
    expect(primeiro).toBeGreaterThan(0)
    // quadro seguinte: continua de onde parou, sem refazer o que já tinha
    const r2 = c.garantir(0, 64, relogioQueCorre(5), 8)
    expect(c.tamanho).toBeGreaterThan(primeiro)
    void r2
  })

  it('completa a peça em quadros sucessivos', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(2)], [false])
    let r = c.garantir(0, 64, relogioQueCorre(5), 8)
    for (let i = 0; i < 100 && r.parcial; i++) r = c.garantir(0, 64, relogioQueCorre(5), 8)
    expect(r.parcial).toBe(false)
    expect(c.tamanho).toBe(64)
  })

  it('dentro do orçamento não marca parcial', () => {
    const c = new CacheEventos()
    c.trocar([padraoFalso(2)], [false])
    expect(c.garantir(0, 64, () => 0, 8).parcial).toBe(false)
  })
})

describe('avaliarCamadas', () => {
  it('texto que não vira padrão é marcado ilegível, sem estourar', () => {
    const { padroes, ilegiveis } = avaliarCamadas(['1 + 1', '((('])
    expect(padroes[0]).toBeNull()      // number não tem queryArc
    expect(ilegiveis).toEqual([true, true])
  })

  it('objeto com queryArc passa', () => {
    const { padroes, ilegiveis } = avaliarCamadas(['({ queryArc: () => [] })'])
    expect(typeof padroes[0]?.queryArc).toBe('function')
    expect(ilegiveis).toEqual([false])
  })
})

describe('camadasSemSom', () => {
  /** O `amostraDaCamada` de verdade é testado em `camadas.test.ts`; aqui basta a forma. */
  const banco = (base: string) => {
    const m = /\bs\("([A-Za-z0-9_]+)"\)/.exec(base)
    return m ? { banco: m[1] } : null
  }
  const CONHECIDOS = new Set(['vhulto_kick', 'sawtooth'])

  it('marca a camada cujo banco o motor não tem', () => {
    const fora = camadasSemSom(['s("vhulto_kick")', 's("dirt_dr55")'], CONHECIDOS, banco)
    expect([...fora]).toEqual([1])
  })

  // O bug que motivou tudo: o queryArc funciona, então a faixa desenhava cheia.
  it('camada com banco conhecido não é marcada', () => {
    expect(camadasSemSom(['s("vhulto_kick")'], CONHECIDOS, banco).size).toBe(0)
  })

  /**
   * A distinção que impede a tela de inventar defeito: enquanto o banco carrega
   * (`null`, ou ainda vazio), NINGUÉM é marcado. Vazio não é "nada toca".
   */
  it('sem saber quais sons existem, não marca ninguém', () => {
    expect(camadasSemSom(['s("dirt_dr55")'], null, banco).size).toBe(0)
    expect(camadasSemSom(['s("dirt_dr55")'], new Set(), banco).size).toBe(0)
  })

  it('camada sem sample (nota em oscilador) não é marcada', () => {
    expect(camadasSemSom(['note("c3 e3")'], CONHECIDOS, banco).size).toBe(0)
  })

  // `registerSound` do superdough guarda a chave em minúscula.
  it('compara sem depender de caixa', () => {
    expect(camadasSemSom(['s("VHULTO_KICK")'], CONHECIDOS, banco).size).toBe(0)
  })
})
