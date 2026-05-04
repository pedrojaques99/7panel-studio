import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { BriefingData, TickerConfig } from '../components/BriefingPanel'
import { API } from '../lib/api'

const PHASES = ['Briefing', 'Pesquisa', 'Conceituação', 'Refinamento', 'Apresentação', 'Entrega']

const MOCK_BRIEFING: BriefingData = {
  client: '', contact: '', deadline: '', budget: '', privateNotes: '',
  projectName: 'Projeto Moda SS25', type: 'Identidade Visual',
  forDesc: 'marca de moda sustentável', keywords: 'moderno, bold, feminino',
  deliverables: 'Logo, Manual, Papelaria', phase: 'Refinamento',
  visible: true,
  showName: true, showType: true, showFor: true,
  showKeywords: true, showDeliverables: true, showPhase: true,
}

const MOCK_TICKER: TickerConfig = {
  speed: 60, logoText: 'jaques', logoUrl: '', separator: '◆',
  height: 40, bgOpacity: 72, fontSize: 14, fontWeight: 500,
  textColor: '#ffffffa6', accentColor: '#00b860', extraItems: '',
}

export function OverlayBriefing() {
  const isMock = new URLSearchParams(window.location.search).has('mock')

  const [briefing, setBriefing] = useState<BriefingData | null>(isMock ? MOCK_BRIEFING : null)
  const [tk, setTk]             = useState<TickerConfig>(MOCK_TICKER)
  const [dur, setDur]           = useState(0)
  const [trackKey, setTrackKey] = useState(0)
  const trackRef  = useRef<HTMLDivElement>(null)
  const lastBRef  = useRef('')
  const lastTRef  = useRef('')

  // Poll Flask — only update state when JSON actually changes
  useEffect(() => {
    if (isMock) return
    async function poll() {
      try {
        const [rb, rt] = await Promise.all([
          fetch(`${API}/api/overlay/briefing`).then(r => r.json()),
          fetch(`${API}/api/overlay/ticker`).then(r => r.json()),
        ])
        if (rb && Object.keys(rb).length) {
          const s = JSON.stringify(rb)
          if (s !== lastBRef.current) { lastBRef.current = s; setBriefing(p => ({ ...p, ...rb })); setTrackKey(k => k + 1) }
        }
        if (rt && Object.keys(rt).length) {
          const s = JSON.stringify(rt)
          if (s !== lastTRef.current) { lastTRef.current = s; setTk(p => ({ ...p, ...rt })); setTrackKey(k => k + 1) }
        }
      } catch{ /* noop */ }
    }
    poll()
    const t = setInterval(poll, 500)
    return () => clearInterval(t)
  }, [isMock])

  // Measure track width after every render and update duration — no stale reads
  useLayoutEffect(() => {
    if (!trackRef.current) return
    const half = trackRef.current.scrollWidth / 2
    if (half > 0) setDur(half / tk.speed)
  })

  if (!briefing?.visible) return null

  const phaseIdx = PHASES.indexOf(briefing.phase)
  const sep = (
    <span style={{ margin: '0 16px', color: tk.accentColor + '66', fontSize: 'var(--fs-base)' }}>
      {tk.separator}
    </span>
  )

  const fields: React.ReactNode[] = []
  if (briefing.showName && briefing.projectName)
    fields.push(<span key="name" style={{ fontSize: tk.fontSize, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{briefing.projectName}</span>)
  if (briefing.showType && briefing.type)
    fields.push(<span key="type" style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.accentColor, whiteSpace: 'nowrap' }}><span style={{ fontSize: tk.fontSize - 2, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.1em', marginRight: 5, textTransform: 'uppercase' }}>Tipo</span>{briefing.type}</span>)
  if (briefing.showFor && briefing.forDesc)
    fields.push(<span key="for" style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.textColor, whiteSpace: 'nowrap' }}><span style={{ fontSize: tk.fontSize - 2, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.1em', marginRight: 5, textTransform: 'uppercase' }}>Para</span>{briefing.forDesc}</span>)
  if (briefing.showKeywords && briefing.keywords)
    fields.push(<span key="kw" style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.textColor, whiteSpace: 'nowrap' }}><span style={{ fontSize: tk.fontSize - 2, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.1em', marginRight: 5, textTransform: 'uppercase' }}>Keywords</span>{briefing.keywords}</span>)
  if (briefing.showDeliverables && briefing.deliverables)
    fields.push(<span key="del" style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.textColor, whiteSpace: 'nowrap' }}><span style={{ fontSize: tk.fontSize - 2, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.1em', marginRight: 5, textTransform: 'uppercase' }}>Entregáveis</span>{briefing.deliverables}</span>)
  if (briefing.showPhase && briefing.phase)
    fields.push(<span key="phase" style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.textColor, whiteSpace: 'nowrap' }}><span style={{ fontSize: tk.fontSize - 2, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.1em', marginRight: 5, textTransform: 'uppercase' }}>Fase</span>{phaseIdx + 1}/{PHASES.length} — {briefing.phase}</span>)
  tk.extraItems.split('\n').filter(Boolean).forEach((line, i) =>
    fields.push(<span key={`extra-${i}`} style={{ fontSize: tk.fontSize, fontWeight: tk.fontWeight, color: tk.textColor, whiteSpace: 'nowrap' }}>{line}</span>)
  )

  if (!fields.length) return null

  const interspersed = fields.flatMap((f, i) =>
    i < fields.length - 1 ? [f, <React.Fragment key={`sep-${i}`}>{sep}</React.Fragment>] : [f]
  )

  const logoEl = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, margin: '0 28px', whiteSpace: 'nowrap' }}>
      {tk.logoUrl
        ? <img src={tk.logoUrl} style={{ height: tk.height * 0.5, maxHeight: 24, objectFit: 'contain' }} alt="logo" />
        : <span style={{ width: 14, height: 14, borderRadius: '50%', background: tk.accentColor, display: 'inline-block', flexShrink: 0 }} />
      }
      {tk.logoText && <span style={{ fontSize: tk.fontSize - 1, fontWeight: 800, letterSpacing: '0.18em', color: '#fff', textTransform: 'uppercase' }}>{tk.logoText}</span>}
    </span>
  )

  const segment = (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {interspersed}{sep}{logoEl}
    </span>
  )

  const bg = `rgba(14,15,17,${(tk.bgOpacity / 100).toFixed(2)})`

  return (
    <div style={{
      fontFamily: "'Outfit', sans-serif",
      width: '100%', height: tk.height,
      overflow: 'hidden', display: 'flex', alignItems: 'center',
      background: bg, backdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div
        key={trackKey}
        ref={trackRef}
        style={{
          display: 'inline-flex', alignItems: 'center',
          flexShrink: 0, minWidth: 'max-content',
          animation: dur > 0 ? `ticker ${dur}s linear infinite` : 'none',
          willChange: 'transform',
        }}
      >
        {segment}{segment}
      </div>

      <style>{`
        html, body, #root { background: transparent !important; margin: 0; padding: 0; overflow: hidden; }
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      `}</style>
    </div>
  )
}
