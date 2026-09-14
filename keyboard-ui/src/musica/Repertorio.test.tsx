/**
 * A coluna do acervo, nas quatro regras que a auditoria comprou.
 *
 * Estão aqui e não numa conferida no navegador porque `:hover` não dispara com
 * evento sintético do CDP (o ponteiro é falso, o CSS não repinta) — tentei, não
 * prova nada. O que dá pra provar sem ponteiro de verdade é o COMPORTAMENTO:
 * quem fica em cima, quem chama o quê, e o que a tela diz quando não acha nada.
 *
 * A parte visual do hover (opacidade do `⋯`, realce da linha) mora em
 * `index.css` e é CSS puro — se a regra existe no arquivo servido, ela funciona;
 * fingir isso em jsdom, que não faz layout, seria teatro.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Repertorio } from './Repertorio'
import type { SongSummary } from '../lib/songs-api'

const agora = Date.now() / 1000

function musica(nome: string, extra: Partial<SongSummary> = {}): SongSummary {
  return {
    name: nome, favorito: false, versions: 3, bpm: 120,
    author: 'user', message: 'mexi no pad', ts: agora - 60, ...extra,
  }
}

// Ordem que o backend entrega: mexida mais recente primeiro.
const ACERVO: SongSummary[] = [
  musica('entropia', { ts: agora - 10 }),
  musica('tempestade', { favorito: true, ts: agora - 20 }),
  musica('acido-303', { ts: agora - 30 }),
  musica('cama-eno', { favorito: true, ts: agora - 40 }),
]

function montar(over: Partial<React.ComponentProps<typeof Repertorio>> = {}) {
  const props = {
    itens: ACERVO,
    aberta: null,
    onAbrir: vi.fn(),
    onCriar: vi.fn(),
    onRenomear: vi.fn(),
    onExcluir: vi.fn(),
    onFixar: vi.fn(),
    ...over,
  }
  render(<Repertorio {...props} />)
  return props
}

/** Os nomes na ordem em que aparecem na tela. */
function nomesNaTela() {
  return screen.getAllByText(/^(entropia|tempestade|acido-303|cama-eno)$/).map(e => e.textContent)
}

describe('fixadas', () => {
  it('sobem pro topo e ficam em ordem alfabética, não por recência', () => {
    montar()
    // cama-eno é a MENOS recente das duas fixadas e mesmo assim vem primeiro:
    // o bloco de cima é alfabético de propósito — MRU faria a linha pular de
    // lugar a cada save e a posição nunca viraria memória motora.
    expect(nomesNaTela()).toEqual(['cama-eno', 'tempestade', 'entropia', 'acido-303'])
  })

  it('o resto continua na ordem que o backend mandou', () => {
    montar()
    const soltas = nomesNaTela().slice(2)
    expect(soltas).toEqual(['entropia', 'acido-303'])
  })

  it('clicar no marcador fixa sem abrir a música', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.click(screen.getByLabelText('fixar entropia'))
    expect(props.onFixar).toHaveBeenCalledWith('entropia', true)
    expect(props.onAbrir).not.toHaveBeenCalled()   // o clique não pode vazar pra linha
  })

  it('já fixada, o marcador oferece soltar', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.click(screen.getByLabelText('soltar tempestade'))
    expect(props.onFixar).toHaveBeenCalledWith('tempestade', false)
  })

  it('F na linha focada fixa, sem precisar do mouse', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.tab()                                   // busca
    await u.tab()                                   // primeira linha (cama-eno)
    await u.keyboard('f')
    expect(props.onFixar).toHaveBeenCalledWith('cama-eno', false)
  })

  it('sem nenhuma fixada, a lista é plana — a régua não aparece sozinha', () => {
    const { container } = render(
      <Repertorio
        itens={ACERVO.map(i => ({ ...i, favorito: false }))}
        aberta={null} onAbrir={vi.fn()} onCriar={vi.fn()} onRenomear={vi.fn()}
        onExcluir={vi.fn()} onFixar={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('[data-musica]')).toHaveLength(4)
    expect(nomesNaTela()).toEqual(['entropia', 'tempestade', 'acido-303', 'cama-eno'])
  })
})

describe('a linha mostra o que decide', () => {
  it('traz o recado da última versão, que é o que devolve contexto sem abrir', () => {
    montar()
    expect(screen.getAllByText('mexi no pad').length).toBe(4)
  })

  it('marca claude só quando a última versão veio do CLI', () => {
    render(
      <Repertorio
        itens={[musica('entropia', { author: 'claude' }), musica('take-01', { author: 'user' })]}
        aberta={null} onAbrir={vi.fn()} onCriar={vi.fn()} onRenomear={vi.fn()}
        onExcluir={vi.fn()} onFixar={vi.fn()}
      />,
    )
    // marca que quase toda linha carrega não é marca: 'user' não rende nada.
    expect(screen.getAllByText('claude')).toHaveLength(1)
  })

  it('não mostra bpm nem número de versão: crescem em todas e não separam nenhuma', () => {
    montar()
    expect(screen.queryByText(/120bpm/)).toBeNull()
    expect(screen.queryByText(/^v2$/)).toBeNull()
  })
})

describe('busca', () => {
  it('sem resultado, diz que não achou e oferece criar com o termo digitado', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.type(screen.getByLabelText('buscar no repertório'), 'zzz')

    // Vazio silencioso é a mentira dominante deste tipo de tela: sem isto não dá
    // pra saber se filtrou tudo, se o backend caiu, ou se o acervo sumiu.
    expect(screen.getByText(/nenhuma com/)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /criar/ }))
    expect(props.onCriar).toHaveBeenCalledWith('zzz')
  })

  it('Escape limpa o termo antes de sair do campo', async () => {
    const u = userEvent.setup()
    montar()
    const campo = screen.getByLabelText('buscar no repertório')
    await u.type(campo, 'ent')
    expect(nomesNaTela()).toEqual(['entropia'])
    await u.keyboard('{Escape}')
    // Sair deixando a lista filtrada com o campo desfocado esconderia metade do
    // acervo sem dizer que escondeu.
    expect(nomesNaTela()).toHaveLength(4)
  })

  it('filtrando, a divisão some: filtrar já destruiu a posição espacial', async () => {
    const u = userEvent.setup()
    const { container } = render(
      <Repertorio
        itens={ACERVO} aberta={null} onAbrir={vi.fn()} onCriar={vi.fn()}
        onRenomear={vi.fn()} onExcluir={vi.fn()} onFixar={vi.fn()}
      />,
    )
    await u.type(screen.getByLabelText('buscar no repertório'), 'a')
    const reguas = container.querySelectorAll('div[style*="border-top"]')
    // só a régua do rodapé de "+ música" sobra
    expect(reguas.length).toBeLessThanOrEqual(1)
  })
})

describe('menu de ações', () => {
  it('fecha no Escape — antes o único jeito era tirar o mouse da linha', async () => {
    const u = userEvent.setup()
    montar()
    await u.click(screen.getByLabelText('ações de entropia'))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('renomear')).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('fecha ao clicar fora, e não abre a música ao fazer isso', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.click(screen.getByLabelText('ações de entropia'))
    await u.click(screen.getByLabelText('buscar no repertório'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(props.onAbrir).not.toHaveBeenCalled()
  })

  it('oferece fixar como primeira ação', async () => {
    const u = userEvent.setup()
    const props = montar()
    await u.click(screen.getByLabelText('ações de entropia'))
    await u.click(within(screen.getByRole('menu')).getByText('fixar no topo'))
    expect(props.onFixar).toHaveBeenCalledWith('entropia', true)
  })
})
