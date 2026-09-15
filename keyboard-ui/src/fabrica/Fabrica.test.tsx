import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* As três seções têm lógica própria (áudio, MIDI, fetch) e teste próprio.
   Aqui interessa a CASCA: um passo por vez, o avanço automático, e o que a
   espinha deixa ou não deixa alcançar. */
vi.mock('./Tocar', () => ({
  Tocar: ({ onGravado, modo }: { onGravado: (p: string, d: number) => void; modo?: string }) => (
    <div data-testid="sec-tocar" data-modo={modo ?? 'completo'}>
      <button onClick={() => onGravado('Z:\\assets\\synth\\synth-rec-1.webm', 42)}>gravar</button>
    </div>
  ),
}))
vi.mock('./Medir', () => ({
  Medir: ({ path, onDestino, modo }: {
    path: string | null
    onDestino: (d: { destino: 'eno'; receita: Record<string, number>; podeEsticar: boolean }) => void
    modo?: string
  }) => (
    <div data-testid="sec-medir" data-modo={modo ?? 'completo'}>
      <span data-testid="medir-path">{path ?? 'vazio'}</span>
      <button onClick={() => onDestino({
        destino: 'eno', receita: { esticar: 12, janela: 0.5 }, podeEsticar: true,
      })}>medir ok</button>
      <button onClick={() => onDestino({
        destino: 'eno', receita: { esticar: 12, janela: 0.5 }, podeEsticar: false,
      })}>medir reprova</button>
    </div>
  ),
}))
vi.mock('./Esticar', () => ({
  Esticar: ({ habilitado, modo }: { habilitado: boolean; modo?: string }) =>
    <span data-testid="sec-esticar" data-modo={modo ?? 'completo'}>
      {habilitado ? 'habilitado' : 'travado'}
    </span>,
}))

import { Fabrica } from './Fabrica'

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })

const passoAtual = () =>
  document.querySelector('[aria-current="step"]')?.textContent?.trim()

const naEspinha = (nome: string) =>
  screen.getByRole('button', { name: new RegExp(`^${nome}$`) })

describe('rota /fabrica: a casca', () => {
  it('a espinha mostra os passos na ordem do fluxo', () => {
    render(<Fabrica />)
    const txt = document.body.textContent || ''
    const pos = ['TOCAR', 'MEDIR', 'OUVIR'].map(n => txt.indexOf(n))
    expect(pos.every(p => p >= 0)).toBe(true)
    expect(pos).toEqual([...pos].sort((a, b) => a - b))
  })

  it('mostra UM passo por vez, e começa em tocar', () => {
    // O motivo de existir desta versão: as três seções empilhadas viravam parede.
    render(<Fabrica />)
    expect(passoAtual()).toBe('TOCAR')
    expect(screen.getByTestId('sec-tocar')).toBeInTheDocument()
    expect(screen.queryByTestId('sec-medir')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sec-esticar')).not.toBeInTheDocument()
  })

  it('gravar avança pra medição e desmonta o teclado', async () => {
    // Desmontar não é detalhe: o sintetizador vivo atrás da tela de medição
    // continuaria segurando o grafo de áudio.
    const u = userEvent.setup()
    render(<Fabrica />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(screen.getByTestId('sec-medir')).toBeInTheDocument())
    expect(passoAtual()).toBe('MEDIR')
    expect(screen.queryByTestId('sec-tocar')).not.toBeInTheDocument()
    expect(screen.getByTestId('medir-path'))
      .toHaveTextContent('Z:\\assets\\synth\\synth-rec-1.webm')
  })

  it('medição aprovada avança sozinha pra ouvir, já liberada', async () => {
    const u = userEvent.setup()
    render(<Fabrica />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await u.click(screen.getByRole('button', { name: 'medir ok' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toHaveTextContent('habilitado'))
    expect(passoAtual()).toBe('OUVIR')
  })

  it('medição reprovada NÃO avança: a explicação está na tela de medição', async () => {
    // O portão inteiro existe pra isto. Empurrar pra frente quem reprovou seria
    // esconder o motivo e ainda deixar esticar.
    const u = userEvent.setup()
    render(<Fabrica />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await u.click(screen.getByRole('button', { name: 'medir reprova' }))
    await waitFor(() => expect(passoAtual()).toBe('MEDIR'))
    expect(screen.getByTestId('sec-medir')).toBeInTheDocument()
    expect(screen.queryByTestId('sec-esticar')).not.toBeInTheDocument()
  })

  it('não deixa pular passo que ainda não existe', () => {
    render(<Fabrica />)
    expect(naEspinha('MEDIR')).toBeDisabled()
    expect(naEspinha('OUVIR')).toBeDisabled()
  })

  it('deixa voltar num passo já visitado', async () => {
    const u = userEvent.setup()
    render(<Fabrica />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(passoAtual()).toBe('MEDIR'))

    await u.click(naEspinha('TOCAR'))
    await waitFor(() => expect(passoAtual()).toBe('TOCAR'))
    expect(screen.getByTestId('sec-tocar')).toBeInTheDocument()
  })

  it('gravar de novo zera o veredito anterior', async () => {
    // Sem isto a tela levaria o verde da gravação passada para um arquivo que
    // ninguém mediu, e o botão de esticar nasceria liberado.
    const u = userEvent.setup()
    render(<Fabrica />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await u.click(screen.getByRole('button', { name: 'medir ok' }))
    expect(screen.getByTestId('sec-esticar')).toHaveTextContent('habilitado')

    await u.click(naEspinha('TOCAR'))
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(passoAtual()).toBe('MEDIR'))
    expect(screen.queryByTestId('sec-esticar')).not.toBeInTheDocument()
  })

  it('tem saída de volta pro dashboard', () => {
    render(<Fabrica />)
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/')
  })
})

/**
 * Modo etéreo: uma voz só, e por isso DUAS telas.
 *
 * O que estes testes prendem é a diferença que dá pra perder sem ninguém notar:
 * a espinha some, MEDIR deixa de ser passo, e o modo chega inteiro nas três
 * seções. Modo que não desce até a peça é modo que não existe.
 */
describe('rota /fabrica/etereo: a casca sem escolha', () => {
  it('não desenha espinha: não há passo alternativo pra alcançar', () => {
    render(<Fabrica modo="etereo" />)
    expect(document.querySelector('[aria-current="step"]')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'passos' })).not.toBeInTheDocument()
  })

  it('o modo desce até o teclado', () => {
    render(<Fabrica modo="etereo" />)
    expect(screen.getByTestId('sec-tocar')).toHaveAttribute('data-modo', 'etereo')
  })

  it('gravar vai DIRETO pra tela de ouvir, com a medição do lado', async () => {
    // MEDIR deixa de ser passo: ele mora na mesma tela, quieto, acima do botão.
    const u = userEvent.setup()
    render(<Fabrica modo="etereo" />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toBeInTheDocument())
    expect(screen.getByTestId('sec-medir')).toHaveAttribute('data-modo', 'etereo')
    expect(screen.getByTestId('sec-esticar')).toHaveAttribute('data-modo', 'enxuto')
    expect(screen.queryByTestId('sec-tocar')).not.toBeInTheDocument()
  })

  it('o botão nasce TRAVADO e só a medição libera', async () => {
    // Ir direto pra tela de ouvir não pode virar licença pra esticar sem medir.
    const u = userEvent.setup()
    render(<Fabrica modo="etereo" />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toHaveTextContent('travado'))
    await u.click(screen.getByRole('button', { name: 'medir ok' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toHaveTextContent('habilitado'))
  })

  it('medição reprovada mantém o botão travado na mesma tela', async () => {
    const u = userEvent.setup()
    render(<Fabrica modo="etereo" />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await u.click(screen.getByRole('button', { name: 'medir reprova' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toHaveTextContent('travado'))
    // e a recusa continua na tela, que é onde a explicação mora
    expect(screen.getByTestId('sec-medir')).toBeInTheDocument()
  })

  it('GRAVAR OUTRA volta pro teclado e zera o veredito', async () => {
    const u = userEvent.setup()
    render(<Fabrica modo="etereo" />)
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await u.click(screen.getByRole('button', { name: 'medir ok' }))
    expect(screen.getByTestId('sec-esticar')).toHaveTextContent('habilitado')

    await u.click(screen.getByRole('button', { name: 'GRAVAR OUTRA' }))
    await waitFor(() => expect(screen.getByTestId('sec-tocar')).toBeInTheDocument())
    await u.click(screen.getByRole('button', { name: 'gravar' }))
    await waitFor(() => expect(screen.getByTestId('sec-esticar')).toHaveTextContent('travado'))
  })

  it('o modo completo continua com os três passos', () => {
    render(<Fabrica />)
    expect(document.querySelector('[aria-current="step"]')?.textContent?.trim()).toBe('TOCAR')
    expect(screen.getByTestId('sec-tocar')).toHaveAttribute('data-modo', 'completo')
  })
})
