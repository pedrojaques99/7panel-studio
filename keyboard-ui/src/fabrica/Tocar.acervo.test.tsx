/**
 * O acervo como ESCOLHA, não como despejo.
 *
 * O painel do SAMPLE listava 200+ arquivos numa lista plana com busca por texto. Busca
 * resolve quando se SABE o nome; não resolve "me mostra o que tem de instrumento", que é
 * a pergunta de quem abriu o painel pra trocar o som do teclado. Os 12 instrumentos
 * afinados (`vintage/`) sumiam no meio de bateria, FX e render.
 *
 * Este arquivo prende as quatro coisas que o conserto precisa manter de pé:
 *  1. as pílulas de pasta saem do DADO (pasta nova aparece sozinha, sem editar código),
 *  2. `vintage` abre já selecionada, porque é a única pasta de instrumento afinado,
 *  3. TUDO continua a um clique — o resto do acervo não foi escondido, foi adiado,
 *  4. em `vintage` o slug vira rótulo legível, e só ali (nas outras pastas o nome cru
 *     é a única pista de procedência).
 *
 * O motor de áudio é dublê, como no `Tocar.a11y.test.tsx`. Aqui não se mede som.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const paramFalso = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
})

const noFalso = () => ({
  connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  gain: paramFalso(), frequency: paramFalso(), detune: paramFalso(),
  playbackRate: paramFalso(), type: 'sine', loop: false, buffer: null,
  fftSize: 1024, stream: {}, getFloatTimeDomainData: vi.fn(),
})

const ctxFalso = {
  currentTime: 0, sampleRate: 48000, state: 'running',
  createGain: noFalso, createOscillator: noFalso, createBufferSource: noFalso,
  createAnalyser: noFalso, createMediaStreamDestination: noFalso,
  createBiquadFilter: noFalso, createDynamicsCompressor: noFalso,
  createBuffer: () => ({ duration: 1, length: 48000, numberOfChannels: 1 }),
  decodeAudioData: async () => ({ duration: 1, length: 48000, numberOfChannels: 1 }),
  resume: vi.fn(), destination: noFalso(),
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
  createLFO: () => ({}), connectLFO: vi.fn(), updateLFO: vi.fn(), disposeLFO: vi.fn(),
}))
vi.mock('../lib/midi', () => ({
  requestMIDIAccess: async () => null,
  listMIDIInputs: () => [],
  createMIDIListener: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

import { Tocar } from './Tocar'

/** Um acervo com a forma do real: pouca coisa afinada, muita bateria e render. */
const ACERVO = [
  { name: 'taca-de-vidro.wav', path: 'Z:/a/vintage/taca-de-vidro.wav', folder: 'vintage', size: 4_400_000, modified: '' },
  { name: 'tx81z-fm-piano.wav', path: 'Z:/a/vintage/tx81z-fm-piano.wav', folder: 'vintage', size: 1_300_000, modified: '' },
  { name: 'piano-de-armario.wav', path: 'Z:/a/vintage/piano-de-armario.wav', folder: 'vintage', size: 5_500_000, modified: '' },
  { name: 'kick_808.wav', path: 'Z:/a/samples/kick_808.wav', folder: 'samples', size: 90_000, modified: '' },
  { name: 'snare_vhulto.wav', path: 'Z:/a/samples/snare_vhulto.wav', folder: 'samples', size: 80_000, modified: '' },
  { name: 'hat_01.wav', path: 'Z:/a/samples/hat_01.wav', folder: 'samples', size: 40_000, modified: '' },
  { name: 'ps_00e41f.wav', path: 'Z:/a/ps_/ps_00e41f.wav', folder: 'ps_', size: 120_000, modified: '' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    String(url).includes('/api/assets/list')
      ? { ok: true, json: async () => ACERVO }
      : { ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(8) }))
})

async function abrirAcervo() {
  const u = userEvent.setup()
  render(<Tocar onGravado={() => {}} />)
  await u.click(screen.getByRole('button', { name: /^SAMPLE$/ }))
  await screen.findByRole('button', { name: /^vintage, / })
  return u
}

const pilula = (nome: RegExp) => screen.getByRole('button', { name: nome })

describe('acervo: achar o instrumento sem saber o nome do arquivo', () => {
  it('as pílulas de pasta saem do dado, com a contagem de cada uma', async () => {
    await abrirAcervo()
    // vintage 3, samples 3, ps_ 1 — e TUDO com o total
    expect(pilula(/^vintage, 3 arquivos$/)).toBeTruthy()
    expect(pilula(/^samples, 3 arquivos$/)).toBeTruthy()
    expect(pilula(/^tudo, 7 arquivos$/)).toBeTruthy()
  })

  it('abre já em vintage: quem veio trocar o som do teclado não devia procurar', async () => {
    await abrirAcervo()
    expect(pilula(/^vintage, 3 arquivos$/).getAttribute('aria-pressed')).toBe('true')
    expect(pilula(/^tudo, 7 arquivos$/).getAttribute('aria-pressed')).toBe('false')
    // e a bateria não está na frente
    expect(screen.queryByText('kick_808.wav')).toBeNull()
  })

  it('TUDO continua a um clique: o resto foi adiado, não escondido', async () => {
    const u = await abrirAcervo()
    await u.click(pilula(/^tudo, 7 arquivos$/))
    expect(screen.getByText('kick_808.wav')).toBeTruthy()
    expect(screen.getByText('ps_00e41f.wav')).toBeTruthy()
  })

  it('em vintage o slug vira rótulo legível, e só ali', async () => {
    const u = await abrirAcervo()
    expect(screen.getByText('taca de vidro')).toBeTruthy()
    expect(screen.queryByText('taca-de-vidro.wav')).toBeNull()

    await u.click(pilula(/^samples, 3 arquivos$/))
    // fora de vintage o nome cru é a única pista de procedência: fica como está
    expect(screen.getByText('snare_vhulto.wav')).toBeTruthy()
  })

  it('o sorteio busca o acervo sozinho, cai dentro do filtro e não abre a gaveta', async () => {
    const u = userEvent.setup()
    render(<Tocar onGravado={() => {}} />)

    // com o acervo ainda não lido, o botão busca e sorteia quando a lista chega
    await u.click(screen.getByRole('button', { name: /trocar o sample ao acaso/i }))

    const chamadas = () => (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map(c => String(c[0]))
    await vi.waitFor(() => {
      expect(chamadas().some(u => u.includes('/api/preview'))).toBe(true)
    })

    /* Sorteou DENTRO do filtro: a gaveta nasce em `vintage`, então o arquivo pedido
       tem que ser de lá — sortear nos 2797 cairia num hat de bateria quase sempre. */
    const pedido = chamadas().find(u => u.includes('/api/preview')) as string
    expect(decodeURIComponent(pedido)).toContain('/vintage/')

    // e a gaveta não abriu: sortear é o gesto de quem NÃO quer escolher
    expect(screen.queryByRole('dialog', { name: /acervo/i })).toBeNull()
  })

  it('a busca ainda estreita dentro da pasta escolhida', async () => {
    const u = await abrirAcervo()
    await u.type(screen.getByRole('textbox', { name: /filtrar o acervo/i }), 'piano')
    const lista = screen.getByText('piano de armario')
    expect(lista).toBeTruthy()
    expect(screen.queryByText('taca de vidro')).toBeNull()
  })
})
