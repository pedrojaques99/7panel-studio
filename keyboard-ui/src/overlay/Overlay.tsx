import React, { useState, useEffect, useRef } from 'react'
import type { BriefingData } from '../components/BriefingPanel'
import type { PinnedMsg } from '../components/YouTubeChatPanel'

import { API } from '../lib/api'

const PHASES = ['Briefing', 'Pesquisa', 'Conceituação', 'Refinamento', 'Apresentação', 'Entrega']
const MAX_CHAT = 5

type ChatMsg = { id: string; user: string; text: string; ts: number }

function useTimer() {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('overlay:timer-start')
    if (stored) startRef.current = Number(stored)
    else { startRef.current = Date.now(); localStorage.setItem('overlay:timer-start', String(startRef.current)) }

    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current!) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function Overlay() {
  const [briefing, setBriefing]   = useState<BriefingData | null>(null)
  const [pinned, setPinned]       = useState<PinnedMsg>(null)
  const [messages, setMessages]   = useState<ChatMsg[]>([])
  const lastMsgId = useRef<string>('')
  const timer = useTimer()

  // localStorage (briefing + pinned — escritos pela UI principal)
  useEffect(() => {
    function read() {
      try {
        const b = localStorage.getItem('overlay:briefing')
        if (b) setBriefing(JSON.parse(b))
        const p = localStorage.getItem('overlay:pinned')
        if (p) setPinned(JSON.parse(p))
      } catch{ /* noop */ }
    }
    read()
    window.addEventListener('storage', read)
    const t = setInterval(read, 500)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [])

  // Flask (chat msgs — escritas pelo bot)
  useEffect(() => {
    async function fetchMsgs() {
      try {
        const r = await fetch(`${API}/api/yt/chat-msgs`)
        const data: ChatMsg[] = await r.json()
        if (data.length && data[data.length - 1]?.id !== lastMsgId.current) {
          lastMsgId.current = data[data.length - 1]?.id
          setMessages(data)
        }
      } catch{ /* noop */ }
    }
    fetchMsgs()
    const t = setInterval(fetchMsgs, 3000)
    return () => clearInterval(t)
  }, [])

  const showBriefing = briefing?.visible
  const phaseIdx     = briefing ? PHASES.indexOf(briefing.phase) : -1
  const isPinned     = !!(pinned && pinned.expiresAt > Date.now())

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', fontFamily: "'Outfit', sans-serif", overflow: 'hidden' }}>

      {/* Timer — top right */}
      <div style={{
        position: 'absolute', top: 32, right: 48,
        background: 'rgba(14,15,17,0.6)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '6px 14px',
      }}>
        <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
          {timer}
        </span>
      </div>

      {/* Briefing — bottom left */}
      {showBriefing && briefing && (
        <div style={{
          position: 'absolute', bottom: 48, left: 48, width: 280,
          background: 'rgba(14,15,17,0.72)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14, padding: '14px 16px',
          animation: 'fadeIn 0.4s ease',
        }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', marginBottom: 8 }}>Em andamento</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
            {PHASES.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 2, borderRadius: 4, background: i <= phaseIdx ? '#00b860' : 'rgba(255,255,255,0.07)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {briefing.showName && briefing.projectName && (
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: '#fff' }}>{briefing.projectName}</div>
            )}
            {briefing.showType && briefing.type && (
              <div style={{ fontSize: 'var(--fs-base)', color: '#00b860', fontWeight: 600 }}>{briefing.type}</div>
            )}
            {briefing.showFor && briefing.forDesc && (
              <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.4)' }}>Para: {briefing.forDesc}</div>
            )}
            {briefing.showKeywords && briefing.keywords && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                {briefing.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                  <span key={k} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 6px', fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.35)' }}>{k}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat feed — bottom right, sobe quando pinned ativo */}
      {messages.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: isPinned ? 168 : 48,
          right: 48, width: 280,
          display: 'flex', flexDirection: 'column', gap: 5,
          transition: 'bottom 0.35s ease',
        }}>
          {messages.slice(-MAX_CHAT).map((msg, i, arr) => (
            <div key={msg.id} style={{
              opacity: 0.25 + (i / arr.length) * 0.75,
              background: 'rgba(14,15,17,0.55)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 9, padding: '6px 11px',
              animation: i === arr.length - 1 ? 'slideRight 0.25s ease' : 'none',
            }}>
              <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: '#00b860', marginRight: 5 }}>{msg.user}</span>
              <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.35 }}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pinned — bottom right, destaque */}
      {isPinned && pinned && (
        <div key={pinned.expiresAt} style={{
          position: 'absolute', bottom: 48, right: 48, width: 280,
          background: 'rgba(14,15,17,0.85)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0,184,96,0.2)',
          borderRadius: 13, padding: '13px 15px',
          boxShadow: '0 0 0 1px rgba(0,184,96,0.06)',
          animation: 'slideRight 0.35s ease',
        }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.1em', color: '#00b860', marginBottom: 6 }}>💬 {pinned.user}</div>
          <div style={{ fontSize: 'var(--fs-xl)', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, fontWeight: 500 }}>{pinned.text}</div>
        </div>
      )}

      <style>{`
@keyframes fadeIn    { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideRight { from { opacity:0; transform:translateX(8px) } to { opacity:1; transform:translateX(0) } }
      `}</style>
    </div>
  )
}
