import { describe, expect, it, vi } from 'vitest'
import { Diagnostico, lerLog } from './diagnostico'

const NAO_ACHOU = '[getTrigger] error: sound vhulto_kick not found! Is it loaded?'

describe('lerLog', () => {
  it('reconhece o som que não existe e guarda o nome', () => {
    const p = lerLog({ message: NAO_ACHOU })
    expect(p?.tipo).toBe('som-ausente')
    expect(p?.som).toBe('vhulto_kick')
    expect(p?.texto).toContain('vhulto_kick')
  })

  it('tira o prefixo de origem, que não diz nada pra quem não é dev', () => {
    const p = lerLog({ message: '[query] error: x is not a function' })
    expect(p?.tipo).toBe('motor')
    expect(p?.texto).toBe('x is not a function')
  })

  it('ignora log que não é erro', () => {
    expect(lerLog({ message: '[eval] hello' })).toBe(null)
  })

  it('ignora o ruído de sample entrando no meio da volta', () => {
    expect(lerLog({ message: '[webaudio] error: skip hap: still loading' })).toBe(null)
  })

  it('ignora detail sem mensagem', () => {
    expect(lerLog(null)).toBe(null)
    expect(lerLog({})).toBe(null)
    expect(lerLog({ message: 42 })).toBe(null)
  })
})

describe('Diagnostico', () => {
  it('agrupa a repetição e conta em vez de empilhar', () => {
    const d = new Diagnostico()
    for (let i = 0; i < 42; i++) d.registrar({ message: NAO_ACHOU })
    expect(d.problemas()).toHaveLength(1)
    expect(d.problemas()[0].vezes).toBe(42)
  })

  it('separa problemas diferentes', () => {
    const d = new Diagnostico()
    d.registrar({ message: NAO_ACHOU })
    d.registrar({ message: '[query] error: outra coisa' })
    expect(d.problemas()).toHaveLength(2)
  })

  it('a conferência do código cai na MESMA fila do runtime', () => {
    const d = new Diagnostico()
    d.registrar({ message: NAO_ACHOU })
    d.anotarSomAusente('vhulto_kick')
    expect(d.problemas()).toHaveLength(1)
    expect(d.problemas()[0].vezes).toBe(2)
  })

  it('limpar zera e avisa quem assina', () => {
    const d = new Diagnostico()
    const visto: number[] = []
    d.assinar(ps => visto.push(ps.length))
    d.registrar({ message: NAO_ACHOU })
    d.limpar()
    expect(visto).toEqual([0, 1, 0])
  })

  it('limpar vazio não acorda ninguém', () => {
    const d = new Diagnostico()
    const cb = vi.fn()
    d.assinar(cb)
    d.limpar()
    expect(cb).toHaveBeenCalledTimes(1) // só a chamada inicial
  })

  it('esquecerSom tira só aquele som', () => {
    const d = new Diagnostico()
    d.anotarSomAusente('a')
    d.anotarSomAusente('b')
    d.esquecerSom('a')
    expect(d.problemas().map(p => p.som)).toEqual(['b'])
  })

  it('assinar devolve baixa que para de avisar', () => {
    const d = new Diagnostico()
    const cb = vi.fn()
    d.assinar(cb)()
    d.registrar({ message: NAO_ACHOU })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('ligar é idempotente — não conta duas vezes o mesmo evento', () => {
    const alvo = new EventTarget()
    const d = new Diagnostico()
    const como = alvo as unknown as Document
    d.ligar(como)
    d.ligar(como)
    alvo.dispatchEvent(new CustomEvent('strudel.log', { detail: { message: NAO_ACHOU } }))
    expect(d.problemas()[0].vezes).toBe(1)
    d.desligar()
    alvo.dispatchEvent(new CustomEvent('strudel.log', { detail: { message: NAO_ACHOU } }))
    expect(d.problemas()[0].vezes).toBe(1)
  })
})
