/**
 * O que dá pra testar aqui é o que quebra o SOM, não o que quebra a tela.
 *
 * jsdom não faz layout: `posAtCoords` não tem coordenada de verdade, então
 * arrasto de mouse testado aqui só provaria que o mock funciona. O que tem valor
 * é a parte pura — achar o número certo sob o cursor e decidir quanto ele anda
 * por pixel. É ali que mora o bug que troca um sample por outro ou entrega
 * `0.8137` pra quem escreveu `0.8`.
 */
import { describe, it, expect } from 'vitest'
import {
  acharNumeroNaLinha,
  granularidadeDe,
  passoEfetivo,
  formatar,
  valorArrastado,
} from './arrastar-numero'

describe('acharNumeroNaLinha', () => {
  const linha = 's("bd sd").gain(0.8).lpf(300).delaytime(0.375)'

  it('acha o número sob o cursor, inteiro, mesmo com o cursor no meio dele', () => {
    const col = linha.indexOf('0.375') + 2
    expect(acharNumeroNaLinha(linha, col)).toEqual({
      inicio: linha.indexOf('0.375'),
      fim: linha.indexOf('0.375') + 5,
      texto: '0.375',
    })
  })

  it('não parte o decimal em dois números', () => {
    const col = linha.indexOf('0.8')
    expect(acharNumeroNaLinha(linha, col)?.texto).toBe('0.8')
  })

  it('pega o número certo quando há vários na linha', () => {
    expect(acharNumeroNaLinha(linha, linha.indexOf('300') + 1)?.texto).toBe('300')
  })

  it('encostar logo depois do número ainda conta como estar nele', () => {
    const fim = linha.indexOf('300') + 3
    expect(acharNumeroNaLinha(linha, fim)?.texto).toBe('300')
  })

  it('devolve null onde não há número', () => {
    expect(acharNumeroNaLinha(linha, 1)).toBeNull()
    expect(acharNumeroNaLinha('.stack()', 3)).toBeNull()
  })

  it('ignora dígito que é parte de nome, não valor', () => {
    // `lpf2` é um identificador; mexer nele quebra o código em vez de mudar som.
    expect(acharNumeroNaLinha('const lpf2 = 1', 9)).toBeNull()
  })

  it('engole o menos quando ele é sinal', () => {
    const l = '.pan(-0.5)'
    expect(acharNumeroNaLinha(l, 7)?.texto).toBe('-0.5')
  })

  it('não engole o menos quando ele é subtração', () => {
    const l = 'x-1'
    expect(acharNumeroNaLinha(l, 2)?.texto).toBe('1')
  })

  it('entende decimal escrito sem o zero', () => {
    expect(acharNumeroNaLinha('.gain(.5)', 7)?.texto).toBe('.5')
  })
})

describe('granularidadeDe', () => {
  it('milésimos pra quem escreveu três casas', () => {
    expect(granularidadeDe('0.375').passo).toBeCloseTo(0.001, 10)
  })

  it('centésimos pra quem escreveu uma casa — décimo seria grosso demais pra gain', () => {
    expect(granularidadeDe('0.8').passo).toBeCloseTo(0.01, 10)
    expect(granularidadeDe('0.75').passo).toBeCloseTo(0.01, 10)
  })

  it('inteiro anda de um em um e se declara inteiro', () => {
    expect(granularidadeDe('6')).toMatchObject({ passo: 1, inteiro: true })
    expect(granularidadeDe('300')).toMatchObject({ passo: 1, inteiro: true })
  })

  it('inteiro grande anda de dez em dez, senão o lpf leva 4000 pixels', () => {
    expect(granularidadeDe('4000').passo).toBe(10)
  })
})

describe('passoEfetivo', () => {
  it('shift afina em dez vezes', () => {
    expect(passoEfetivo(granularidadeDe('0.8'), { shiftKey: true })).toBeCloseTo(0.001, 10)
  })

  it('alt e ctrl engrossam em dez vezes', () => {
    expect(passoEfetivo(granularidadeDe('0.8'), { altKey: true })).toBeCloseTo(0.1, 10)
    expect(passoEfetivo(granularidadeDe('300'), { ctrlKey: true })).toBe(10)
  })

  it('shift NUNCA fraciona um inteiro — não existe meio sample', () => {
    expect(passoEfetivo(granularidadeDe('6'), { shiftKey: true })).toBe(1)
  })

  it('shift ganha de alt quando vêm juntos', () => {
    expect(passoEfetivo(granularidadeDe('0.8'), { shiftKey: true, altKey: true })).toBeCloseTo(0.001, 10)
  })
})

describe('formatar', () => {
  it('corta zero à direita mas nunca abaixo do que a pessoa escreveu', () => {
    expect(formatar(0.8, 2, 1)).toBe('0.8')
    expect(formatar(0.81, 2, 1)).toBe('0.81')
    expect(formatar(0.375, 3, 3)).toBe('0.375')
    expect(formatar(0.37, 3, 3)).toBe('0.370')
  })

  it('inteiro sai sem ponto', () => {
    expect(formatar(300.4, 0, 0)).toBe('300')
  })
})

describe('valorArrastado', () => {
  it('direita aumenta, esquerda diminui', () => {
    expect(Number(valorArrastado('300', 40))).toBe(340)
    expect(Number(valorArrastado('300', -40))).toBe(260)
  })

  it('quem escreveu 0.8 nunca recebe 0.8137', () => {
    for (let px = -80; px <= 80; px++) {
      const s = valorArrastado('0.8', px)
      expect(s).toMatch(/^-?\d+\.\d{1,2}$/)
    }
  })

  it('0.375 anda em milésimos e continua com três casas', () => {
    expect(valorArrastado('0.375', 5)).toBe('0.380')
    expect(valorArrastado('0.375', -25)).toBe('0.350')
  })

  it('índice de sample nunca vira fracionário, nem com shift', () => {
    expect(valorArrastado('6', 3)).toBe('9')
    expect(valorArrastado('6', 3, { shiftKey: true })).toBe('9')
    expect(valorArrastado('6', -1, { altKey: true })).toBe('-4')
  })

  it('voltar o mouse pro ponto de partida devolve o número exato', () => {
    // Por isso o cálculo parte sempre do texto original: acumular sobre o
    // resultado anterior deixaria resíduo de ponto flutuante depois de 300
    // quadros e o valor nunca voltaria pro que estava escrito.
    expect(valorArrastado('0.375', 0)).toBe('0.375')
    expect(valorArrastado('0.8', 0)).toBe('0.8')
    expect(valorArrastado('300', 0)).toBe('300')
  })

  it('preserva sinal negativo', () => {
    expect(valorArrastado('-0.5', 10)).toBe('-0.4')
  })

  it('texto que não é número volta intacto', () => {
    expect(valorArrastado('bd', 10)).toBe('bd')
  })
})
