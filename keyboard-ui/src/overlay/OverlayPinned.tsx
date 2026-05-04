import React, { useState, useEffect } from 'react'
import type { PinnedMsg } from '../components/YouTubeChatPanel'

const MOCK: PinnedMsg = {
  user: 'viewer_mock',
  text: 'Que ferramenta é essa que você usa pra organizar a live?',
  expiresAt: Date.now() + 60_000,
}

export function OverlayPinned() {
  const isMock = new URLSearchParams(window.location.search).has('mock')
  const [pinned, setPinned] = useState<PinnedMsg>(isMock ? MOCK : null)

  useEffect(() => {
    if (isMock) return
    function read() {
      try {
        const p = localStorage.getItem('overlay:pinned')
        if (p) setPinned(JSON.parse(p))
      } catch{ /* noop */ }
    }
    read()
    window.addEventListener('storage', read)
    const t = setInterval(read, 500)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [isMock])

  if (!pinned || pinned.expiresAt <= Date.now()) return null

  return (
    <div key={pinned.expiresAt} style={{ fontFamily: "'Outfit', sans-serif", display: 'inline-block', width: 280, background: 'rgba(14,15,17,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(0,184,96,0.2)', borderRadius: 13, padding: '13px 15px', boxShadow: '0 0 0 1px rgba(0,184,96,0.06)', animation: 'slideIn 0.35s ease' }}>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.1em', color: '#00b860', marginBottom: 6 }}>💬 {pinned.user}</div>
      <div style={{ fontSize: 'var(--fs-xl)', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, fontWeight: 500 }}>{pinned.text}</div>
      <style>{`body,html,#root{background:transparent!important} @keyframes slideIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}
