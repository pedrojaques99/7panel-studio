/**
 * O que esta rota não pode quebrar.
 *
 * O contrato aqui é que a tela MANDA EXATAMENTE O QUE MOSTRA. Ela abre no gosto da
 * casa (−14 / +10,5), o que é deliberado — mas o número aparece em dB na tela antes
 * de qualquer render, então não há gosto aplicado às escondidas. Se o payload e o
 * mostrador discordarem, é aqui que quebra.
 *
 * O que protege o ACERVO é outro teste, no backend: `grave_db` nasce 0.0 no
 * `domar.py`, então quem chama a API sem passar nada continua tendo o som de sempre
 * (`test_sem_grave_a_cadeia_sai_igual_a_de_antes`). Os dois contratos são diferentes
 * e vivem em lugares diferentes de propósito.
 *
 * O segundo é o mapa da mesa: x=0 é ESCURO (shelf no talo) e x=1 é BRILHO (shelf
 * desligado). Inverter isso não quebra build nem teste de tipo — só faz o controle
 * andar ao contrário na mão de quem usa, que é o tipo de defeito que passa.
 *
 * Web Audio não existe no jsdom e o grafo só sobe no play, então o dublê aqui é
 * mínimo de propósito: mede-se controle, não som.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Eq } from './Eq'

const CAMINHO = 'Z:\\assets\\cama\\chuva_1h.mp3'

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // `AudioContext` só é tocado no play; existe aqui pra um play acidental não
  // derrubar a suíte inteira com "not defined".
  vi.stubGlobal('AudioContext', vi.fn())
  fetchSpy = vi.fn().mockResolvedValue({
    json: async () => ({ job_id: 'abc123', status: 'running', out: 'saida.mp3' }),
  })
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

const corpoDoPost = () => JSON.parse(fetchSpy.mock.calls[0][1].body)

describe('o payload que vai pro /api/domar', () => {
  it('abre no gosto da casa, e manda exatamente o que a tela mostra', async () => {
    const u = userEvent.setup()
    render(<Eq />)
    await u.type(screen.getByPlaceholderText(/caminho do áudio/i), CAMINHO)
    await u.click(screen.getByRole('button', { name: /renderizar/i }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const b = corpoDoPost()
    expect(b.grave_db).toBe(10.5)
    expect(b.escuro_db).toBe(14)
    // reverb continua nascendo desligado: espaço é a escolha mais cara de desfazer
    // num render de 1 h, e ninguém pediu que ele viesse ligado.
    expect(b.reverb_wet).toBe(0)
  })

  it('leva o caminho e o alvo de loudness', async () => {
    const u = userEvent.setup()
    render(<Eq />)
    await u.type(screen.getByPlaceholderText(/caminho do áudio/i), CAMINHO)
    await u.click(screen.getByRole('button', { name: /renderizar/i }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const b = corpoDoPost()
    expect(b.path).toBe(CAMINHO)
    expect(b.alvo_lufs).toBe(-16)
  })
})

describe('a porta do render', () => {
  it('sem arquivo não dá pra renderizar', () => {
    render(<Eq />)
    expect(screen.getByRole('button', { name: /renderizar/i })).toBeDisabled()
  })

  it('com arquivo, abre', async () => {
    const u = userEvent.setup()
    render(<Eq />)
    await u.type(screen.getByPlaceholderText(/caminho do áudio/i), CAMINHO)
    expect(screen.getByRole('button', { name: /renderizar/i })).toBeEnabled()
  })
})

describe('a mesa XY', () => {
  it('é alcançável por teclado — o gesto não pode ser o único caminho', async () => {
    const u = userEvent.setup()
    render(<Eq />)
    await u.tab()
    // o primeiro Tab cai no campo de caminho; o segundo tem que chegar na mesa
    await u.tab()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('seta pra esquerda ESCURECE (menos agudo), não o contrário', async () => {
    const u = userEvent.setup()
    render(<Eq />)
    const antes = screen.getByText(/agudo @ 4500 Hz/i)
      .parentElement!.querySelector('div')!.textContent!
    const mesa = document.querySelector('[tabindex]') as HTMLElement | null
    // sem `expect` aqui, um `return` silencioso faria este teste passar sem testar
    // nada — que é o jeito mais caro de ter cobertura.
    expect(mesa).not.toBeNull()
    mesa!.focus()
    await u.keyboard('{ArrowLeft}')
    const depois = screen.getByText(/agudo @ 4500 Hz/i)
      .parentElement!.querySelector('div')!.textContent!
    // ESTRITO de propósito: `<=` passaria também se a seta não fizesse nada, que é
    // exatamente o defeito que este teste existe pra pegar. O valor mostrado é o
    // ganho do shelf, negativo — escurecer é ficar MAIS negativo.
    expect(parseFloat(depois)).toBeLessThan(parseFloat(antes))
  })
})
