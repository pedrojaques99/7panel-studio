import React, { useState, useRef, useEffect } from 'react'

const smBtn: React.CSSProperties = {
  height: 22, padding: '0 6px', border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-40)',
  fontSize: 'var(--fs-2xs)', fontWeight: 800, flexShrink: 0, transition: 'all 0.1s',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export function BpmControl({ bpm, onChange, min = 40, max = 300, accent = 'var(--status-ok)', showSlider = false }: {
  bpm: number; onChange: (v: number) => void
  min?: number; max?: number; accent?: string; showSlider?: boolean
}) {
  const [localVal, setLocalVal] = useState(String(Math.round(bpm)))
  const [focused, setFocused] = useState(false)
  const tapTimes = useRef<number[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const bpmRef = useRef(bpm)
  bpmRef.current = bpm

  // Sync display when external bpm changes and we're not editing
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused) setLocalVal(String(Math.round(bpm)))
  }, [bpm, focused])

  // Native wheel listener with passive:false so preventDefault works
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      e.stopPropagation()
      const step = e.shiftKey ? 5 : 1
      const next = Math.max(min, Math.min(max, bpmRef.current + (e.deltaY < 0 ? step : -step)))
      onChange(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [min, max, onChange])

  function commit(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= min && v <= max) onChange(v)
    else setLocalVal(String(Math.round(bpmRef.current)))
    setFocused(false)
  }

  function tapTempo() {
    const now = Date.now()
    tapTimes.current = [...tapTimes.current.filter(t => now - t < 3000), now]
    if (tapTimes.current.length >= 2) {
      const intervals = tapTimes.current.slice(1).map((t, i) => t - tapTimes.current[i])
      const avg = intervals.reduce((a, b) => a + b) / intervals.length
      onChange(Math.max(min, Math.min(max, Math.round(60000 / avg))))
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <input
        ref={inputRef}
        type="text"
        value={localVal}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onChange={e => setLocalVal(e.target.value)}
        onFocus={e => { setFocused(true); e.target.select() }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur(); return }
          if (e.key === 'Escape') {
            setLocalVal(String(Math.round(bpmRef.current)))
            setFocused(false)
            e.currentTarget.blur()
            return
          }
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(max, bpm + (e.shiftKey ? 5 : 1))) }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(min, bpm - (e.shiftKey ? 5 : 1))) }
        }}
        title="Click to edit · Scroll ±1 · Shift+scroll ±5 · ↑↓ arrows"
        style={{
          width: 36, padding: '2px 4px', borderRadius: 5,
          border: focused ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
          background: focused ? 'var(--bg-input)' : 'rgba(255,255,255,0.05)',
          color: 'var(--text-40)', fontFamily: 'monospace', fontWeight: 700,
          fontSize: 'var(--fs-xs)', textAlign: 'center',
          cursor: focused ? 'text' : 'ew-resize', outline: 'none',
          transition: 'border-color 0.1s, background 0.1s',
        }}
      />
      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-20)', fontFamily: 'monospace' }}>bpm</span>
      {showSlider && (
        <input type="range" min={min} max={max} step={1} value={Math.round(bpm)}
          onChange={e => onChange(Number(e.target.value))}
          onMouseDown={e => e.stopPropagation()}
          style={{ flex: 1, accentColor: accent, cursor: 'pointer', minWidth: 60 }} />
      )}
      <button
        onClick={e => { e.stopPropagation(); tapTempo() }}
        onMouseDown={e => e.stopPropagation()}
        title="Tap tempo"
        style={smBtn}>tap</button>
    </div>
  )
}
