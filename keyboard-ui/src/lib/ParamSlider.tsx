import React from 'react'

export function ParamSlider({ label, value, min, max, step = 0.01, fmt, onChange, defaultValue, accent = 'var(--status-ok)' }: {
  label: string; value: number; min: number; max: number
  step?: number; fmt?: (v: number) => string; onChange: (v: number) => void
  defaultValue?: number; accent?: string
}) {
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY < 0 ? step : -step
    const mult = e.shiftKey ? 10 : 1
    onChange(Math.max(min, Math.min(max, value + delta * mult)))
  }
  function handleReset() {
    if (defaultValue !== undefined) onChange(defaultValue)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-20)' }}>{label}</span>
        <span
          onDoubleClick={handleReset}
          title={defaultValue !== undefined ? 'Double-click to reset' : undefined}
          style={{
            fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: accent,
            cursor: defaultValue !== undefined ? 'pointer' : 'default',
            padding: '1px 4px', borderRadius: 3,
            background: defaultValue !== undefined ? 'rgba(255,255,255,0.03)' : 'transparent',
          }}>
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onWheel={handleWheel}
        style={{ width: '100%', accentColor: accent, cursor: 'ew-resize' }} />
    </div>
  )
}
