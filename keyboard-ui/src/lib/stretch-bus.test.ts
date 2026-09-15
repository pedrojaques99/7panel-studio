import { describe, it, expect, vi, afterEach } from 'vitest'
import { publishStretch, subscribeStretch, type StretchMsg } from './stretch-bus'

// O bus guarda os handlers em módulo — se um teste vazar assinatura,
// o próximo recebe evento fantasma. Todo subscribe passa por aqui.
const pendentes: Array<() => void> = []
function assinar(fn: (m: StretchMsg) => void) {
  const off = subscribeStretch(fn)
  pendentes.push(off)
  return off
}

afterEach(() => {
  while (pendentes.length) pendentes.pop()!()
})

const MSG: StretchMsg = {
  stage: 'triagem',
  path: 'Z:/acervo/chuva.wav',
  destino: 'eno',
  receita: { esticar: 12, janela: 0.5, escuro_hz: 4500, escuro_db: 7, teto_hz: 13000 },
}

describe('stretch-bus', () => {
  it('entrega ao assinante exatamente o que foi publicado', () => {
    const ouviu = vi.fn()
    assinar(ouviu)

    publishStretch(MSG)

    expect(ouviu).toHaveBeenCalledTimes(1)
    expect(ouviu).toHaveBeenCalledWith(MSG)
    // mesma referência: o bus não clona nem serializa
    expect(ouviu.mock.calls[0][0]).toBe(MSG)
  })

  it('entrega a todos os assinantes, na mesma publicação', () => {
    const a = vi.fn(), b = vi.fn(), c = vi.fn()
    assinar(a); assinar(b); assinar(c)

    publishStretch({ ...MSG, stage: 'esticar' })

    for (const fn of [a, b, c]) {
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn.mock.calls[0][0]).toMatchObject({ stage: 'esticar', path: MSG.path })
    }
  })

  it('o mesmo handler assinado duas vezes só recebe uma vez (Set, não Array)', () => {
    const fn = vi.fn()
    assinar(fn); assinar(fn)

    publishStretch(MSG)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a função devolvida por subscribe realmente para de receber', () => {
    const fica = vi.fn(), sai = vi.fn()
    assinar(fica)
    const off = assinar(sai)

    publishStretch(MSG)
    expect(sai).toHaveBeenCalledTimes(1)

    off()
    publishStretch(MSG)

    expect(sai).toHaveBeenCalledTimes(1) // não recebeu a segunda
    expect(fica).toHaveBeenCalledTimes(2)
  })

  it('unsubscribe é idempotente — chamar duas vezes não estoura nem derruba os outros', () => {
    const fica = vi.fn()
    assinar(fica)
    const off = assinar(vi.fn())

    off()
    expect(() => off()).not.toThrow()

    publishStretch(MSG)
    expect(fica).toHaveBeenCalledTimes(1)
  })

  it('publicar sem nenhum assinante não estoura', () => {
    expect(() => publishStretch(MSG)).not.toThrow()
  })

  // ── o teste que importa ────────────────────────────────────────────
  // Na esteira SEED→TRIAGEM→ESTICAR→DOMAR, um painel que estoura no
  // handler não pode calar os painéis seguintes: o arquivo simplesmente
  // não chega, e o usuário vê a esteira "travada" sem erro visível.
  it('assinante que estoura NÃO impede os outros de receberem', () => {
    const ordemDeChegada: string[] = []

    assinar(() => { ordemDeChegada.push('antes') })
    assinar(() => { throw new Error('painel quebrado') })
    assinar(() => { ordemDeChegada.push('depois') })

    expect(() => publishStretch(MSG)).not.toThrow()
    expect(ordemDeChegada).toEqual(['antes', 'depois'])
  })
})
