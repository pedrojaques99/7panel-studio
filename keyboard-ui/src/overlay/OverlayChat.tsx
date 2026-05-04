import React, { useState, useEffect, useRef } from 'react'
import { API } from '../lib/api'
const MAX = 5

type ChatMsg = { id: string; user: string; text: string; ts: number }

const MOCK_MSGS: ChatMsg[] = [
  { id: '1', user: 'ana_design', text: 'adorei esse layout 🔥', ts: 0 },
  { id: '2', user: 'pedro_dev', text: 'que stack você usa?', ts: 0 },
  { id: '3', user: 'carol_ux', text: 'o timer no canto ficou incrível', ts: 0 },
  { id: '4', user: 'rafa_motion', text: 'pode fazer um tutorial disso?', ts: 0 },
  { id: '5', user: 'viewer_mock', text: '👏👏👏', ts: 0 },
]

export function OverlayChat() {
  const isMock = new URLSearchParams(window.location.search).has('mock')
  const [messages, setMessages] = useState<ChatMsg[]>(isMock ? MOCK_MSGS : [])
  const lastId = useRef('')

  useEffect(() => {
    if (isMock) return
    async function fetch_() {
      try {
        const r = await fetch(`${API}/api/yt/chat-msgs`)
        const data: ChatMsg[] = await r.json()
        if (data.length && data[data.length - 1]?.id !== lastId.current) {
          lastId.current = data[data.length - 1]?.id
          setMessages(data)
        }
      } catch{ /* noop */ }
    }
    fetch_()
    const t = setInterval(fetch_, 3000)
    return () => clearInterval(t)
  }, [isMock])

  if (!messages.length) return null

  const visible = messages.slice(-MAX)

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", display: 'flex', flexDirection: 'column', gap: 5, width: 280 }}>
      {visible.map((msg, i, arr) => (
        <div key={msg.id} style={{
          opacity: 0.25 + (i / arr.length) * 0.75,
          background: 'rgba(14,15,17,0.55)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: 9, padding: '6px 11px',
          animation: i === arr.length - 1 ? 'slideIn 0.25s ease' : 'none',
        }}>
          <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: '#00b860', marginRight: 5 }}>{msg.user}</span>
          <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.35 }}>{msg.text}</span>
        </div>
      ))}
      <style>{`body,html,#root{background:transparent!important} @keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}
