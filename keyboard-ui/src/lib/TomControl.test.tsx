/**
 * O que este portão cobre: as três entradas do controle (teclado, roda e
 * arrasto) e o contrato de simulação (o "voltar" só existe quando há simulação,
 * e ele zera).
 *
 * Existe porque testar isto no navegador é caro e mentiroso: `left_click_drag`
 * sintético não produz o mesmo `pointerId` de um dedo, e o resultado de um
 * arrasto que não pegou é idêntico ao de um handler quebrado — tela parada.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TomControl } from './TomControl'

const TOM = { classe: 6, modo: 'minor' }   // F#m

function montar(semitons = 0) {
  const onChange = vi.fn()
  const r = render(<TomControl semitons={semitons} onChange={onChange} tom={TOM} />)
  return { onChange, regua: screen.getByRole('slider'), rerender: r.rerender }
}

describe('TomControl', () => {
  it('em repouso, diz o tom da peça e que ele é o original', () => {
    montar(0)
    expect(screen.getByText('F♯m')).toBeTruthy()
    expect(screen.getByText('original')).toBeTruthy()
  })

  it('simulando, diz o tom RESULTANTE e de onde ele veio', () => {
    montar(3)
    expect(screen.getByText('Am')).toBeTruthy()             // F#m + 3
    expect(screen.getByText(/de F♯m · \+3 st/)).toBeTruthy()
  })

  it('nomeia o intervalo quando ele é um marco', () => {
    montar(7)
    expect(screen.getByText(/· 5ª/)).toBeTruthy()
  })

  it('setas andam 1, com shift andam 12', () => {
    const { onChange, regua } = montar(0)
    fireEvent.keyDown(regua, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(regua, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(-1)
    fireEvent.keyDown(regua, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(12)
  })

  it('não passa de ±12', () => {
    const { onChange, regua } = montar(12)
    fireEvent.keyDown(regua, { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()                 // já está no teto
  })

  it('Home volta ao original', () => {
    const { onChange, regua } = montar(5)
    fireEvent.keyDown(regua, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('a roda anda 1, com shift anda 12', () => {
    const { onChange, regua } = montar(0)
    fireEvent.wheel(regua, { deltaY: -1 })
    expect(onChange).toHaveBeenLastCalledWith(1)
    fireEvent.wheel(regua, { deltaY: 1, shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(-12)
  })

  it('o arrasto imanta em cada semitom DURANTE o gesto', () => {
    const { onChange, regua } = montar(0)
    // 11 px por semitom. Puxar 42 px pra esquerda = +3.
    fireEvent.pointerDown(regua, { button: 0, pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 94 })     // meio passo
    expect(onChange).toHaveBeenLastCalledWith(1)                     // arredonda, não espera
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 67 })     // 33 px
    expect(onChange).toHaveBeenLastCalledWith(3)
    fireEvent.pointerUp(window, { pointerId: 1 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0 })
    expect(onChange).toHaveBeenLastCalledWith(3)                     // soltou, parou de ouvir
  })

  it('duplo clique volta ao original', () => {
    const { onChange, regua } = montar(-4)
    fireEvent.doubleClick(regua)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('o "voltar" só é alcançável quando há simulação', () => {
    const { rerender } = montar(0)
    const btn = screen.getByTitle('Voltar ao tom original')
    expect(btn.getAttribute('tabindex')).toBe('-1')
    expect(btn.getAttribute('aria-hidden')).toBe('true')

    rerender(<TomControl semitons={4} onChange={() => {}} tom={TOM} />)
    const btn2 = screen.getByTitle('Voltar ao tom original')
    expect(btn2.getAttribute('tabindex')).toBe('0')
    expect(btn2.getAttribute('aria-hidden')).toBe('false')
  })

  it('fala o tom, não o número, pra quem usa leitor de tela', () => {
    montar(3)
    expect(screen.getByRole('slider').getAttribute('aria-valuetext'))
      .toBe('Am, +3 semitons de F♯m')
  })

  it('sem tonalidade declarada, não inventa: mostra só o intervalo', () => {
    const onChange = vi.fn()
    render(<TomControl semitons={3} onChange={onChange} tom={null} />)
    expect(screen.getByText('+3 st')).toBeTruthy()
    expect(screen.queryByText(/de /)).toBe(null)
  })
})
