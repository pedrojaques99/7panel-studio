/**
 * O teste de divergência do relógio.
 *
 * Não basta consertar o número: enquanto duas telas puderem converter o mesmo
 * relógio cada uma do seu jeito, a discordância volta. Foi assim que a régua da
 * linha do tempo passou a dizer "casa 2/8" com a grade acesa na casa 1 — as duas
 * liam `getTime`, e uma delas multiplicava por `bpm/240` achando que o valor era
 * segundo.
 *
 * Então aqui há duas garantias, e a segunda é a que realmente prende:
 *
 *   1. a identidade que permite às duas vistas arredondar diferente e ainda
 *      concordar sobre a casa;
 *   2. um teste de FONTE: nenhuma das duas telas pode fazer conta com `getTime`.
 *      Quem quiser o ciclo chama `cicloAgora`. É o mesmo desenho do
 *      `test_divergencia.py` do DSP — o que falha não é o valor, é a existência
 *      de uma segunda implementação.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { casaDoCiclo } from './camadas'
import { casaAgora, cicloAgora, type Relogio } from './relogio'

const AQUI = dirname(fileURLToPath(import.meta.url))

function relogioFalso(ciclo: number, ligado = true): Relogio {
  return { getTime: () => ciclo, getIsStarted: () => ligado }
}

describe('cicloAgora', () => {
  it('devolve o ciclo cru, sem conversão de bpm', () => {
    expect(cicloAgora(relogioFalso(12.75))).toBe(12.75)
  })

  it('parado é null, não zero — as duas coisas desenham diferente', () => {
    expect(cicloAgora(relogioFalso(9, false))).toBeNull()
    expect(cicloAgora(null)).toBeNull()
    expect(cicloAgora(relogioFalso(0))).toBe(0)
  })

  it('relógio que estoura (sem repl ainda) é "não começou", não erro', () => {
    const quebrado: Relogio = {
      getTime: () => { throw new Error('sem repl') },
      getIsStarted: () => true,
    }
    expect(cicloAgora(quebrado)).toBeNull()
    expect(cicloAgora(relogioFalso(NaN))).toBeNull()
  })
})

describe('casaAgora', () => {
  const arranjo = { casas: 8, porCasa: 8 }

  it('a casa da régua e a da grade saem do mesmo lugar', () => {
    expect(casaAgora(0, arranjo)).toBe(0)
    expect(casaAgora(7.99, arranjo)).toBe(0)
    expect(casaAgora(8, arranjo)).toBe(1)
    expect(casaAgora(47.5, arranjo)).toBe(5)      // a "casa 6/8" da régua
  })

  it('sem arranjo ou sem som não existe casa', () => {
    expect(casaAgora(null, arranjo)).toBeNull()
    expect(casaAgora(10, null)).toBeNull()
  })

  /**
   * A identidade que autoriza as duas vistas a arredondar diferente: a Timeline
   * precisa de ciclo INTEIRO (consulta eventos daquele ciclo) e a grade precisa
   * da FRAÇÃO (move a agulha a 60fps). Se `Math.floor` antes e depois dessem
   * casas diferentes, a régua e a grade voltariam a discordar na virada.
   */
  it('arredondar antes ou depois dá a mesma casa', () => {
    for (const porCasa of [4, 8, 16]) {
      for (let x = 0; x < 200; x += 0.37) {
        expect(casaDoCiclo(Math.floor(x), 8, porCasa)).toBe(casaDoCiclo(x, 8, porCasa))
      }
    }
  })
})

/**
 * O portão que impede a segunda cópia de nascer de novo.
 *
 * Falha se alguma das duas telas tocar em `getTime` sem ser pelo módulo. Não é
 * elegante ler o próprio fonte num teste — é o preço de uma regra que nenhum
 * tipo expressa: "existe UM lugar que converte o relógio".
 */
describe('uma cópia só do relógio', () => {
  const telas = ['Timeline.tsx', 'GradeArranjo.tsx']

  it.each(telas)('%s não faz conta com getTime', (arquivo: string) => {
    const src = readFileSync(join(AQUI, arquivo), 'utf8')
    const linhas = src.split('\n')
      .map((l, i) => ({ n: i + 1, t: l.replace(/\/\/.*$/, '').replace(/\/\*.*$/, '') }))
      .filter(({ t }) => t.includes('getTime'))
    // Só o import do tipo pode citar `getTime`; nenhuma linha de código pode
    // chamá-lo, e muito menos multiplicar o resultado por bpm.
    expect(linhas.map(l => `${arquivo}:${l.n}`), 'getTime fora do relogio.ts').toEqual([])
  })

  it.each(telas)('%s carrega o relógio pelo módulo', (arquivo: string) => {
    const src = readFileSync(join(AQUI, arquivo), 'utf8')
    expect(src).toContain("from './relogio'")
  })
})
