import React, { useState, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

type Mode = 'stopwatch' | 'countdown'

export type TimerConfig = {
  mode: Mode
  countdownSecs: number  // duração do countdown
  color: string
  showSeconds: boolean
}

const defaultConfig: TimerConfig = {
  mode: 'stopwatch', countdownSecs: 3600,
  color: 'rgba(255,255,255,0.5)', showSeconds: true,
}

function loadConfig(): TimerConfig {
  try { const r = localStorage.getItem('overlay:timer-config'); if (r) return { ...defaultConfig, ...JSON.parse(r) } } catch{ /* noop */ }
  return defaultConfig
}

function saveConfig(c: TimerConfig) {
  localStorage.setItem('overlay:timer-config', JSON.stringify(c))
}

function pushTimerState(start: number | null, stopped: number | null, config: TimerConfig) {
  fetch(`${API}/api/overlay/timer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, stopped, config }),
  }).catch(() => {})
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-pure)', fontSize: 'var(--fs-lg)', padding: '7px 10px', outline: 'none', width: '100%',
}
const labelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-base)', fontWeight: 600, letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4,
}

export function TimerPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('timer', { x: 860, y: 460, w: 260, h: 360 })
  const [cfg, setCfg] = useState<TimerConfig>(loadConfig)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)

  function update(patch: Partial<TimerConfig>) {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveConfig(next)
    const start = startRef.current || null
    const stoppedRaw = localStorage.getItem('overlay:timer-stopped')
    pushTimerState(start, stoppedRaw ? Number(stoppedRaw) : null, next)
  }

  useEffect(() => {
    const stored = localStorage.getItem('overlay:timer-start')
    const stopped = localStorage.getItem('overlay:timer-stopped')
    if (stored && !stopped) {
      startRef.current = Number(stored)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRunning(true)
    } else if (stopped) {
      setElapsed(Number(stopped))
    }
  }, [])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const e = Math.floor((Date.now() - startRef.current) / 1000)
        setElapsed(e)
        if (cfg.mode === 'countdown' && e >= cfg.countdownSecs) {
          stop()
        }
      }, 500)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, cfg.mode, cfg.countdownSecs])

  function start() {
    const now = Date.now()
    startRef.current = now
    localStorage.setItem('overlay:timer-start', String(now))
    localStorage.removeItem('overlay:timer-stopped')
    setElapsed(0)
    setRunning(true)
    pushTimerState(now, null, cfg)
  }

  function stop() {
    setRunning(false)
    localStorage.setItem('overlay:timer-stopped', String(elapsed))
    pushTimerState(startRef.current || null, elapsed, cfg)
  }

  function reset() {
    setRunning(false)
    setElapsed(0)
    startRef.current = 0
    localStorage.removeItem('overlay:timer-start')
    localStorage.removeItem('overlay:timer-stopped')
    pushTimerState(null, null, cfg)
  }

  function formatTime(secs: number) {
    const display = cfg.mode === 'countdown' ? Math.max(0, cfg.countdownSecs - secs) : secs
    const h = Math.floor(display / 3600)
    const m = Math.floor((display % 3600) / 60)
    const s = display % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}${cfg.showSeconds ? ':' + String(s).padStart(2,'0') : ''}`
    return `${String(m).padStart(2,'0')}${cfg.showSeconds ? ':' + String(s).padStart(2,'0') : ''}`
  }

  const cdMins = Math.floor(cfg.countdownSecs / 60)
  const cdSecs = cfg.countdownSecs % 60

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: 'auto' }}
      minWidth={220} bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('timer') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('timer')}
      onDragStop={(_, d) => { saveGeo('timer', { x: d.x, y: d.y }); endDrag('timer') }}
      style={{ zIndex: zOf('timer', 100) }}
      enableResizing={false}
    >
      <div style={{ background: 'var(--bg-chassis)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-chassis)', overflow: 'hidden' }}>
        <PanelHeader title="Timer" onClose={onClose} className="drag-handle" />

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--fs-8xl)', fontWeight: 700, letterSpacing: '0.06em', color: running ? cfg.color : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s' }}>
              {formatTime(elapsed)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={running ? stop : start} style={{ flex: 2, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 'var(--fs-lg)', background: running ? '#ef444422' : '#00b86022', color: running ? '#ef4444' : '#00b860', border: `1px solid ${running ? '#ef444444' : '#00b86044'}` }}>
              {running ? 'Pausar' : 'Iniciar'}
            </button>
            <button onClick={reset} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--fs-lg)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
              Reset
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {(['stopwatch', 'countdown'] as const).map(m => (
              <button key={m} onClick={() => update({ mode: m })} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${cfg.mode === m ? '#00b86055' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 'var(--fs-md)', background: cfg.mode === m ? '#00b86018' : 'rgba(255,255,255,0.04)', color: cfg.mode === m ? '#00b860' : 'rgba(255,255,255,0.4)', fontWeight: cfg.mode === m ? 700 : 400 }}>
                {m === 'stopwatch' ? 'Cronômetro' : 'Contagem'}
              </button>
            ))}
          </div>

          {cfg.mode === 'countdown' && (
            <div>
              <div style={labelStyle}>Duração</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" min={0} max={99} value={cdMins}
                  onChange={e => update({ countdownSecs: Number(e.target.value) * 60 + cdSecs })}
                  style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-lg)' }}>min</span>
                <input type="number" min={0} max={59} value={cdSecs}
                  onChange={e => update({ countdownSecs: cdMins * 60 + Number(e.target.value) })}
                  style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-lg)' }}>seg</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Cor</div>
              <input type="color" value={cfg.color.length === 7 ? cfg.color : '#ffffff'}
                onChange={e => update({ color: e.target.value })}
                style={{ width: '100%', height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', cursor: 'pointer', padding: 2 }} />
            </div>
            <div style={{ flexShrink: 0, marginTop: 14 }}>
              <button onClick={() => update({ showSeconds: !cfg.showSeconds })}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${cfg.showSeconds ? '#00b86055' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 'var(--fs-md)', background: cfg.showSeconds ? '#00b86018' : 'rgba(255,255,255,0.04)', color: cfg.showSeconds ? '#00b860' : 'rgba(255,255,255,0.4)', fontWeight: cfg.showSeconds ? 700 : 400 }}>
                :ss
              </button>
            </div>
          </div>
        </div>
      </div>
    </Rnd>
  )
}
