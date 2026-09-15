import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PanelProvider } from '../lib/panel-context'
import { TriagemPanel } from './TriagemPanel'

/* contrato do backend — quatro portões, como a esteira entrega de verdade */
const PORTOES = [
  { nome: 'pulso', rotulo: 'PULSO', valor: 1.8, limiar: 3.0, status: 'ok', unidade: '', obs: '' },
  { nome: 'apito', rotulo: 'APITO', valor: 3.1, limiar: 6.0, status: 'ok', unidade: 'x', obs: '' },
  { nome: 'cpp', rotulo: 'CPP', valor: 28.2, limiar: 20.0, status: 'ok', unidade: 'dB', obs: '' },
  { nome: 'corr', rotulo: 'CORR', valor: 0.7, limiar: 0.4, status: 'ok', unidade: '', obs: '' },
]

const TRIAGEM = {
  arquivo: 'x.wav', dur_s: 300, pulso: 1.8, pulso_proxy: true,
  apito_hz: 2643, apito_x: 3.1, apito_estab: 0.84, cpp: 28.2,
  centroid_hz: 569, flatness: 0.08, corr: 0.7,
  veredito: 'pronto', destino: 'eno',
  receita: {
    esticar: 12, janela: 0.5, escuro_hz: 4500, escuro_db: 7, teto_hz: 13000,
    ambiencia: 'Chuva Suave.m4a', nivel_ambiencia: -42,
  },
  portoes: PORTOES,
  af_notch: '',
  erros: [],
}

function mockFetch(triagem: unknown) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.includes('/api/triagem')) {
      return { ok: true, json: async () => triagem } as Response
    }
    return { ok: true, json: async () => [] } as Response // /api/assets/list
  })
}

async function triar(triagem: unknown) {
  vi.stubGlobal('fetch', mockFetch(triagem))
  const user = userEvent.setup()
  render(<PanelProvider><TriagemPanel onClose={() => {}} /></PanelProvider>)

  await user.type(screen.getByPlaceholderText(/caminho do arquivo/i), 'Z:/acervo/x.wav')
  await user.click(screen.getByRole('button', { name: 'TRIAR' }))
  await waitFor(() => expect(screen.getByText('x.wav', { exact: false })).toBeInTheDocument())
  return user
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals() })

describe('TriagemPanel', () => {
  it('mostra os quatro medidores com rótulo e valor', async () => {
    await triar(TRIAGEM)

    for (const p of PORTOES) {
      // o rótulo aparece na coluna e dentro do VintageMeter
      expect(screen.getAllByText(p.rotulo).length).toBeGreaterThan(0)
    }
    // pt-BR: 1.8 → "1,8"
    expect(screen.getByText('1,80')).toBeInTheDocument()
    expect(screen.getByText('28,20dB')).toBeInTheDocument()
  })

  it('veredito pronto: ESTICAR fica HABILITADO e mostra a receita', async () => {
    await triar(TRIAGEM)

    const btn = screen.getByRole('button', { name: /ESTICAR/ })
    expect(btn).toBeEnabled()
    expect(screen.getByText(/esticar x12/)).toBeInTheDocument()
    expect(screen.getByText(/Chuva Suave\.m4a/)).toBeInTheDocument()
  })

  it('veredito nao-estica: o botão ESTICAR fica DESABILITADO', async () => {
    await triar({ ...TRIAGEM, veredito: 'nao-estica' })

    const btn = screen.getByRole('button', { name: /NÃO ESTICA/ })
    expect(btn).toBeDisabled()
    // e não sobrou nenhum botão clicável oferecendo esticar
    expect(screen.queryByRole('button', { name: /ESTICAR →/ })).not.toBeInTheDocument()
  })

  it('destino do backend vem marcado entre as opções', async () => {
    await triar(TRIAGEM)
    expect(screen.getByText('ENO')).toBeInTheDocument()
    expect(screen.getByText('APHEX')).toBeInTheDocument()
    expect(screen.getByText('MOUNT-SHRINE')).toBeInTheDocument()
  })
})
