/**
 * O teclado como CONTROLE, não como desenho.
 *
 * As 25 teclas eram `div` com manipulador de ponteiro: `Tab` não chegava nelas e um
 * leitor de tela não via que existia um teclado ali. Este arquivo prende as três
 * coisas que o conserto precisa manter de pé:
 *  1. cada tecla é alcançável por papel e nome, dentro de um grupo com nome,
 *  2. acionar por teclado dispara UMA vez (a prova é o DRONE: disparo duplo liga e
 *     desliga na mesma ação, e o efeito líquido seria nada acontecer),
 *  3. segurar Enter não redispara a nota.
 *
 * O motor de áudio é trocado por dublê. Aqui não se mede som, mede-se controle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* ── dublês: WebAudio, Tone e MIDI não existem no jsdom ──────────────── */

const paramFalso = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
})

const noFalso = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  gain: paramFalso(),
  frequency: paramFalso(),
  detune: paramFalso(),
  playbackRate: paramFalso(),
  type: 'sine',
  loop: false,
  buffer: null,
  fftSize: 1024,
  stream: {},
  getFloatTimeDomainData: vi.fn(),
})

const ctxFalso = {
  currentTime: 0,
  state: 'running',
  resume: vi.fn(),
  destination: noFalso(),
  createGain: vi.fn(noFalso),
  createOscillator: vi.fn(noFalso),
  createBufferSource: vi.fn(noFalso),
  createAnalyser: vi.fn(noFalso),
  createMediaStreamSource: vi.fn(noFalso),
  createMediaStreamDestination: vi.fn(noFalso),
  decodeAudioData: vi.fn(),
}

vi.mock('tone', () => ({ connect: vi.fn(), getContext: () => ({ rawContext: ctxFalso }) }))

vi.mock('../lib/audio-context', () => ({
  getSharedAudioContext: () => ctxFalso,
  createCaptureDestination: () => noFalso(),
}))

vi.mock('../lib/fx-rack', async () => {
  const real = await vi.importActual<typeof import('../lib/fx-rack')>('../lib/fx-rack')
  return {
    FX_DEFAULTS: real.FX_DEFAULTS,
    createFxChain: () => ({ input: noFalso() }),
    updateFxChain: vi.fn(),
    disposeFxChain: vi.fn(),
  }
})

vi.mock('../lib/lfo', () => ({
  createLFO: () => ({}),
  connectLFO: vi.fn(),
  updateLFO: vi.fn(),
  disposeLFO: vi.fn(),
}))

vi.mock('../lib/midi', () => ({
  requestMIDIAccess: async () => null,
  listMIDIInputs: () => [],
  createMIDIListener: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

import { Tocar } from './Tocar'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})

const teclado = () => screen.getByRole('group', { name: 'teclado' })
const tecla = (nome: RegExp) => screen.getByRole('button', { name: nome })
const drone = () => screen.getByRole('button', { name: /^DRONE$/ })

describe('teclado de piano: alcançável e acionável por teclado', () => {
  it('as 25 teclas moram num grupo com nome, em vez de botões soltos', () => {
    render(<Tocar onGravado={() => {}} />)
    const dentro = teclado().querySelectorAll('button')
    expect(dentro).toHaveLength(25)
  })

  it('cada tecla se apresenta pela nota, e diz o atalho quando existe', () => {
    render(<Tocar onGravado={() => {}} />)
    // branca com atalho, branca sem atalho e preta: os três desenhos de tecla
    expect(tecla(/^C4, atalho A$/)).toBeInTheDocument()
    expect(tecla(/^D#4$/)).toBeInTheDocument()
    expect(tecla(/^C#3$/)).toBeInTheDocument()
    expect(tecla(/^C4, atalho A$/)).toHaveAttribute('aria-keyshortcuts', 'A')
  })

  it('Tab chega no instrumento', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    const alvo = tecla(/^C3, atalho Z$/)
    alvo.focus()
    expect(alvo).toHaveFocus()
    await u.tab()
    // o foco anda DENTRO do teclado, não pula ele inteiro
    expect(teclado().contains(document.activeElement)).toBe(true)
  })

  it('a tecla que soa diz que está soando', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    const alvo = tecla(/^E4, atalho D$/)
    expect(alvo).toHaveAttribute('aria-pressed', 'false')
    alvo.focus()
    await u.keyboard('{Enter>}')
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
    await u.keyboard('{/Enter}')
    expect(alvo).toHaveAttribute('aria-pressed', 'false')
  })

  it('Espaço aciona a tecla focada e solta ao largar', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    const alvo = tecla(/^G4, atalho G$/)
    alvo.focus()
    await u.keyboard('{ >}')
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
    await u.keyboard('{/ }')
    expect(alvo).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('o disparo não pode dobrar', () => {
  /* No DRONE a tecla é um INTERRUPTOR: o segundo disparo desliga a nota. Por isso
     ele é o melhor detector de disparo duplo que existe nesta tela: dobrar o
     acionamento liga e desliga na mesma ação, e o efeito líquido é nada acontecer. */

  it('DRONE mais teclado: uma ação, uma nota de pé', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    await u.click(drone())
    const alvo = tecla(/^A4, atalho H$/)
    alvo.focus()
    await u.keyboard('{Enter>}')
    await u.keyboard('{/Enter}')
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
  })

  it('DRONE mais mouse: o clique não soma um segundo disparo', async () => {
    // `click` do usuário é mousedown mais mouseup mais click. Se a tecla ouvisse
    // o clique além do ponteiro, a nota subiria e desceria na mesma ação.
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    await u.click(drone())
    const alvo = tecla(/^B4, atalho J$/)
    await u.click(alvo)
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
  })

  it('DRONE: o segundo acionamento continua desligando aquela nota', async () => {
    // O toggle é bug consertado e verificado à mão. Ele não pode morrer aqui.
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    await u.click(drone())
    const alvo = tecla(/^F4, atalho F$/)
    alvo.focus()
    await u.keyboard('{Enter>}{/Enter}')
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
    await u.keyboard('{Enter>}{/Enter}')
    expect(alvo).toHaveAttribute('aria-pressed', 'false')
  })

  it('segurar Enter não redispara a nota', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)
    await u.click(drone())
    const alvo = tecla(/^D4, atalho S$/)
    alvo.focus()
    // dois keydown seguidos, o jeito que o navegador repete tecla segurada. Dois é o
    // número que separa: sem o guarda de `repeat` o segundo desligaria a nota.
    await u.keyboard('{Enter>2/}')
    expect(alvo).toHaveAttribute('aria-pressed', 'true')
  })
})
