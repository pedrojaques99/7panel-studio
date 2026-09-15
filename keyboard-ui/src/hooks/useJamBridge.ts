import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../lib/api'

export type JamProposal = {
  rev: number
  code: string
  message: string
  author: string
  ts: number
  /** bpm sugerido pela proposta (0 = mantem o do painel). */
  bpm: number
}

type JamServerState = Omit<JamProposal, 'bpm'> & {
  bpm: number
  prop_bpm: number
  playing: boolean
  error: string | null
  accepted_rev: number
}

const POLL_MS = 1000
// Aba em background continua pollando, so mais devagar: o painel do estudio passa a
// maior parte do tempo atras do OBS, e proposta que so chega quando a aba esta na
// frente e proposta que nao chega. Payload e de poucas centenas de bytes.
const POLL_MS_HIDDEN = 4000
const PUSH_DEBOUNCE_MS = 800
const LS_SEEN = 'abrain-jam-seen-rev'

async function jam<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${API}/api/jam${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/**
 * Cano entre o CLI (Claude) e o painel. Modelo: revisão numerada + poll.
 *
 * Regra dura: código vindo de fora NÃO entra no editor. Vira `proposal`, e quem
 * decide é o painel. Poll de 1s toca só em estado React — nunca no audio thread.
 */
export function useJamBridge(opts: {
  code: string
  bpm: number
  playing: boolean
  error: string | null
  enabled?: boolean
}) {
  const { code, bpm, playing, error, enabled = true } = opts

  const [proposal, setProposal] = useState<JamProposal | null>(null)
  const [online, setOnline] = useState(false)
  const [rev, setRev] = useState(0)

  const seenRef = useRef<number>(Number(localStorage.getItem(LS_SEEN) || 0))
  const serverCodeRef = useRef<string>('')
  const codeRef = useRef(code)
  useEffect(() => { codeRef.current = code })

  // Duas travas contra empurrar codigo que ninguem editou:
  //  * mountCode: valor que veio do localStorage no mount. Igual a ele nao e edicao.
  //    Sem isso o StrictMode (effect roda duas vezes) empurrava o codigo local no
  //    mount e ATROPELAVA proposta pendente do CLI. Aconteceu de verdade, rev 1 -> 2.
  //  * hydrated: so empurra depois do primeiro poll, senao um F5 sobrescreve o
  //    servidor antes de saber o que tem la.
  const mountCode = useRef(code)
  const hydrated = useRef(false)

  // ── Poll ──
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: number | undefined

    const tick = async () => {
      if (!alive) return
      const s = await jam<JamServerState>('/state')
      if (!alive) return
      setOnline(!!s)
      if (s) {
        hydrated.current = true
        setRev(s.rev)
        serverCodeRef.current = s.code || ''
        const isNew = s.rev > seenRef.current
        if (isNew && s.author === 'claude' && (s.code || '').trim() && s.code !== codeRef.current) {
          setProposal({ rev: s.rev, code: s.code, message: s.message, author: s.author, ts: s.ts, bpm: s.prop_bpm || 0 })
        } else if (isNew) {
          // rev nossa voltando pelo poll: já é o que está no editor
          seenRef.current = s.rev
          localStorage.setItem(LS_SEEN, String(s.rev))
        }
      }
      timer = window.setTimeout(tick, document.hidden ? POLL_MS_HIDDEN : POLL_MS)
    }
    tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [enabled])

  // ── Push das MINHAS edições (debounce) ──
  useEffect(() => {
    if (!enabled) return
    if (!hydrated.current) return                // ainda nao sei o que tem no servidor
    if (!code.trim()) return
    if (code === mountCode.current) return       // codigo do localStorage, nao e edicao
    if (code === serverCodeRef.current) return   // eco: não empurrar de volta
    const t = window.setTimeout(async () => {
      const r = await jam<{ rev: number }>('/push', { code, author: 'user', message: 'edit no painel', bpm })
      if (r?.rev) {
        serverCodeRef.current = code
        seenRef.current = r.rev
        localStorage.setItem(LS_SEEN, String(r.rev))
        setRev(r.rev)
      }
    }, PUSH_DEBOUNCE_MS)
    return () => clearTimeout(t)
    // `bpm` de propósito fora das deps: mudar o andamento não é editar a música, e
    // empurrar rev nova a cada clique no bpm encheria o histórico de ruído.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, enabled])

  // ── Feedback: erro de eval é o que me deixa consertar sintaxe sozinho ──
  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => {
      jam('/feedback', { error, playing, bpm })
    }, 400)
    return () => clearTimeout(t)
  }, [error, playing, bpm, enabled])

  const markSeen = useCallback((r: number) => {
    seenRef.current = Math.max(seenRef.current, r)
    localStorage.setItem(LS_SEEN, String(seenRef.current))
    setProposal(null)
  }, [])

  /** Aceita: marca vista e reporta ao backend qual rev está de fato no painel. */
  const accept = useCallback((p: JamProposal) => {
    serverCodeRef.current = p.code
    markSeen(p.rev)
    jam('/feedback', { accepted_rev: p.rev })
  }, [markSeen])

  const dismiss = useCallback((p: JamProposal) => {
    markSeen(p.rev)
    jam('/feedback', { error: 'proposta descartada no painel' })
  }, [markSeen])

  return { proposal, online, rev, accept, dismiss }
}
