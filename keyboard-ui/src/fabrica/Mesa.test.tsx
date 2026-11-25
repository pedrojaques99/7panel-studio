/**
 * A MESA como ORQUESTRAÇÃO — o áudio é problema do `Tocar`, que tem teste próprio.
 *
 * Este arquivo prende as coisas que o desenho precisa manter de pé:
 *  1. o gravador é SEMPRE da mesa, em qualquer número de camadas: um take, nunca N,
 *  2. a segunda camada faz nascer o play/pause, e o GRAVAR passa a dizer TUDO,
 *  3. pausar é estado da camada, não sumiço: ela continua na tela e diz que está pausada,
 *  4. o teto de três é teto mesmo — a quarta não existe,
 *  5. a última camada não sai: mesa sem camada não é tela,
 *  6. salvar e reabrir devolve as camadas com a voz que cada uma tinha.
 *
 * O `Tocar` entra dublado: aqui não se mede som, mede-se quem manda em quem. O dublê
 * ecoa as props que a mesa passa, que é o contrato entre os dois.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./Tocar', () => ({
  Tocar: ({ ligada, semGravacao, estadoInicial }: {
    ligada?: boolean; semGravacao?: boolean
    estadoInicial?: { presetId: string; samplePath: string | null }
  }) => (
    <div
      data-testid="camada"
      data-ligada={String(ligada ?? true)}
      data-sem-gravacao={String(semGravacao ?? false)}
      data-sample={estadoInicial?.samplePath ?? ''}
    />
  ),
}))

vi.mock('../lib/audio-context', () => ({
  getMasterCaptureStream: () => ({}),
  getSharedAudioContext: () => ({}),
  createCaptureDestination: () => ({}),
  getMasterCaptureNode: () => ({ connect: vi.fn() }),
}))

import { Mesa } from './Mesa'

const camadas = () => screen.getAllByTestId('camada')
const addSynth = () => screen.getByRole('button', { name: /\+ SYNTH/ })

async function comCamadas(n: number) {
  const u = userEvent.setup()
  render(<Mesa onGravado={() => {}} />)
  for (let i = 1; i < n; i++) await u.click(addSynth())
  return u
}

describe('mesa: várias camadas tocando juntas, um gravador só', () => {
  it('uma camada: sem moldura e sem play/pause, mas o GRAVAR já é o da barra', async () => {
    await comCamadas(1)
    expect(camadas()).toHaveLength(1)
    // o gravador é sempre da mesa: um take, nunca N
    expect(camadas()[0].dataset.semGravacao).toBe('true')
    expect(screen.getByRole('button', { name: /^GRAVAR$/ })).toBeTruthy()
    // e não há play/pause por camada, porque não há o que escolher
    expect(screen.queryByRole('button', { name: /camada 1/i })).toBeNull()
  })

  it('a segunda camada faz nascer o play/pause, e o GRAVAR vira GRAVAR TUDO', async () => {
    await comCamadas(2)
    expect(camadas()).toHaveLength(2)
    expect(screen.getByRole('button', { name: /GRAVAR TUDO/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /pausar a camada 1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /pausar a camada 2/i })).toBeTruthy()
    // e o gravador de cada Tocar sai de cena: um take, não três
    for (const c of camadas()) expect(c.dataset.semGravacao).toBe('true')
  })

  it('pausar é estado da camada, e ela continua na tela', async () => {
    const u = await comCamadas(2)
    await u.click(screen.getByRole('button', { name: /pausar a camada 1/i }))

    expect(camadas()[0].dataset.ligada).toBe('false')
    expect(camadas()[1].dataset.ligada).toBe('true')
    expect(camadas()).toHaveLength(2)
    // o botão agora oferece o contrário, que é como se sabe em que estado está
    expect(screen.getByRole('button', { name: /tocar a camada 1/i })).toBeTruthy()
  })

  it('o teto de três é teto: a quarta não existe', async () => {
    await comCamadas(3)
    expect(camadas()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /\+ SYNTH/ })).toBeNull()
  })

  it('voltando a uma camada, o GRAVAR deixa de dizer TUDO', async () => {
    const u = await comCamadas(2)
    await u.click(screen.getByRole('button', { name: /tirar a camada 2/i }))

    expect(camadas()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /GRAVAR TUDO/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^GRAVAR$/ })).toBeTruthy()
  })

  it('a última camada não pode ser removida: mesa sem camada não é tela', async () => {
    const u = await comCamadas(2)
    await u.click(screen.getByRole('button', { name: /tirar a camada 2/i }))
    expect(screen.queryByRole('button', { name: /tirar a camada 1/i })).toBeNull()
    expect(camadas()).toHaveLength(1)
  })

  it('reabrir uma mesa salva devolve as camadas com a voz de cada uma', async () => {
    const SALVA = {
      nome: 'cama-de-vidro',
      dados: {
        camadas: [
          { ligada: true, voz: { presetId: 'eno', samplePath: 'Z:/a/vintage/taca-de-vidro.wav' } },
          { ligada: false, voz: { presetId: 'aphex', samplePath: null } },
        ],
      },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('nome=')
        ? SALVA
        : [{ nome: 'cama-de-vidro', salvo_em: '2026-09-21T19:00:00', camadas: 2 }]),
    })))

    const u = userEvent.setup()
    render(<Mesa onGravado={() => {}} />)
    expect(camadas()).toHaveLength(1)

    await u.click(screen.getByRole('button', { name: /^ABRIR$/ }))
    await u.click(await screen.findByRole('button', { name: /cama-de-vidro/ }))

    // as duas camadas voltaram, com o sample e o estado de cada uma
    const cs = camadas()
    expect(cs).toHaveLength(2)
    expect(cs[0].dataset.sample).toContain('taca-de-vidro.wav')
    expect(cs[0].dataset.ligada).toBe('true')
    expect(cs[1].dataset.sample).toBe('')
    expect(cs[1].dataset.ligada).toBe('false')
  })
})
