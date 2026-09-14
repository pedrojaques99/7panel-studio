/**
 * O que dá pra provar da linha do tempo sem áudio, sem canvas e sem layout.
 *
 * Testa-se o CONTRATO: onde o ponteiro cai vira qual casa de qual camada, e
 * clicar escreve a máscara E o desenho no mesmo edit — o mesmo contrato que a
 * `GradeArranjo.test.tsx` prende, agora sobre um eixo com zoom.
 *
 * NÃO se testa aqui, e é de propósito:
 *  - o desenho (jsdom não tem `getContext`, então o loop nem começa);
 *  - a agulha (depende do relógio de áudio e de layout);
 *  - o aviso `editado · ctrl+enter` — ele é PINTADO, e o que é pintado só se
 *    confere com o olho. Está dito aqui pra ninguém achar que está coberto.
 *
 * A geometria é fixada de propósito: sem `ResizeObserver` em jsdom a largura cai
 * no piso de 320 do componente, e o `getBoundingClientRect` é fixado. Com isso a
 * conta px→casa é determinística e o teste falha se a ESCALA mudar de
 * comportamento — que é justamente o que ele existe pra vigiar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LinhaDoTempo, FAIXA, REGUA } from './LinhaDoTempo'
import { GUTTER } from './escala'

/** 2 camadas, 4 casas de 8 ciclos = 32 ciclos. O mesmo take da GradeArranjo. */
const TAKE = [
  '// ── ARRANJO ── cada casa = 8 ciclos',
  '//              1    2    3    4',
  '//   bumbo      ·    ·    ·    ·   a rédea',
  '//   chimbal    ·    ·    ·    ·',
  'stack(',
  '  s("kick").mask("<1 1 0 0>/8"),',
  '  s("hats").mask("<0 1 1 0>/8")',
  ')',
].join('\n')

/**
 * 320, e não a largura da montagem.
 *
 * jsdom não faz layout, então `clientWidth` do contêiner é 0 e o componente cai
 * no piso que ele mesmo declara (`Math.max(320, ...)`). Escrever 800 aqui — o
 * valor inicial do estado — fazia cada clique cair uma casa adiante, que foi
 * exatamente como este comentário nasceu.
 */
const LARGURA = 320
const CASAS = 4
/* FAIXA e REGUA vêm do componente: copiá-los aqui deixa o teste passar por
   sorte depois que a geometria muda. Aconteceu — a régua foi de 20 pra 26 e
   estes números continuaram acertando a camada por acidente de arredondamento. */

/** O x do meio da casa `k`, na escala base (k = 1, a peça inteira). */
function xDaCasa(k: number): number {
  const util = LARGURA - GUTTER
  return GUTTER + (util / CASAS) * (k + 0.5)
}

/** O y do meio da faixa da camada `i`. */
function yDaCamada(i: number): number {
  return REGUA + i * FAIXA + FAIXA / 2
}

function montar(props: Partial<React.ComponentProps<typeof LinhaDoTempo>> = {}) {
  const onAplicar = vi.fn()
  const onSel = vi.fn()
  render(
    <LinhaDoTempo
      codigo={TAKE}
      codigoTocando={TAKE}
      bpm={120}
      tocando={false}
      sel={0}
      onSel={onSel}
      onAplicar={onAplicar}
      {...props}
    />,
  )
  const tela = document.querySelector('canvas') as HTMLCanvasElement
  // jsdom não faz layout: sem isto todo rect é zero e o ponteiro cai sempre no
  // mesmo lugar. Fixar é o que torna a conta px→casa verificável.
  tela.getBoundingClientRect = () => ({
    left: 0, top: 0, right: LARGURA, bottom: 200,
    width: LARGURA, height: 200, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect
  return { onAplicar, onSel, tela }
}

function cutucar(tela: HTMLCanvasElement, x: number, y: number, extra: PointerEventInit = {}) {
  tela.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: x, clientY: y, bubbles: true, cancelable: true,
    button: 0, pointerId: 1, isPrimary: true, ...extra,
  }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('a barra', () => {
  it('diz a forma da peça: grade, ciclos e duração', () => {
    montar()
    // 4 casas x 8 ciclos = 32 ciclos; a 120 bpm um ciclo são 2 s → 1:04
    expect(screen.getByText(/4×8 · 32c · 1:04/)).toBeInTheDocument()
  })

  it('abre na peça inteira', () => {
    montar()
    expect(screen.getByText('1.0×')).toBeInTheDocument()
  })

  it('take sem camada nenhuma não desenha canvas, e diz o porquê', () => {
    render(
      <LinhaDoTempo codigo="" codigoTocando="" bpm={120} tocando={false}
        sel={0} onSel={() => {}} onAplicar={() => {}} />,
    )
    expect(screen.getByText(/nada no editor ainda/)).toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
  })
})

describe('o ponteiro vira casa', () => {
  it('clicar numa casa apagada acende — máscara E desenho no mesmo edit', () => {
    const { onAplicar, tela } = montar()
    // bumbo é `<1 1 0 0>`; a casa 3 (índice 2) está apagada
    cutucar(tela, xDaCasa(2), yDaCamada(0))

    expect(onAplicar).toHaveBeenCalledTimes(1)
    const saiu = onAplicar.mock.calls[0][0] as string
    expect(saiu).toContain('.mask("<1 1 1 0>/8")')                        // o som
    expect(saiu).toContain('//   bumbo      ●    ●    ●    ·   a rédea')  // o desenho
  })

  it('clicar numa casa acesa apaga', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, xDaCasa(0), yDaCamada(0))
    expect(onAplicar.mock.calls[0][0]).toContain('.mask("<0 1 0 0>/8")')
  })

  it('acerta a CAMADA pela altura, não só a casa', () => {
    const { onAplicar, onSel, tela } = montar()
    // chimbal é `<0 1 1 0>`; casa 1 (índice 0) apagada
    cutucar(tela, xDaCasa(0), yDaCamada(1))
    expect(onSel).toHaveBeenCalledWith(1)
    const saiu = onAplicar.mock.calls[0][0] as string
    expect(saiu).toContain('.mask("<1 1 1 0>/8")')
    // o rótulo do AUTOR sobrevive: `chimbal`, não `hats`
    expect(saiu).toContain('chimbal')
  })

  it('cada casa é um alvo diferente — a escala não amassa tudo numa só', () => {
    const vistas = new Set<string>()
    for (let k = 0; k < CASAS; k++) {
      // `cleanup` DENTRO do laço: sem ele as quatro montagens coexistem no mesmo
      // documento e `querySelector('canvas')` devolve sempre a primeira — o
      // clique ia parar no componente errado e o mock da vez ficava vazio.
      cleanup()
      const { onAplicar, tela } = montar()
      cutucar(tela, xDaCasa(k), yDaCamada(0))
      vistas.add((onAplicar.mock.calls[0][0] as string).match(/mask\("<[^"]+"\)/)![0])
    }
    expect(vistas.size).toBe(CASAS)
  })
})

describe('as outras zonas da faixa', () => {
  it('clicar no gutter (o nome) muta a camada, não pinta casa', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, GUTTER / 2, yDaCamada(0))
    const saiu = onAplicar.mock.calls[0][0] as string
    expect(saiu).toContain('.gain(0)')
    expect(saiu).toContain('.mask("<1 1 0 0>/8")')   // a máscara ficou como estava
  })

  it('alt+clique no nome é "só ela"', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, GUTTER / 2, yDaCamada(0), { altKey: true })
    const saiu = onAplicar.mock.calls[0][0] as string
    // solo = as OUTRAS mudas
    expect(saiu.match(/\.gain\(0\)/g) ?? []).toHaveLength(1)
  })

  it('a régua não pinta nada — ali o gesto é andar', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, xDaCasa(1), REGUA / 2)
    expect(onAplicar).not.toHaveBeenCalled()
  })

  it('shift é pan: não escreve no código', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, xDaCasa(2), yDaCamada(0), { shiftKey: true })
    expect(onAplicar).not.toHaveBeenCalled()
  })
})

describe('arrastar pinta com o modo travado', () => {
  it('o modo é decidido na PRIMEIRA casa e as seguintes obedecem', () => {
    const { onAplicar, tela } = montar()
    // começa numa APAGADA (casa 3 do bumbo) → modo = acender
    cutucar(tela, xDaCasa(2), yDaCamada(0))
    // arrasta por uma casa ACESA (casa 1): com o modo travado, ela continua acesa
    tela.dispatchEvent(new PointerEvent('pointermove', {
      clientX: xDaCasa(0), clientY: yDaCamada(0), bubbles: true, pointerId: 1,
    }))
    // o último edit não pode ter APAGADO a casa 1
    const ultimo = onAplicar.mock.calls.at(-1)![0] as string
    expect(ultimo).toMatch(/mask\("<1 /)
  })

  it('soltar o ponteiro encerra a pintura', () => {
    const { onAplicar, tela } = montar()
    cutucar(tela, xDaCasa(2), yDaCamada(0))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
    const antes = onAplicar.mock.calls.length
    tela.dispatchEvent(new PointerEvent('pointermove', {
      clientX: xDaCasa(0), clientY: yDaCamada(0), bubbles: true, pointerId: 1,
    }))
    expect(onAplicar.mock.calls.length).toBe(antes)
  })
})

describe('recusa em vez de adivinhar', () => {
  it('camadas que discordam da grade não viram casa clicável', () => {
    const conflito = [
      'stack(',
      '  s("kick").mask("<1 1 0 0>/8"),',
      '  s("hats").mask("<0 1 1 0 1 1>/4")',
      ')',
    ].join('\n')
    const { onAplicar, tela } = montar({ codigo: conflito, codigoTocando: conflito })
    cutucar(tela, xDaCasa(1), yDaCamada(0))
    expect(onAplicar).not.toHaveBeenCalled()
  })
})
