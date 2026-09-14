/**
 * Portão do tom. O caso que importa é o último: transpor NÃO pode tocar em
 * camada de bateria. Antes de existir `envolverComTom`, `.add(note(n))` chapado
 * criava `note` numa camada que não tinha, e o kick descia 45 semitons.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evalScope, evaluate } from '@strudel/core'
import { miniAllStrings } from '@strudel/mini'
import { classeDaNota, tomDoTake, rotuloTom, envolverComTom } from './tom'

const PATTERNS = join(dirname(fileURLToPath(import.meta.url)), '../../../patterns')

/** O valor de um hap do Strudel: saco de controles, tudo opcional. */
type Valor = { s?: unknown; n?: unknown; note?: unknown }
type Hap = { value: Valor }

describe('classeDaNota', () => {
  it.each([['c', 0], ['C', 0], ['f#', 6], ['F♯', 6], ['bb', 10], ['b♭', 10], ['b', 11]])(
    '%s -> %i', (nome, esperado) => expect(classeDaNota(nome as string)).toBe(esperado))

  it('recusa o que não é nota', () => {
    expect(classeDaNota('sawtooth')).toBe(null)
    expect(classeDaNota('')).toBe(null)
  })
})

describe('tomDoTake', () => {
  it('prefere o .scale() declarado', () => {
    expect(tomDoTake('n("0 3").scale("f#1:minor").s("sawtooth")')).toEqual({ classe: 6, modo: 'minor' })
  })

  it('cai na primeira nota quando não há scale', () => {
    expect(tomDoTake('note("<[f#2,c#3] [d2,a2]>").s("sawtooth")')).toEqual({ classe: 6, modo: null })
  })

  it('ignora comentário', () => {
    expect(tomDoTake('// note("c4") era o plano antigo\nnote("<a1 e1>").s("sine")'))
      .toEqual({ classe: 9, modo: null })
  })

  it('devolve null quando o take não tem nota nenhuma', () => {
    expect(tomDoTake('s("bd hh sn hh").gain(0.8)')).toBe(null)
  })

  it('lê os takes reais do repertório', () => {
    const pinha = readFileSync(join(PATTERNS, 'pinha-neon.js'), 'utf8')
    expect(rotuloTom(tomDoTake(pinha))).toBe('F♯m')       // .scale("f#1:minor")
  })
})

describe('rotuloTom', () => {
  it('anda o tom pelos semitons', () => {
    const fsm = { classe: 6, modo: 'minor' }
    expect(rotuloTom(fsm, 0)).toBe('F♯m')
    expect(rotuloTom(fsm, 3)).toBe('Am')
    expect(rotuloTom(fsm, -6)).toBe('Cm')
    expect(rotuloTom(fsm, 12)).toBe('F♯m')                // volta na oitava
  })

  it('não inventa modo quando não sabe', () => {
    expect(rotuloTom({ classe: 6, modo: null }, 0)).toBe('F♯')
  })

  it('mantém o nome do modo quando não é maior nem menor puro', () => {
    expect(rotuloTom({ classe: 2, modo: 'dorian' }, 0)).toBe('D dorian')
  })

  it('sem tom, sem rótulo', () => {
    expect(rotuloTom(null, 5)).toBe(null)
  })
})

describe('envolverComTom', () => {
  beforeAll(async () => {
    await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'))
    miniAllStrings()
  })

  it('zero não embrulha nada', () => {
    expect(envolverComTom('note("c4")', 0)).toBe('note("c4")')
  })

  const misto = 'stack(s("bd").n(5).struct("x"), note("c4").s("sawtooth"), n("0 3").scale("c:minor").s("square"))'

  it('transpõe a melodia e NÃO toca na bateria', async () => {
    const antes: Valor[] = (await evaluate(misto)).pattern.queryArc(0, 1).map((e: Hap) => e.value)
    const depois: Valor[] = (await evaluate(envolverComTom(misto, 3))).pattern.queryArc(0, 1).map((e: Hap) => e.value)

    const bateriaAntes = antes.find(v => v.s === 'bd')
    const bateriaDepois = depois.find(v => v.s === 'bd')
    expect(bateriaDepois).toEqual(bateriaAntes)
    expect(bateriaDepois).not.toHaveProperty('note')      // a regressão que motivou tudo

    const melodia = depois.filter(v => v.s !== 'bd').map(v => v.note).sort()
    expect(melodia).toEqual([51, 56, 63])                 // c4->63, C3->51, F3->56
  })

  it('o número de eventos não muda', async () => {
    const antes = (await evaluate(misto)).pattern.queryArc(0, 4).length
    const depois = (await evaluate(envolverComTom(misto, -5))).pattern.queryArc(0, 4).length
    expect(depois).toBe(antes)
  })

  it('roda em cima dos takes reais sem quebrar', async () => {
    for (const f of ['girassol-fita.js', 'pinha-neon.js', 'nautilo-oxido.js']) {
      const code = readFileSync(join(PATTERNS, f), 'utf8')
      const antes = (await evaluate(code)).pattern.queryArc(0, 8)
      const depois = (await evaluate(envolverComTom(code, 2))).pattern.queryArc(0, 8)
      expect(depois.length, `${f}: transpor mudou a densidade`).toBe(antes.length)
      const percussao = (depois as Hap[]).filter(e => typeof e.value.s === 'string' && (e.value.s as string).includes('drumkit'))
      for (const p of percussao) expect(p.value, `${f}: transpor afinou a bateria`).not.toHaveProperty('note')
    }
  })
})
