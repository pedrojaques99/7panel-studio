import { describe, it, expect } from 'vitest'
import { zoomIdentity } from 'd3-zoom'
import {
  GUTTER, CICLOS_SEM_ARRANJO, CORTE_DENSIDADE, CORTE_EVENTOS,
  ciclosDoArranjo, zoomMaximo, escalaBase, escalaComZoom, ciclosVisiveis,
  pxPorCiclo, detalheDe, ehSoTexto, enquadrar, pecaInteira, segundosPorCiclo,
} from './escala'
import type { Arranjo } from './camadas'

const PADRAO: Arranjo = { casas: 8, porCasa: 8 }   // 64 ciclos, o do repertório
const L = 800

describe('comprimento da peça', () => {
  it('casas × porCasa', () => {
    expect(ciclosDoArranjo(PADRAO)).toBe(64)
    expect(ciclosDoArranjo({ casas: 4, porCasa: 8 })).toBe(32)
  })

  // Sem máscara não se inventa comprimento: degrada pra janela curta.
  it('sem arranjo cai na janela curta em vez de zero', () => {
    expect(ciclosDoArranjo(null)).toBe(CICLOS_SEM_ARRANJO)
    expect(ciclosDoArranjo({ casas: 0, porCasa: 8 })).toBe(CICLOS_SEM_ARRANJO)
  })
})

describe('o eixo', () => {
  it('k=1 mostra a peça inteira, do gutter à borda', () => {
    const e = escalaBase(PADRAO, L)
    expect(e(0)).toBe(GUTTER)
    expect(e(64)).toBe(L)
  })

  // A identidade que a `Timeline.tsx` não tinha como garantir: desenho e clique
  // usam a MESMA função, então converter ida e volta não pode andar.
  it('invert(scale(c)) === c em todo o domínio', () => {
    const e = escalaComZoom(PADRAO, L, zoomIdentity.scale(7).translate(-120, 0))
    for (const c of [0, 1, 7.5, 31, 63.99, 64]) {
      expect(e.invert(e(c))).toBeCloseTo(c, 9)
    }
  })

  it('zoom máximo é UM ciclo ocupando a tela — a Timeline.tsx de hoje', () => {
    expect(zoomMaximo(PADRAO)).toBe(64)
    const e = escalaComZoom(PADRAO, L, zoomIdentity.scale(64))
    expect(pxPorCiclo(e)).toBeCloseTo(L - GUTTER, 6)
  })

  it('peça de 1 ciclo não gera scaleExtent invertido', () => {
    expect(zoomMaximo({ casas: 1, porCasa: 1 })).toBeGreaterThanOrEqual(1)
  })
})

describe('faixa visível', () => {
  it('na peça inteira, é a peça inteira', () => {
    const { ini, fim } = ciclosVisiveis(escalaBase(PADRAO, L), PADRAO, L)
    expect(ini).toBe(0)
    expect(fim).toBe(64)
  })

  it('fechado, são poucos ciclos — é isso que impede a consulta de explodir', () => {
    const e = escalaComZoom(PADRAO, L, enquadrar(PADRAO, L, 30, 32))
    const { ini, fim } = ciclosVisiveis(e, PADRAO, L)
    expect(ini).toBe(30)
    expect(fim - ini).toBeLessThanOrEqual(4)
  })

  it('nunca sai dos limites da peça', () => {
    const e = escalaComZoom(PADRAO, L, enquadrar(PADRAO, L, -50, 500))
    const { ini, fim } = ciclosVisiveis(e, PADRAO, L)
    expect(ini).toBeGreaterThanOrEqual(0)
    expect(fim).toBeLessThanOrEqual(64)
  })
})

describe('nível de detalhe', () => {
  it('os três degraus, pelos cortes declarados', () => {
    expect(detalheDe(CORTE_DENSIDADE - 0.1)).toBe('casas')
    expect(detalheDe(CORTE_DENSIDADE)).toBe('densidade')
    expect(detalheDe(CORTE_EVENTOS - 0.1)).toBe('densidade')
    expect(detalheDe(CORTE_EVENTOS)).toBe('eventos')
  })

  /**
   * A promessa de performance do plano, na forma em que ela é VERDADE.
   *
   * A primeira versão deste teste afirmava que a peça inteira não consulta nada,
   * e ele reprovou: 64 ciclos em 800px são 10,9px cada, que é `densidade` — a
   * peça inteira consulta 64 ciclos, uma vez, amortizados pelo orçamento. A
   * garantia real não é "zero consulta", é **consulta limitada pelo visível**, e
   * é essa que fica presa aqui.
   */
  it('a consulta é limitada pelo que está visível, em qualquer zoom', () => {
    const total = ciclosDoArranjo(PADRAO)
    for (const t of [pecaInteira(), enquadrar(PADRAO, L, 0, 8), enquadrar(PADRAO, L, 60, 64)]) {
      const e = escalaComZoom(PADRAO, L, t)
      const { ini, fim } = ciclosVisiveis(e, PADRAO, L)
      expect(fim - ini).toBeLessThanOrEqual(total)
    }
  })

  // O degrau `casas` é o que salva a peça longa: a nautilo-oxido tem 377 s, e
  // num painel estreito ela cai em texto puro, sem consultar padrão nenhum.
  it('peça longa em painel estreito cai em casas — consulta zero', () => {
    const longa: Arranjo = { casas: 8, porCasa: 32 }   // 256 ciclos
    const px = pxPorCiclo(escalaBase(longa, 420))
    expect(px).toBeLessThan(CORTE_DENSIDADE)
    expect(ehSoTexto(detalheDe(px))).toBe(true)
  })

  it('não troca de nível só porque a janela mudou de tamanho', () => {
    // mesma peça, mesmo enquadramento de 2 ciclos, duas larguras de janela
    const estreita = pxPorCiclo(escalaComZoom(PADRAO, 400, enquadrar(PADRAO, 400, 10, 12)))
    const larga = pxPorCiclo(escalaComZoom(PADRAO, 1600, enquadrar(PADRAO, 1600, 10, 12)))
    expect(detalheDe(estreita)).toBe(detalheDe(larga))
  })
})

describe('enquadrar', () => {
  it('põe o ciclo pedido no gutter', () => {
    const e = escalaComZoom(PADRAO, L, enquadrar(PADRAO, L, 16, 24))
    expect(e(16)).toBeCloseTo(GUTTER, 6)
    expect(e(24)).toBeCloseTo(L, 6)
  })

  it('não passa do zoom máximo nem por pedido absurdo', () => {
    const t = enquadrar(PADRAO, L, 10, 10.0001)
    expect(t.k).toBeLessThanOrEqual(zoomMaximo(PADRAO))
  })

  // Sem isto, o próximo gesto de roda partiria do transform anterior e a tela
  // pularia — o motivo de `enquadrar` devolver ZoomTransform e não {k,x,y}.
  it('devolve um ZoomTransform de verdade, componível', () => {
    const t = enquadrar(PADRAO, L, 8, 16)
    expect(typeof t.rescaleX).toBe('function')
    expect(typeof t.k).toBe('number')
    expect(pecaInteira().k).toBe(1)
  })
})

describe('segundos', () => {
  // Um ciclo é um COMPASSO de 4 tempos. Confundir com "tempo" já custou uma faixa.
  it('89 BPM → 2,70 s por ciclo', () => {
    expect(segundosPorCiclo(89)).toBeCloseTo((60 / 89) * 4, 9)
  })

  it('bpm inválido não vira Infinity na régua', () => {
    expect(Number.isFinite(segundosPorCiclo(0))).toBe(true)
    expect(Number.isFinite(segundosPorCiclo(NaN))).toBe(true)
  })
})
