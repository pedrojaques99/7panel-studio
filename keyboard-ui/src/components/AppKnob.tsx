import { useState, useRef, useEffect } from 'react'
import Knob from '../lib/vintage-imports/Knob1'

const NATIVE_W = 80
const NATIVE_H = 60
const TICKS = 5

export function AppKnob({
  label = 'VOL',
  min = 0,
  max = 10,
  defaultValue = 5,
  size = 60,
  value: controlledValue,
  onChange,
  theme = 'dark',
  labelColor,
}: {
  label?: string
  min?: number
  max?: number
  defaultValue?: number
  size?: number
  value?: number
  onChange?: (v: number) => void
  theme?: 'dark' | 'light'
  labelColor?: string
}) {
  const [internal, setInternal] = useState(defaultValue)
  const value = controlledValue ?? internal
  const valueRef = useRef(value)
  valueRef.current = value
  const setValue = (v: number | ((p: number) => number)) => {
    const prev = valueRef.current
    const next = typeof v === 'function' ? v(prev) : v
    const clamped = Math.max(min, Math.min(max, next))
    valueRef.current = clamped
    setInternal(clamped)
    onChange?.(clamped)
  }
  const [dragging, setDragging] = useState(false)
  const lastY = useRef(0)
  const range = max - min
  const step = range / 100

  const sc = size / NATIVE_W
  const scaledH = Math.round(NATIVE_H * sc)
  const rotation = -135 + ((value - min) / range) * 270

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      const fine = e.shiftKey ? 0.2 : 1
      const delta = (lastY.current - e.clientY) * step * 2 * fine
      lastY.current = e.clientY
      setValue((p: number) => p + delta)
    }
    const onUp = () => setDragging(false)
    if (dragging) {
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, min, max, step])

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation()
    const fine = e.shiftKey ? 0.2 : 1
    const delta = (e.deltaY < 0 ? 1 : -1) * step * 5 * fine
    setValue((p: number) => p + delta)
  }

  const tickRadius = size / 2 + 4

  return (
    <div
      className="flex flex-col items-center gap-1 select-none cursor-grab active:cursor-grabbing"
      onMouseDown={e => { setDragging(true); lastY.current = e.clientY; e.preventDefault() }}
      onWheel={handleWheel}
    >
      <div style={{ width: size, height: scaledH, position: 'relative', overflow: 'visible', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          transform: `scale(${sc})`, transformOrigin: 'top center', width: NATIVE_W, height: NATIVE_H,
          filter: theme === 'light' ? 'brightness(1.8) saturate(0.3)' : undefined,
        }}>
          <div style={{ width: NATIVE_W, height: NATIVE_H }}>
            <Knob rotation={rotation} />
          </div>
        </div>
      </div>
      <span style={{
        fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
        color: labelColor || (theme === 'light' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)'),
        fontFamily: 'monospace', textAlign: 'center', width: '100%',
      }}>{dragging ? Math.round(value) : label}</span>
    </div>
  )
}
