import React, { useState, useRef, useEffect, useCallback } from 'react'
import Knob from './vintage-imports/Knob1'

const KNOB_NATIVE = { w: 81, h: 75 }

export function SynthKnob({
  label, value, min, max, size = 64, fmt, accent = '#00b860', log, genActive: genOn, onRightClick, onChange,
}: {
  label: string; value: number; min: number; max: number; size?: number
  fmt?: (v: number) => string; accent?: string; log?: boolean
  genActive?: boolean; onRightClick?: () => void; onChange: (v: number) => void
}) {
  const [drag, setDrag] = useState(false)
  const [hover, setHover] = useState(false)
  const lastY = useRef(0)
  const sc = size / KNOB_NATIVE.w
  const scaledH = Math.round(KNOB_NATIVE.h * sc)

  const valueRef = useRef(value); valueRef.current = value
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const minRef = useRef(min); minRef.current = min
  const maxRef = useRef(max); maxRef.current = max
  const logRef = useRef(log); logRef.current = log

  const toNorm = useCallback((v: number) => {
    const mn = minRef.current, mx = maxRef.current
    return logRef.current
      ? (Math.log(v / mn)) / (Math.log(mx / mn))
      : (v - mn) / (mx - mn)
  }, [])

  const fromNorm = useCallback((n: number) => {
    const mn = minRef.current, mx = maxRef.current
    return logRef.current
      ? mn * Math.pow(mx / mn, n)
      : mn + n * (mx - mn)
  }, [])

  const clamp = useCallback((v: number) =>
    Math.max(minRef.current, Math.min(maxRef.current, v)), [])

  const rotation = -135 + toNorm(value) * 270

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dy = lastY.current - e.clientY
      lastY.current = e.clientY
      const sensitivity = e.shiftKey ? 0.004 : 0.022
      const norm = toNorm(valueRef.current) + dy * sensitivity
      onChangeRef.current(clamp(fromNorm(Math.max(0, Math.min(1, norm)))))
    }
    const onUp = () => setDrag(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [drag])

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault(); e.stopPropagation()
    const sensitivity = e.shiftKey ? 0.002 : 0.012
    const norm = toNorm(value) + (e.deltaY < 0 ? 1 : -1) * sensitivity
    onChange(clamp(fromNorm(Math.max(0, Math.min(1, norm)))))
  }

  const onDoubleClick = () => onChange(fromNorm(0.5))

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onRightClick) { onRightClick(); return }
  }

  return (
    <div
      className="select-none"
      onMouseDown={e => { if (e.button === 0) { setDrag(true); lastY.current = e.clientY; e.preventDefault() } }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onWheel={onWheel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${label}: ${fmt ? fmt(value) : value.toFixed(2)}\ndrag ↕ · shift fine · ctrl+scroll · dbl-click reset\nright-click: ${genOn ? 'disable' : 'enable'} generative drift`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: drag ? 'grabbing' : 'grab',
        opacity: hover || drag ? 1 : 0.85,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{
        width: size, height: scaledH, position: 'relative',
        filter: hover ? `drop-shadow(0 0 6px ${accent}44)` : 'none',
        transition: 'filter 0.15s',
      }}>
        <div style={{ transform: `scale(${sc})`, transformOrigin: 'top left', width: KNOB_NATIVE.w, height: KNOB_NATIVE.h }}>
          <Knob rotation={rotation} />
        </div>
      </div>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: genOn ? 'rgba(80,232,104,0.8)' : hover ? 'var(--text-60)' : 'var(--text-40)', textTransform: 'uppercase', transition: 'color 0.15s' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: accent, marginTop: -2 }}>
        {fmt ? fmt(value) : value.toFixed(2)}
      </span>
      {genOn !== undefined && (
        <div style={{
          width: 5, height: 5, borderRadius: '50%', marginTop: -1,
          background: genOn ? '#50e868' : 'rgba(255,255,255,0.15)',
          boxShadow: genOn ? '0 0 6px rgba(80,232,104,0.7)' : 'none',
          transition: 'all 0.2s',
        }} />
      )}
    </div>
  )
}
