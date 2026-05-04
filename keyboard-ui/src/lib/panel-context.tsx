/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'

const MIN_CANVAS_WIDTH = 1280
const CANVAS_PADDING = 40
const BASE_SCALE = 1.0
const SCALE_STEP = 0.05
const SCALE_MIN = 0.05

/** Scan saved panel geometries — design width must fit the rightmost panel
 *  edge so zooming never clips a panel out of the canvas. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _computeDesignWidth(): number {
  let maxRight = MIN_CANVAS_WIDTH
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith('panel-geo-')) continue
    try {
      const g = JSON.parse(localStorage.getItem(k) || '{}')
      const w = typeof g.w === 'number' && g.w > 0 ? g.w : 320
      const right = (typeof g.x === 'number' ? g.x : 0) + w
      if (right > maxRight) maxRight = right
    } catch { /* ignore malformed entry */ }
  }
  return maxRight + CANVAS_PADDING
}

interface PanelCtx {
  scale: number
  setScale: (s: number) => void
  scaleUp: () => void
  scaleDown: () => void
  zOf: (id: string, base?: number) => number
  bringToFront: (id: string) => void
  endDrag: (id: string) => void
  isDragging: (id: string) => boolean
}

const Ctx = createContext<PanelCtx>({
  scale: BASE_SCALE,
  setScale: () => {},
  scaleUp: () => {},
  scaleDown: () => {},
  zOf: (_id, base = 10) => base,
  bringToFront: () => {},
  endDrag: () => {},
  isDragging: () => false,
})

export function PanelProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState(() => {
    const s = localStorage.getItem('ui-scale')
    return s ? Math.max(SCALE_MIN, parseFloat(s)) : BASE_SCALE
  })
  const zRef = useRef(20)
  const [zMap, setZMap] = useState<Record<string, number>>({})
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null)
  const persistDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setScale(s: number) {
    const next = Math.max(SCALE_MIN, parseFloat(s.toFixed(2)))
    setScaleState(next)
    if (persistDebounce.current) clearTimeout(persistDebounce.current)
    persistDebounce.current = setTimeout(() => {
      localStorage.setItem('ui-scale', String(next))
    }, 250)
  }

  function scaleUp() { setScale(scale + SCALE_STEP) }
  function scaleDown() { setScale(scale - SCALE_STEP) }

  function bringToFront(id: string) {
    zRef.current += 1
    setZMap(m => ({ ...m, [id]: zRef.current }))
    setDraggingPanel(id)
  }

  function endDrag(id: string) {
    setDraggingPanel(p => (p === id ? null : p))
  }

  const value: PanelCtx = {
    scale,
    setScale,
    scaleUp,
    scaleDown,
    zOf: (id, base = 10) => zMap[id] ?? base,
    bringToFront,
    endDrag,
    isDragging: (id) => draggingPanel === id,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePanelCtx() {
  return useContext(Ctx)
}
