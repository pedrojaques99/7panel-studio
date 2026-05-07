import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry, type CaptureSource } from '../lib/capture-bus'
import { createNoise2D } from 'simplex-noise'

const PHI = 1.61803398875
const GOLDEN_ANGLE = (Math.PI * 2) / (PHI * PHI)

type Mode = 'Neural' | 'Mycelium' | 'Vortex' | 'Bloom' | 'Grid'

interface VisConfig {
  mode: Mode
  speed: number
  branching: number
  complexity: number
  inkBleed: number
  tension: number
  lifespan: number
  nodeSize: number
  edgeOpacity: number
  curve: number
  persistence: number
  maxParticles: number
  charge: number
  separation: number
  friction: number
  sensitivity: number
}

const PRESETS: Record<string, VisConfig> = {
  Neural: {
    mode: 'Neural', speed: 1.6, branching: 0.35, complexity: 1.2, inkBleed: 1.2,
    tension: 0.12, lifespan: 400, nodeSize: 2, edgeOpacity: 0.4, curve: 0.1,
    persistence: 0.04, maxParticles: 1200, charge: -0.4, separation: 1.2, friction: 0.98, sensitivity: 1.0,
  },
  Vortex: {
    mode: 'Vortex', speed: 2.2, branching: 0.15, complexity: 3.5, inkBleed: 0.8,
    tension: 0.05, lifespan: 600, nodeSize: 0, edgeOpacity: 0.7, curve: 0.4,
    persistence: 0.02, maxParticles: 1800, charge: 0.2, separation: 0.5, friction: 0.99, sensitivity: 1.0,
  },
  Bloom: {
    mode: 'Bloom', speed: 1.4, branching: 0.55, complexity: 0.8, inkBleed: 2.5,
    tension: 0.08, lifespan: 250, nodeSize: 1.2, edgeOpacity: 0.5, curve: -0.3,
    persistence: 0.06, maxParticles: 900, charge: -0.6, separation: 0.8, friction: 0.96, sensitivity: 1.0,
  },
  Grid: {
    mode: 'Grid', speed: 1.8, branching: 0.2, complexity: 1.5, inkBleed: 0.5,
    tension: 0.1, lifespan: 350, nodeSize: 1, edgeOpacity: 0.6, curve: 0,
    persistence: 0.03, maxParticles: 1000, charge: -0.3, separation: 1.0, friction: 0.98, sensitivity: 1.0,
  },
}

class GrowthParticle {
  x: number; y: number; vx: number; vy: number
  accX = 0; accY = 0
  history: { x: number; y: number }[]
  life: number; maxLife: number; isDead = false
  id: string; hue: number

  constructor(x: number, y: number, vx: number, vy: number, maxLife: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy
    this.history = [{ x, y }]; this.maxLife = maxLife; this.life = maxLife
    this.id = Math.random().toString(36).substr(2, 9)
    this.hue = Math.random() * 360
  }

  applyForce(fx: number, fy: number) { this.accX += fx; this.accY += fy }

  update(noise2D: (x: number, y: number) => number, cfg: VisConfig, w: number, h: number, others: GrowthParticle[], onBranch: (p: GrowthParticle) => void) {
    if (this.isDead) return
    let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, count = 0
    const nd = 45
    for (let i = 0; i < others.length; i++) {
      const o = others[i]; if (o.id === this.id) continue
      const dx = o.x - this.x, dy = o.y - this.y, d2 = dx * dx + dy * dy
      if (d2 < nd * nd) {
        const d = Math.sqrt(d2) || 1
        sepX -= dx / d; sepY -= dy / d; aliX += o.vx; aliY += o.vy; cohX += o.x; cohY += o.y; count++
        if (cfg.charge !== 0) { const f = cfg.charge / (d2 + 1); this.applyForce(dx * f, dy * f) }
      }
    }
    if (count > 0) {
      this.applyForce(sepX * cfg.separation * 0.1, sepY * cfg.separation * 0.1)
      this.applyForce((aliX / count) * 0.05, (aliY / count) * 0.05)
      this.applyForce((cohX / count - this.x) * 0.01, (cohY / count - this.y) * 0.01)
    }

    const ns = 0.002 * cfg.complexity
    const n = noise2D(this.x * ns, this.y * ns)
    let ta = n * Math.PI * 2 * PHI

    if (cfg.mode === 'Vortex') {
      const da = Math.atan2(this.y - h / 2, this.x - w / 2) + (Math.PI / PHI)
      this.applyForce(Math.cos(da) * 0.15, Math.sin(da) * 0.15)
    } else if (cfg.mode === 'Bloom') {
      ta = Math.atan2(this.y - h / 2, this.x - w / 2) + (n * 0.8)
    } else if (cfg.mode === 'Grid') {
      ta = Math.round(ta / (Math.PI / 2)) * (Math.PI / 2)
    }

    this.applyForce(Math.cos(ta) * cfg.tension, Math.sin(ta) * cfg.tension)
    this.vx += this.accX; this.vy += this.accY; this.accX = 0; this.accY = 0
    const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1
    this.vx = (this.vx / mag) * cfg.speed * cfg.friction
    this.vy = (this.vy / mag) * cfg.speed * cfg.friction
    this.x += this.vx; this.y += this.vy
    this.history.push({ x: this.x, y: this.y })
    if (this.history.length > 20) this.history.shift()

    if (Math.random() < cfg.branching * 0.04 && this.life > 10) {
      const dir = Math.random() > 0.5 ? 1 : -1
      const ao = GOLDEN_ANGLE * dir, cos = Math.cos(ao), sin = Math.sin(ao)
      onBranch(new GrowthParticle(this.x, this.y, (this.vx * cos - this.vy * sin) * 0.9, (this.vx * sin + this.vy * cos) * 0.9, this.life * (1 / PHI)))
    }
    this.life--
    if (this.life <= 0 || this.x < -50 || this.x > w + 50 || this.y < -50 || this.y > h + 50) this.isDead = true
  }

  draw(ctx: CanvasRenderingContext2D, cfg: VisConfig) {
    if (this.history.length < 2) return
    const alpha = (this.life / this.maxLife) * cfg.edgeOpacity
    ctx.beginPath()
    ctx.moveTo(this.history[0].x, this.history[0].y)
    for (let i = 1; i < this.history.length; i++) {
      const xc = (this.history[i].x + this.history[i - 1].x) / 2
      const yc = (this.history[i].y + this.history[i - 1].y) / 2
      ctx.quadraticCurveTo(this.history[i - 1].x + this.vx * cfg.curve * PHI, this.history[i - 1].y + this.vy * cfg.curve * PHI, xc, yc)
    }
    ctx.strokeStyle = `hsla(${this.hue}, 60%, 55%, ${alpha})`
    ctx.lineWidth = Math.max(0.1, alpha * cfg.inkBleed + 0.5)
    ctx.stroke()
    if (cfg.nodeSize > 0) {
      ctx.beginPath()
      ctx.arc(this.x, this.y, Math.max(0, cfg.nodeSize * (alpha + 0.1)), 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
    }
  }
}

// ── Audio analyser that merges all capture-bus streams ──

function createMergedAnalyser(sources: CaptureSource[]): { analyser: AnalyserNode; ctx: AudioContext; cleanup: () => void } | null {
  const streams = sources.map(s => s.getStream()).filter(Boolean) as MediaStream[]
  if (streams.length === 0) return null
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.8
  const nodes: AudioNode[] = []
  streams.forEach(stream => {
    try {
      const src = ctx.createMediaStreamSource(stream)
      src.connect(analyser)
      nodes.push(src)
    } catch { /* stream may be ended */ }
  })
  return { analyser, ctx, cleanup: () => { nodes.forEach(n => n.disconnect()); ctx.close() } }
}

function readBands(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteFrequencyData(data)
  const len = data.length
  const sr = 44100
  const binHz = sr / (analyser.fftSize)
  const band = (lo: number, hi: number) => {
    const s = Math.floor(lo / binHz), e = Math.min(Math.ceil(hi / binHz), len - 1)
    let sum = 0, c = 0
    for (let i = s; i <= e; i++) { sum += data[i]; c++ }
    return c > 0 ? (sum / c) / 255 : 0
  }
  return {
    subBass: band(20, 60), bass: band(60, 250), lowMid: band(250, 500),
    mid: band(500, 2000), highMid: band(2000, 4000), high: band(4000, 12000),
    volume: band(20, 20000),
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

// ── Panel ──

export function VisualizerPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('visualizer', { x: 200, y: 100, w: 640, h: 420 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cfg, setCfg] = useState<VisConfig>(PRESETS.Neural)
  const [connected, setConnected] = useState(false)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [fullscreen, setFullscreen] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const particlesRef = useRef<GrowthParticle[]>([])
  const noiseRef = useRef(createNoise2D())
  const rafRef = useRef(0)
  const analyserRef = useRef<{ analyser: AnalyserNode; ctx: AudioContext; cleanup: () => void } | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0))
  const smoothRef = useRef({ subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0, volume: 0 })

  // Sync sources from capture registry
  useEffect(() => {
    setSources(captureRegistry.list())
    return captureRegistry.subscribe(() => setSources(captureRegistry.list()))
  }, [])

  // Connect/disconnect analyser
  const connect = useCallback(() => {
    analyserRef.current?.cleanup()
    const merged = createMergedAnalyser(sources)
    if (!merged) return
    analyserRef.current = merged
    dataRef.current = new Uint8Array(merged.analyser.frequencyBinCount)
    setConnected(true)
  }, [sources])

  const disconnect = useCallback(() => {
    analyserRef.current?.cleanup()
    analyserRef.current = null
    smoothRef.current = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0, volume: 0 }
    setConnected(false)
  }, [])

  useEffect(() => () => { analyserRef.current?.cleanup() }, [])

  // Auto-reconnect when sources change while connected
  useEffect(() => {
    if (connected && sources.length > 0) connect()
  }, [sources])

  // Seed particles
  const reset = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    const ctx2d = c.getContext('2d'); if (!ctx2d) return
    ctx2d.fillStyle = '#0a0a0a'
    ctx2d.fillRect(0, 0, c.width, c.height)
    noiseRef.current = createNoise2D()
    particlesRef.current = Array.from({ length: 3 }, () => {
      const a = Math.random() * Math.PI * 2
      return new GrowthParticle(c.width / 2 + (Math.random() - 0.5) * 60, c.height / 2 + (Math.random() - 0.5) * 60, Math.cos(a), Math.sin(a), cfg.lifespan)
    })
  }, [cfg.lifespan])

  // Animation loop
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    c.width = c.offsetWidth; c.height = c.offsetHeight
    reset()

    const loop = () => {
      const ctx2d = c.getContext('2d')
      if (!ctx2d) { rafRef.current = requestAnimationFrame(loop); return }

      // Read audio bands
      let live = { ...cfg }
      if (analyserRef.current) {
        const raw = readBands(analyserRef.current.analyser, dataRef.current)
        const s = smoothRef.current, t = 0.25
        smoothRef.current = {
          subBass: lerp(s.subBass, raw.subBass, t), bass: lerp(s.bass, raw.bass, t),
          lowMid: lerp(s.lowMid, raw.lowMid, t), mid: lerp(s.mid, raw.mid, t),
          highMid: lerp(s.highMid, raw.highMid, t), high: lerp(s.high, raw.high, t),
          volume: lerp(s.volume, raw.volume, t),
        }
        const b = smoothRef.current, se = cfg.sensitivity
        live = {
          ...cfg,
          speed: cfg.speed + b.bass * 3 * se,
          branching: Math.min(1, cfg.branching + b.mid * 0.4 * se),
          complexity: cfg.complexity + b.highMid * 2 * se,
          tension: cfg.tension + b.subBass * 0.15 * se,
          charge: cfg.charge + (b.bass > 0.6 ? -2 * se : 0),
          separation: cfg.separation + b.high * 1.0 * se,
          nodeSize: cfg.nodeSize + b.volume * 4 * se,
          edgeOpacity: Math.min(1, cfg.edgeOpacity + b.lowMid * 0.3 * se),
          inkBleed: cfg.inkBleed + b.bass * 3 * se,
          persistence: Math.min(0.3, cfg.persistence + b.volume * 0.05 * se),
          maxParticles: cfg.maxParticles + Math.floor(b.volume * 600 * se),
        }
      }

      const fade = Math.max(0.005, live.persistence)
      ctx2d.fillStyle = `rgba(10, 10, 10, ${fade})`
      ctx2d.fillRect(0, 0, c.width, c.height)

      const pts = particlesRef.current
      const newPts: GrowthParticle[] = []
      const phys = pts.length > 400 ? pts.slice(-400) : pts
      pts.forEach(p => {
        p.update(noiseRef.current, live, c.width, c.height, phys, child => {
          if (pts.length + newPts.length < live.maxParticles) newPts.push(child)
        })
        p.draw(ctx2d, live)
      })
      particlesRef.current = pts.filter(p => !p.isDead).concat(newPts)

      if (particlesRef.current.length < 5) {
        const a = Math.random() * Math.PI * 2
        particlesRef.current.push(new GrowthParticle(c.width / 2 + (Math.random() - 0.5) * 40, c.height / 2 + (Math.random() - 0.5) * 40, Math.cos(a), Math.sin(a), live.lifespan))
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cfg, connected])

  // Resize observer
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ro = new ResizeObserver(() => {
      c.width = c.offsetWidth; c.height = c.offsetHeight
      reset()
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [reset])

  // Fullscreen toggle
  const toggleFs = () => {
    if (!fullscreen) containerRef.current?.requestFullscreen?.()
    else document.exitFullscreen?.()
    setFullscreen(f => !f)
  }

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── Band meter mini-component ──
  const BandMeter = () => {
    const meterRef = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
      let raf: number
      const draw = () => {
        const cv = meterRef.current; if (!cv) return
        const cx = cv.getContext('2d'); if (!cx) return
        cv.width = cv.offsetWidth; cv.height = cv.offsetHeight
        cx.clearRect(0, 0, cv.width, cv.height)
        const b = smoothRef.current
        const keys = ['subBass', 'bass', 'lowMid', 'mid', 'highMid', 'high'] as const
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6']
        const bw = cv.width / keys.length - 1
        keys.forEach((k, i) => {
          const v = b[k]
          cx.fillStyle = colors[i]
          cx.globalAlpha = 0.6 + v * 0.4
          cx.fillRect(i * (bw + 1), cv.height * (1 - v), bw, cv.height * v)
        })
        raf = requestAnimationFrame(draw)
      }
      draw()
      return () => cancelAnimationFrame(raf)
    }, [])
    return <canvas ref={meterRef} style={{ width: '100%', height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.03)' }} />
  }

  const s: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#0a0a0a', borderRadius: 14, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.06)',
  }

  const inner = (
    <div ref={containerRef} style={s} onMouseDown={() => bringToFront('visualizer')}>
      <PanelHeader title="Visualizer" onClose={onClose} />

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {/* Connect button */}
        <button
          onClick={() => connected ? disconnect() : connect()}
          style={{
            padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            background: connected ? '#00b860' : 'rgba(255,255,255,0.08)', color: connected ? '#000' : 'rgba(255,255,255,0.6)',
            transition: 'all 0.2s',
          }}
        >
          {connected ? '● Live' : '○ Connect'}
        </button>

        {/* Source count */}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
          {sources.length} src
        </span>

        <div style={{ flex: 1 }} />

        {/* Preset buttons */}
        {Object.keys(PRESETS).map(k => (
          <button key={k} onClick={() => { setCfg(PRESETS[k]); reset() }}
            style={{
              padding: '3px 8px', borderRadius: 5, border: '1px solid',
              borderColor: cfg.mode === k ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)',
              background: cfg.mode === k ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: cfg.mode === k ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize: 10, cursor: 'pointer', fontWeight: 600,
            }}
          >{k}</button>
        ))}

        {/* Sensitivity */}
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>SNS</span>
        <input type="range" min={0.1} max={3} step={0.1} value={cfg.sensitivity}
          onChange={e => setCfg(p => ({ ...p, sensitivity: parseFloat(e.target.value) }))}
          style={{ width: 50, accentColor: '#8b5cf6' }}
        />

        {/* Params toggle */}
        <button onClick={() => setShowParams(p => !p)} style={{
          background: showParams ? 'rgba(139,92,246,0.2)' : 'none', border: showParams ? '1px solid rgba(139,92,246,0.4)' : 'none',
          color: showParams ? '#8b5cf6' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 10, borderRadius: 5, padding: '3px 6px', fontWeight: 600,
        }}>☰</button>

        {/* Fullscreen */}
        <button onClick={toggleFs} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>
          {fullscreen ? '⊟' : '⊞'}
        </button>

        {/* Reset */}
        <button onClick={reset} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>↺</button>
      </div>

      {/* Parameter controls drawer */}
      {showParams && (
        <div className="no-drag" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '2px 10px',
          padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.4)', maxHeight: 160, overflowY: 'auto',
        }}>
          {([
            ['speed', 0.1, 5, 0.1],
            ['branching', 0, 1, 0.01],
            ['complexity', 0.1, 6, 0.1],
            ['inkBleed', 0.1, 5, 0.1],
            ['tension', 0, 0.5, 0.01],
            ['lifespan', 50, 1200, 10],
            ['nodeSize', 0, 6, 0.1],
            ['edgeOpacity', 0, 1, 0.01],
            ['curve', -1, 1, 0.05],
            ['persistence', 0.005, 0.3, 0.005],
            ['maxParticles', 100, 3000, 50],
            ['charge', -3, 3, 0.1],
            ['separation', 0, 3, 0.1],
            ['friction', 0.9, 1, 0.005],
            ['sensitivity', 0.1, 3, 0.1],
          ] as [keyof VisConfig, number, number, number][]).map(([key, min, max, step]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
              <span style={{ width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key.slice(0, 7)}</span>
              <input type="range" min={min} max={max} step={step} value={cfg[key] as number}
                onChange={e => setCfg(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                style={{ flex: 1, height: 10, accentColor: '#8b5cf6' }}
              />
              <span style={{ width: 28, textAlign: 'right', fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
                {typeof cfg[key] === 'number' ? (cfg[key] as number).toFixed(key === 'lifespan' || key === 'maxParticles' ? 0 : 2) : cfg[key]}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Audio bands meter */}
      {connected && <div style={{ padding: '4px 10px' }}><BandMeter /></div>}

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ flex: 1, width: '100%', display: 'block', background: '#0a0a0a' }} />
    </div>
  )

  if (fullscreen) return inner

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: geo.h || 420 }}
      minWidth={400} minHeight={300}
      style={{ zIndex: zOf('visualizer') }}
      onDragStop={(_e, d) => { saveGeo('visualizer', { ...geo, x: d.x, y: d.y }); endDrag('visualizer') }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => { saveGeo('visualizer', { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight }); endDrag('visualizer') }}
      cancel=".no-drag" enableResizing dragHandleClassName="drag-handle"
    >
      {inner}
    </Rnd>
  )
}
