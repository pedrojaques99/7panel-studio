/**
 * O que a /mix não pode quebrar.
 *
 * 1. A tela manda EXATAMENTE o que mostra: música escolhida, camadas na ordem em que
 *    entraram (a primeira é o lugar, a segunda a textura — o backend dá níveis diferentes
 *    por posição), o knob em dB e a respiração.
 * 2. No máximo duas camadas. A terceira não entra, em silêncio nenhum: o botão fica
 *    marcado como indisponível.
 * 3. Aviso de voz aparece ANTES do render. Fala num fundo é o pior evento possível, e
 *    descobrir isso depois de renderizar 1 h é o jeito caro.
 *
 * Web Audio e <audio>.play não existem no jsdom e só são tocados no ▶, então o dublê é
 * só o fetch: mede-se controle, não som.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Mix } from './Mix'
import { volumePreview, type Ambiente, type Faixa } from './modelo'

const AMB: Ambiente[] = [
  { id: 'cave', titulo: 'caverna escura', categorias: ['caverna'], origem: 'web', dur_s: 1800, lufs: -31, local: true, loop: true, avisos: [] },
  { id: 'rua', titulo: 'Rua Campo Erê', categorias: ['cidade'], origem: 'proprio', dur_s: 30, lufs: -35, local: true, loop: false,
    avisos: ['Rua Campo Erê tem voz em 81% do arquivo: fala num fundo e o pior evento'] },
  { id: 'chuva-forte', titulo: 'chuva forte', categorias: ['chuva'], origem: 'proprio', dur_s: 840, lufs: -28, local: true, loop: false, avisos: [] },
]
const MUS: Faixa[] = [{ grupo: 'era3', nome: 'xtal-vidro', caminho: 'Z:\\era3\\xtal-vidro.wav', mb: 26 }]

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async (url: string) => ({
    json: async () => (
      url.includes('/api/mix/catalog') ? { itens: AMB }
        : url.includes('/api/mix/musicas') ? { musicas: MUS }
          : url.includes('/api/mix/render') ? { job_id: 'j1', status: 'running' }
            : { status: 'running' }),
  }))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

const corpoDoRender = () => {
  const call = fetchSpy.mock.calls.find(c => String(c[0]).includes('/api/mix/render'))
  expect(call).toBeDefined()
  return JSON.parse(call![1].body)
}
const listaAmb = () => screen.getByRole('list', { name: /ambiências/i })

async function escolher(u: ReturnType<typeof userEvent.setup>, ...ambs: RegExp[]) {
  await u.click(await screen.findByRole('button', { name: /xtal-vidro/ }))
  for (const a of ambs) await u.click(within(listaAmb()).getByRole('button', { name: a }))
}

describe('a porta do render', () => {
  it('fica fechada até ter música E ambiência', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    const exportar = screen.getByRole('button', { name: /exportar/i })
    expect(exportar).toBeDisabled()
    await u.click(await screen.findByRole('button', { name: /xtal-vidro/ }))
    expect(exportar).toBeDisabled()
    await u.click(within(listaAmb()).getByRole('button', { name: /caverna escura/ }))
    expect(exportar).toBeEnabled()
  })
})

describe('o payload que vai pro /api/mix/render', () => {
  it('export leva música, camadas no zero do limiar e respirando, formato e duração', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await escolher(u, /caverna escura/, /chuva forte/)
    await u.click(screen.getByRole('button', { name: /exportar/i }))

    await waitFor(() => corpoDoRender())
    const b = corpoDoRender()
    expect(b.musica).toBe('Z:\\era3\\xtal-vidro.wav')
    // a ORDEM importa: a primeira é o lugar, a segunda a textura
    expect(b.camadas).toEqual([
      { id: 'cave', nivel_db: 0, respira: true },
      { id: 'chuva-forte', nivel_db: 0, respira: true },
    ])
    expect(b.formato).toBe('mp3')
    expect(b.duracao_s).toBeNull()
    expect(b.preview_s).toBeNull()
  })

  it('preview pede 30 s em mp3 e ignora a duração escolhida', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await escolher(u, /caverna escura/)
    await u.click(within(screen.getByRole('group', { name: /duração/i })).getByRole('button', { name: /1 h/ }))
    await u.click(screen.getByRole('button', { name: /preview 30/i }))

    await waitFor(() => corpoDoRender())
    const b = corpoDoRender()
    expect(b.preview_s).toBe(30)
    expect(b.formato).toBe('mp3')
    expect(b.duracao_s).toBeNull()
  })

  it('respira desligado vai desligado', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await escolher(u, /caverna escura/)
    await u.click(screen.getByRole('button', { name: /^respira$/i }))
    await u.click(screen.getByRole('button', { name: /exportar/i }))
    await waitFor(() => corpoDoRender())
    expect(corpoDoRender().camadas[0].respira).toBe(false)
  })
})

describe('as camadas', () => {
  it('no máximo duas: a terceira não entra', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await escolher(u, /caverna escura/, /chuva forte/, /Rua Campo Erê/)
    const marcadas = within(listaAmb()).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(marcadas).toHaveLength(2)
    expect(within(listaAmb()).getByRole('button', { name: /Rua Campo Erê/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('o chip de categoria filtra a lista', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await screen.findByRole('button', { name: /xtal-vidro/ })
    await u.click(within(screen.getByRole('group', { name: /categorias/i })).getByRole('button', { name: /caverna/ }))
    const itens = within(listaAmb()).getAllByRole('button')
    expect(itens).toHaveLength(1)
    expect(itens[0]).toHaveAccessibleName(/caverna escura/)
  })

  it('aviso de voz aparece antes do render', async () => {
    const u = userEvent.setup()
    render(<Mix />)
    await escolher(u, /Rua Campo Erê/)
    expect(within(screen.getByRole('list', { name: /avisos/i })).getByText(/tem voz/)).toBeInTheDocument()
  })
})

describe('volumePreview', () => {
  it('knob pra cima soa mais alto, e nunca passa de 1', () => {
    expect(volumePreview(-31, 6, 0)).toBeGreaterThan(volumePreview(-31, 0, 0))
    expect(volumePreview(-60, 12, 0)).toBeLessThanOrEqual(1)
  })
  it('cama gravada mais baixa ganha mais, pra chegar igual no zero', () => {
    expect(volumePreview(-40, 0, 0)).toBeGreaterThan(volumePreview(-25, 0, 0))
  })
  it('textura fica abaixo do lugar no mesmo knob', () => {
    expect(volumePreview(-31, 0, 1)).toBeLessThan(volumePreview(-31, 0, 0))
  })
})
