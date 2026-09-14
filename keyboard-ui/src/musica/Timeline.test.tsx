/**
 * O que dá pra afirmar sobre a Timeline num ambiente sem canvas de verdade.
 *
 * jsdom não tem contexto 2d: `getContext('2d')` devolve null. Isso é bom pra uma
 * coisa e inútil pra outra. É útil porque prova que o componente NÃO quebra
 * quando não há canvas (o loop desiste em silêncio em vez de estourar) — que é
 * também o caminho de um navegador com canvas bloqueado. É inútil pra afirmar
 * qualquer coisa sobre o desenho, então nada aqui olha pixel.
 *
 * O que se testa é o contrato que o usuário sente: apertar um botão devolve
 * CÓDIGO NOVO, com o efeito escrito nele. Se este teste passa, o editor nunca
 * fica dizendo uma coisa enquanto o take soa outra.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timeline } from './Timeline'

const TAKE = 'stack(\n  s("bd*4"),   // KICK\n  s("hh*8")\n)'

describe('Timeline', () => {
  it('lista a camada selecionada pelo nome que o autor deu', () => {
    render(<Timeline codigo={TAKE} tocando={false} onAplicar={() => {}} sel={0} onSel={() => {}} />)
    expect(screen.getByText(/1 kick/)).toBeInTheDocument()
  })

  it('mudo devolve o código com .gain(0) escrito na camada', async () => {
    const onAplicar = vi.fn()
    render(<Timeline codigo={TAKE} tocando onAplicar={onAplicar} sel={0} onSel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'mudo' }))
    expect(onAplicar).toHaveBeenCalledTimes(1)
    const novo = onAplicar.mock.calls[0][0] as string
    expect(novo).toContain('.gain(0)')
    expect(novo).toContain('s("hh*8")')   // a outra camada saiu intacta
  })

  it('fx devolve o código com o método pendurado, e não um estado invisível', async () => {
    const onAplicar = vi.fn()
    render(<Timeline codigo={TAKE} tocando onAplicar={onAplicar} sel={0} onSel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^abafa/ }))
    expect(onAplicar.mock.calls[0][0]).toContain('.lpf(1200)')
  })

  it('take vazio diz isso com palavra, em vez de mostrar grade vazia', () => {
    render(<Timeline codigo="" tocando={false} onAplicar={() => {}} sel={0} onSel={() => {}} />)
    expect(screen.getByText(/nada tocando ainda/)).toBeInTheDocument()
  })

  it('sem contexto 2d (jsdom, canvas bloqueado) o componente ainda monta', () => {
    expect(() => render(<Timeline codigo={TAKE} tocando onAplicar={() => {}} sel={0} onSel={() => {}} />)).not.toThrow()
  })

  /** A outra metade do contrato da fase 5: o índice que a grade devolve é o que
      esta régua exibe. Sem isto, escolher na grade e agir na régua seriam duas
      decisões diferentes com a mesma cara. */
  it('a régua nomeia a camada que o host escolheu, não uma sua', () => {
    render(<Timeline codigo={TAKE} tocando onAplicar={() => {}} sel={1} onSel={() => {}} />)
    expect(screen.getByText(/^2 /)).toBeInTheDocument()
  })
})
