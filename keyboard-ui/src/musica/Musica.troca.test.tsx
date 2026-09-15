/**
 * Portão da troca de música: o que se LÊ e o que SOA não podem divergir.
 *
 * O defeito que este arquivo prende: abrir outra take do repertório trocava o
 * editor e deixava o alto-falante na take anterior. A tela passava a mentir
 * sobre o que estava tocando — e numa rota cuja única promessa é "confie no que
 * está escrito", essa é a mentira mais cara que existe.
 *
 * Duas regras, e a segunda é tão importante quanto a primeira:
 *   1. tocando + trocar  → para a atual e começa a selecionada, do começo;
 *   2. parado  + trocar  → continua parado. Selecionar não LIGA som do nada,
 *      senão passear pelo repertório vira 21 partidas de áudio seguidas.
 *
 * O motor de som não participa (jsdom não tem WebAudio): entra dublê com espião,
 * igual ao teste de layout estreito. O que se verifica é a ORDEM das chamadas —
 * `stop()` antes de `evaluate()` — porque parar zera o relógio, e é isso que faz
 * a take nova começar na casa 1 em vez de cair no meio do arranjo da anterior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const chamadas: string[] = []
let ouvinte: ((e: { playing: boolean; error: string | null; code: string }) => void) | null = null
let tocando = false

const emitir = () => ouvinte?.({ playing: tocando, error: null, code: '' })

vi.mock('../lib/strudel-service', () => ({
  StrudelService: {
    get: () => ({
      subscribe: (fn: any) => { ouvinte = fn; emitir(); return () => { ouvinte = null } },
      setBPM: () => {},
      setTom: async () => {},
      evaluate: async (c: string) => { chamadas.push(`evaluate:${c}`); tocando = true; emitir() },
      stop: () => { chamadas.push('stop'); tocando = false; emitir() },
      attachHighlight: () => () => {},
    }),
  },
}))

vi.mock('../components/StrudelEditor', () => ({
  StrudelEditor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}))

const TAKES: Record<string, { name: string; code: string; bpm: number; versions: never[] }> = {
  'take-a': { name: 'take-a', code: 'SOM_A', bpm: 100, versions: [] },
  'take-b': { name: 'take-b', code: 'SOM_B', bpm: 112, versions: [] },
}

// Mock PARCIAL: `quando`, `msgErro` e companhia são formatação pura e não têm
// rede — dublar eles seria reescrever o módulo pra nada, e foi assim que este
// teste quebrou na primeira tentativa. Só o `songsApi` (que fala HTTP) entra.
vi.mock('../lib/songs-api', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/songs-api')>()),
  songsApi: {
    list: async () => Object.values(TAKES).map(t => ({
      name: t.name, bpm: t.bpm, versions: 1, favorito: false,
      author: 'user' as const, message: '', ts: 1789000000,
    })),
    get: async (n: string) => TAKES[n],
    save: async () => {},
  },
}))

vi.mock('../hooks/useJamBridge', () => ({
  useJamBridge: () => ({ proposal: null, status: null, dispensar: () => {} }),
}))

import { Musica } from './Musica'

async function abrir(nome: string) {
  const alvo = await screen.findByText(nome)
  await userEvent.click(alvo)
  await waitFor(() => expect(document.title).toBe(`música: ${nome}`))
}

describe('trocar de música', () => {
  beforeEach(() => {
    // Tela larga: este teste é de comportamento, não de layout. Sem o dublê o
    // `useEstreito` estoura, porque jsdom não traz `matchMedia`.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false, onchange: null,
    }))
    chamadas.length = 0
    tocando = false
    localStorage.clear()
  })

  it('tocando: para a atual e começa a selecionada', async () => {
    render(<Musica />)
    await abrir('take-a')

    await userEvent.click(await screen.findByTitle(/tocar/i))
    await waitFor(() => expect(chamadas).toContain('evaluate:SOM_A'))
    chamadas.length = 0

    await abrir('take-b')

    // stop ANTES do evaluate: parar zera o relógio, então a take nova entra na
    // casa 1. Trocar a quente deixaria a peça começar no meio do arranjo.
    await waitFor(() => expect(chamadas).toEqual(['stop', 'evaluate:SOM_B']))
  })

  it('parado: trocar não liga o som', async () => {
    render(<Musica />)
    await abrir('take-a')
    chamadas.length = 0

    await abrir('take-b')

    expect(chamadas).toEqual([])
  })
})
