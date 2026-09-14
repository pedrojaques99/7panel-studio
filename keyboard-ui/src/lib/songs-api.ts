/**
 * Cliente do acervo (`/api/songs/*`).
 *
 * Erro do servidor sobe como Error com a mensagem que o backend escreveu — a tela
 * mostra essa frase, não "algo deu errado". Rótulo de botão em vermelho não é causa
 * nenhuma; a causa é o que o backend falou.
 */
import { API } from './api'

export type SongSummary = {
  name: string
  /** Opinião de agora, não fato de versão: mora em `patterns/.favoritos.json`. */
  favorito: boolean
  versions: number
  bpm: number
  author: 'user' | 'claude'
  message: string
  ts: number
}

export type SongVersion = {
  i: number
  ts: number
  author: 'user' | 'claude'
  message: string
  bpm: number
  chars: number
}

export type Song = {
  name: string
  favorito: boolean
  code: string
  versions: SongVersion[]
  /** Último bpm não-zero da história. Versão sem tempo não apaga o andamento. */
  bpm: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${API}/api/songs${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new Error('backend fora do ar')
  }
  const body: unknown = await r.json().catch(() => null)
  if (!r.ok) {
    const erro = (body as { error?: string } | null)?.error
    throw new Error(erro || `erro ${r.status}`)
  }
  return body as T
}

export const songsApi = {
  list: () => req<SongSummary[]>(''),

  get: (name: string) => req<Song>(`/${encodeURIComponent(name)}`),

  save: (name: string, code: string, message = '', bpm = 0, author: 'user' | 'claude' = 'user') =>
    req<{ version: number }>(`/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify({ code, message, bpm, author }),
    }),

  version: (name: string, i: number) =>
    req<{ i: number; code: string; author: string; message: string; ts: number }>(
      `/${encodeURIComponent(name)}/v/${i}`,
    ),

  /** Restaurar SALVA versão nova; a linha do tempo nunca perde um elo. */
  restore: (name: string, i: number) =>
    req<{ version: number; code: string }>(`/${encodeURIComponent(name)}/restore/${i}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /** Move pra `.trash/`. Nada aqui apaga de verdade. */
  remove: (name: string) =>
    req<{ status: string }>(`/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  /** Sem corpo alterna; com `favorito` explícito é idempotente (a tela usa o explícito). */
  favoritar: (name: string, favorito: boolean) =>
    req<{ name: string; favorito: boolean }>(`/${encodeURIComponent(name)}/favorito`, {
      method: 'POST',
      body: JSON.stringify({ favorito }),
    }),

  rename: (name: string, novo: string) =>
    req<{ name: string }>(`/${encodeURIComponent(name)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name: novo }),
    }),
}

/** Mensagem legível de qualquer coisa que o `catch` pegar. */
export function msgErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** "há 2 min", "14:32" — o tempo do jeito que se lê numa lista, não ISO. */
export function quando(ts: number): string {
  if (!ts) return '—'
  const d = Math.max(0, Date.now() / 1000 - ts)
  if (d < 90) return 'agora'
  if (d < 3600) return `${Math.round(d / 60)} min`
  const data = new Date(ts * 1000)
  const hoje = new Date()
  const mesmoDia = data.toDateString() === hoje.toDateString()
  if (mesmoDia) return data.toTimeString().slice(0, 5)
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
