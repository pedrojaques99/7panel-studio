import React, { useState, useEffect, useRef } from 'react'
import type { TimerConfig } from '../components/TimerPanel'
import { API } from '../lib/api'

const defaultConfig: TimerConfig = {
  mode: 'stopwatch', countdownSecs: 3600,
  color: 'rgba(255,255,255,0.5)', showSeconds: true,
}

export function OverlayTimer() {
  const [elapsed, setElapsed] = useState(0)
  const [cfg, setCfg]         = useState<TimerConfig>(defaultConfig)
  const stateRef = useRef<{ start: number | null; stopped: number | null }>({ start: null, stopped: null })
  const lastJsonRef = useRef('')

  useEffect(() => {
    // Poll Flask for timer state
    async function poll() {
      try {
        const r = await fetch(`${API}/api/overlay/timer`)
        const data = await r.json()
        const s = JSON.stringify(data)
        if (s === lastJsonRef.current) return
        lastJsonRef.current = s

        if (data.config) setCfg(c => ({ ...c, ...data.config }))
        stateRef.current = {
          start:   data.start   ?? null,
          stopped: data.stopped ?? null,
        }
        if (data.stopped != null) setElapsed(data.stopped)
        else if (data.start) setElapsed(Math.floor((Date.now() - data.start) / 1000))
      } catch {}
    }

    // Tick locally for smooth display
    function tick() {
      const { start, stopped } = stateRef.current
      if (stopped != null) return          // frozen — don't tick
      if (start) setElapsed(Math.floor((Date.now() - start) / 1000))
    }

    poll()
    const pollT = setInterval(poll, 600)
    const tickT = setInterval(tick, 500)
    return () => { clearInterval(pollT); clearInterval(tickT) }
  }, [])

  function formatTime(secs: number) {
    const display = cfg.mode === 'countdown' ? Math.max(0, cfg.countdownSecs - secs) : secs
    const h = Math.floor(display / 3600)
    const m = Math.floor((display % 3600) / 60)
    const s = display % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}${cfg.showSeconds ? ':' + String(s).padStart(2,'0') : ''}`
    return `${String(m).padStart(2,'0')}${cfg.showSeconds ? ':' + String(s).padStart(2,'0') : ''}`
  }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", display: 'inline-block', padding: '6px 14px', background: 'rgba(14,15,17,0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
      <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, letterSpacing: '0.12em', color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(elapsed)}
      </span>
      <style>{`html,body,#root{background:transparent!important;margin:0;padding:0}`}</style>
    </div>
  )
}
