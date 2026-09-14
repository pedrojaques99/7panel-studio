import { useState, useEffect } from 'react'

type PollOption = { label: string; votes: number }
type PollData = { title: string; options: PollOption[]; visible: boolean }

const MOCK: PollData = {
  title: 'Qual estilo pra próxima arte?',
  options: [{ label: 'Minimalista', votes: 42 }, { label: 'Retro', votes: 27 }, { label: 'Brutalist', votes: 18 }],
  visible: true,
}

const BAR_COLORS = ['#00b860', '#6366f1', '#f59e0b', '#ec4899']

export function OverlayPoll() {
  const isMock = new URLSearchParams(window.location.search).has('mock')
  const [poll, setPoll] = useState<PollData | null>(isMock ? MOCK : null)

  useEffect(() => {
    if (isMock) return
    function read() {
      try {
        const raw = localStorage.getItem('overlay:poll')
        setPoll(raw ? JSON.parse(raw) : null)
      } catch { /* noop */ }
    }
    read()
    window.addEventListener('storage', read)
    const t = setInterval(read, 500)
    return () => { window.removeEventListener('storage', read); clearInterval(t) }
  }, [isMock])

  if (!poll || !poll.visible || !poll.options?.length) return null

  const total = poll.options.reduce((s, o) => s + Math.max(0, o.votes || 0), 0) || 1

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", display: 'inline-block', width: 360, background: 'rgba(14,15,17,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '16px 18px', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)', animation: 'slideIn 0.35s ease' }}>
      {poll.title && <div style={{ fontSize: 'var(--fs-xl, 18px)', fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 12 }}>{poll.title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {poll.options.map((o, i) => {
          const pct = Math.round((Math.max(0, o.votes || 0) / total) * 100)
          const color = BAR_COLORS[i % BAR_COLORS.length]
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-md, 12px)', color: 'rgba(255,255,255,0.75)', marginBottom: 3, fontWeight: 500 }}>
                <span>{o.label}</span><span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 5, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
      <style>{`body,html,#root{background:transparent!important} @keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
