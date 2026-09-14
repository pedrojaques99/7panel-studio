import { useState, useEffect } from 'react'

type QuestionData = { text: string; label: string; visible: boolean }

const MOCK: QuestionData = { text: 'Qual próximo projeto vocês querem ver ao vivo?', label: 'Pergunta', visible: true }

export function OverlayQuestion() {
  const isMock = new URLSearchParams(window.location.search).has('mock')
  const [q, setQ] = useState<QuestionData | null>(isMock ? MOCK : null)

  useEffect(() => {
    if (isMock) return
    function read() {
      try {
        const raw = localStorage.getItem('overlay:question')
        setQ(raw ? JSON.parse(raw) : null)
      } catch { /* noop */ }
    }
    read()
    window.addEventListener('storage', read)
    const t = setInterval(read, 500)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [isMock])

  if (!q || !q.visible || !q.text) return null

  return (
    <div key={q.text} style={{ fontFamily: "'Outfit', sans-serif", display: 'inline-block', maxWidth: 640, background: 'rgba(14,15,17,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(0,184,96,0.22)', borderRadius: 16, padding: '18px 22px', boxShadow: '0 0 0 1px rgba(0,184,96,0.06)', animation: 'slideIn 0.35s ease' }}>
      <div style={{ fontSize: 'var(--fs-md, 12px)', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#00b860', marginBottom: 8 }}>❓ {q.label || 'Pergunta'}</div>
      <div style={{ fontSize: 'var(--fs-3xl, 26px)', color: 'rgba(255,255,255,0.92)', lineHeight: 1.4, fontWeight: 600 }}>{q.text}</div>
      <style>{`body,html,#root{background:transparent!important} @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
