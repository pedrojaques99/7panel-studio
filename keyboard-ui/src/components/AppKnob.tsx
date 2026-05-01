import { useState, useRef, useEffect } from 'react'
import Knob from '../lib/vintage-imports/Knob1'

// Knob1 native size
const NATIVE_W = 81
const NATIVE_H = 75

export function AppKnob({
  label = 'VOL',
  min = 0,
  max = 10,
  defaultValue = 5,
  size = 56,
}: {
  label?: string
  min?: number
  max?: number
  defaultValue?: number
  size?: number
}) {
  const [value, setValue] = useState(defaultValue)
  const [dragging, setDragging] = useState(false)
  const lastY = useRef(0)

  const sc = size / NATIVE_W
  const scaledH = Math.round(NATIVE_H * sc)
  const rotation = -135 + ((value - min) / (max - min)) * 270

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      const delta = (lastY.current - e.clientY) * 0.025 * (max - min)
      lastY.current = e.clientY
      setValue(p => Math.max(min, Math.min(max, p + delta)))
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
  }, [dragging, min, max])

  return (
    <div
      className="flex flex-col items-center gap-1.5 select-none cursor-grab active:cursor-grabbing"
      onMouseDown={e => { setDragging(true); lastY.current = e.clientY; e.preventDefault() }}
    >
      {/* Outer: clips layout to scaled size */}
      <div style={{ width: size, height: scaledH, position: 'relative', overflow: 'visible' }}>
        {/* Scale wrapper — origin top-left shrinks the 81×75 to `size` */}
        <div style={{ transform: `scale(${sc})`, transformOrigin: 'top left', width: NATIVE_W, height: NATIVE_H }}>
          {/* Internal components now handle rotation separately */}
          <div
            style={{
              width: NATIVE_W,
              height: NATIVE_H,
            }}
          >
            <Knob rotation={rotation} />
          </div>
        </div>
      </div>
      <span className="text-[0.52rem] text-white/35 uppercase tracking-widest">{label}</span>
    </div>
  )
}
