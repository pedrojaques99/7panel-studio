/**
 * O piano roll como EDITOR: as contas moram em `notas.ts` (teste próprio); aqui se prende
 * o que o teclado e o clique fazem com a seleção e que a tecla tratada não vaza pro atalho
 * global (seta da agulha, ⌘D de clipe, Delete de clipe).
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { PianoRoll } from './PianoRoll'
import { MIDI_MAX, novaTrilha, novoProjeto, type Projeto } from './modelo'
import type { MotorFinal } from './motor'

function projetoBase(ta = 0, tb = 1): Projeto {
  const m = novaTrilha('melodia', 'm')
  m.clipes = [{ id: 'c', inicio: 0, dur: 4, notas: [
    { id: 'a', t: ta, dur: 0.5, midi: 62, vel: 0.8 },
    { id: 'b', t: tb, dur: 0.5, midi: 64, vel: 0.8 },
  ] }]
  return { ...novoProjeto('t'), bpm: 120, trilhas: [m] }
}

function montar(segundos = 0, ta = 0, tb = 1) {
  const motor = { segundos, previa: vi.fn(), irPara: vi.fn() } as unknown as MotorFinal
  const ref: { p: Projeto } = { p: projetoBase(ta, tb) }
  function Casca() {
    const [p, setP] = useState(ref.p)
    ref.p = p
    const arrasto = { comecar: () => ref.p, previa: (x: Projeto) => setP(x), fim: () => {} }
    const t = p.trilhas[0]
    return <PianoRoll projeto={p} trilha={t} clipe={t.clipes[0]} motor={motor} grade={0.25} soEscala={false} zoom={60} arrasto={arrasto} onMudar={setP} />
  }
  render(<Casca />)
  const roll = screen.getByLabelText('piano roll')
  const notas = () => ref.p.trilhas[0].clipes[0].notas!
  const k = (key: string, mod: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) => fireEvent.keyDown(roll, { key, ...mod })
  return { roll, notas, k, motor }
}

describe('piano roll: seleção e teclado', () => {
  it('⌘A e ↑ sobem o grupo um semitom (linhas cromáticas)', () => {
    const { notas, k } = montar()
    k('a', { ctrlKey: true })
    k('ArrowUp')
    expect(notas().map(n => n.midi)).toEqual([63, 65])
  })

  it('⇧↑ sobe a oitava; ⌥→ estica um passo da grade', () => {
    const { notas, k } = montar()
    k('a', { ctrlKey: true })
    k('ArrowUp', { shiftKey: true })
    k('ArrowRight', { altKey: true })
    expect(notas().map(n => [n.midi, n.dur])).toEqual([[74, 0.75], [76, 0.75]])
  })

  it('clique seleciona uma, ⇧ clique soma, Delete apaga só a seleção', () => {
    const { notas, k } = montar()
    const [a, b] = screen.getAllByRole('button', { pressed: false }).filter(x => x.getAttribute('aria-label')?.includes(' at '))
    fireEvent.pointerDown(a, { button: 0 })
    fireEvent.pointerUp(window)
    expect(a.getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerDown(b, { button: 0, shiftKey: true })
    k('Delete')
    expect(notas()).toHaveLength(0)
  })

  it('⌘D duplica logo depois da seleção e a cópia vira a seleção', () => {
    const { notas, k } = montar()
    k('a', { ctrlKey: true })
    k('d', { ctrlKey: true })
    // seleção de 0 a 1,5 s; grade 0,25 → cópia em 1,5
    expect(notas().map(n => n.t)).toEqual([0, 1, 1.5, 2.5])
    k('ArrowUp')
    expect(notas().map(n => n.midi)).toEqual([62, 64, 63, 65])
  })

  it('⌘C, Esc, ⌘V cola na agulha', () => {
    const { notas, k } = montar(2)
    k('a', { ctrlKey: true })
    k('c', { ctrlKey: true })
    k('Escape')
    k('v', { ctrlKey: true })
    expect(notas().map(n => n.t)).toEqual([0, 1, 2, 3])
  })

  it('tecla tratada não chega no atalho global; sem seleção, a seta passa', () => {
    const { k } = montar()
    const global = vi.fn()
    window.addEventListener('keydown', global)
    k('ArrowLeft')
    expect(global).toHaveBeenCalledTimes(1)
    k('a', { ctrlKey: true })
    k('ArrowLeft')
    k('d', { ctrlKey: true })
    expect(global).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', global)
  })

  it('⇧ arrastar no vazio é laço: seleciona sem criar nota', () => {
    const { notas, k } = montar()
    const grade = screen.getByLabelText('note grid')
    const y = (midi: number) => (MIDI_MAX - midi) * 14 + 7
    // laço de 0 a 0,8 s (120 px/s) cobrindo a linha da 'a' (62) até a da 'b' (64): só a 'a' entra no tempo
    fireEvent.pointerDown(grade, { button: 0, shiftKey: true, clientX: 1, clientY: y(64) })
    fireEvent.pointerMove(window, { clientX: 96, clientY: y(62) })
    fireEvent.pointerUp(window)
    expect(notas()).toHaveLength(2)
    k('ArrowUp')
    expect(notas().map(n => n.midi)).toEqual([63, 64])
  })

  it('Q sem seleção quantiza o clipe todo; ⇧Q vai metade', () => {
    const { notas, k } = montar(0, 0.1, 1.2)
    k('q', { shiftKey: true })
    expect(notas().map(n => +n.t.toFixed(3))).toEqual([0.05, 1.225])
    k('q')
    expect(notas().map(n => n.t)).toEqual([0, 1.25])
  })

  it('a linha do fim do clipe muda o tamanho, na grade', () => {
    const { roll } = montar()
    const fim = screen.getByLabelText('clip end')
    fireEvent.pointerDown(fim, { button: 0, clientX: 480 })
    fireEvent.pointerMove(window, { clientX: 250 })
    fireEvent.pointerUp(window)
    // 250 px a 120 px/s = 2,083 s → grade 0,25 = 2
    expect(roll).toBeTruthy()
    expect(screen.getByLabelText('clip end').style.left).toBe(`${2 * 120 - 4}px`)
  })

  it('a régua leva a agulha pro tempo do clique', () => {
    const { motor } = montar()
    fireEvent.pointerDown(screen.getByLabelText('bar ruler'), { clientX: 120 })
    // zoom 60 px por batida a 120 bpm = 120 px/s
    expect(motor.irPara).toHaveBeenCalledWith(1)
  })
})
