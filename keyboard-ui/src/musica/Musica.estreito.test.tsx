/**
 * O layout estreito, testado aqui porque o navegador desta ferramenta NÃO mede.
 *
 * `resize_window` redimensiona a janela, mas a aba roda destacada (`outerWidth`
 * volta 0) e o viewport continua em 1920 — o mesmo artefato registrado na
 * auditoria da /fabrica. Medir largura à mão na tela, ali, prova nada.
 *
 * Então a regra que importa vira teste: abaixo de 860px as três colunas NÃO são
 * espremidas, elas se revezam. Uma tira de abas de 3 opções que só cabe no desktop
 * não deixa as últimas apertadas, deixa inalcançáveis.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// O REPL do Strudel puxa WebAudio e um pacote que nem importa em jsdom. Este teste
// é de LAYOUT: o motor de som não participa, então entra dublê.
vi.mock('../lib/strudel-service', () => ({
  StrudelService: {
    get: () => ({
      subscribe: () => () => {},
      setBPM: () => {},
      setTom: async () => {},
      evaluate: async () => {},
      stop: () => {},
      attachHighlight: () => () => {},
    }),
  },
}))
vi.mock('../components/StrudelEditor', () => ({
  StrudelEditor: ({ value }: { value: string }) => <textarea readOnly value={value} />,
}))

import { Musica } from './Musica'

const ACERVO = [
  { name: 'take-01', versions: 3, bpm: 122, author: 'user', message: 'primeiro', ts: 1788459223 },
]
const MUSICA = {
  name: 'take-01',
  code: 's("bd sd")\n',
  bpm: 122,
  versions: [
    { i: 0, ts: 1788459200, author: 'claude', message: 'nasceu', bpm: 122, chars: 12 },
    { i: 1, ts: 1788459223, author: 'user', message: 'tirei o low', bpm: 122, chars: 14 },
  ],
}

function largura(px: number) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: px <= 860,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }))
}

beforeEach(() => {
  localStorage.setItem('musica-aberta', 'take-01')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    const body = u.endsWith('/api/songs') ? ACERVO
      : u.includes('/api/songs/take-01') ? MUSICA
      : u.includes('/api/jam/') ? { rev: 0, code: '', author: 'user', message: '', bpm: 120, prop_bpm: 0, playing: false, error: null, accepted_rev: 0, ts: 0 }
      : {}
    return { ok: true, json: async () => body } as unknown as Response
  }))
})

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('/musica no estreito', () => {
  it('a 390px mostra uma coluna por vez, com as três alcançáveis', async () => {
    largura(390)
    render(<Musica />)

    const abas = await screen.findAllByRole('button', { name: /repertorio|editor|versoes/i })
    expect(abas.map(b => b.textContent)).toEqual(['repertorio', 'editor', 'versoes'])

    // começa no editor: é o que a pessoa veio fazer
    await waitFor(() => expect(screen.queryByPlaceholderText('buscar')).toBeNull())

    await userEvent.click(abas[0])
    expect(screen.getByPlaceholderText('buscar')).toBeTruthy()
    expect(screen.queryByText('versões')).toBeNull()

    await userEvent.click(abas[2])
    expect(screen.getByText('versões')).toBeTruthy()
    expect(screen.queryByPlaceholderText('buscar')).toBeNull()
  })

  it('no desktop as três colunas convivem, sem tira de abas', async () => {
    largura(1440)
    render(<Musica />)

    await waitFor(() => expect(screen.getByPlaceholderText('buscar')).toBeTruthy())
    expect(await screen.findByText('versões')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^repertorio$/i })).toBeNull()
  })
})
