import React, { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../lib/api'
import { PanelHeader } from '../lib/PanelHeader'
import type { SbChannel } from '../lib/types'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { getSharedAudioContext, createCaptureDestination } from '../lib/audio-context'

// ─── Types ────────────────────────────────────────────────────────────────────
type AudioSession = {
  pid: number; name: string; display_name: string
  volume: number; muted: boolean; peak: number
  is_input?: boolean; inactive?: boolean
}
type Action = { type?: string; path?: string; label?: string }
type Config = { buttons?: Record<string, Action> }
type DeckState = { playing: boolean; currentTime: number; duration: number; volume: number }

const KEY_NAMES: Record<string, string> = {
  key_f13: 'F13', key_f14: 'F14', key_f15: 'F15', key_f16: 'F16',
  key_f17: 'F17', key_f18: 'F18', key_f19: 'F19', key_f20: 'F20',
  key_f21: 'F21', key_f22: 'F22', key_f23: 'F23', key_f24: 'F24',
}

// ─── App icon map ─────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  'Google Chrome': '🌐', Firefox: '🦊', Edge: '🔵', Opera: '🔴', Brave: '🦁',
  Discord: '💬', Spotify: '🎵', VLC: '🎬', 'OBS Studio': '📹', Steam: '🎮',
  Teams: '👥', Slack: '💼', Zoom: '📞', Skype: '📡', WhatsApp: '📱',
  Telegram: '✈️', foobar2000: '🎸', Winamp: '🎧', Audacity: '🎙️', REAPER: '🎚️',
  System: '🔊',
}

function icon(d: string, n: string, isInput?: boolean) {
  if (isInput || n === 'mic') return '🎙️'
  if (ICONS[d]) return ICONS[d]
  const l = n.toLowerCase()
  if (l.includes('game') || l.includes('unity')) return '🎮'
  if (l.includes('video') || l.includes('media')) return '🎬'
  return '⬡'
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function isYouTube(p: string) { return /youtube\.com|youtu\.be/.test(p) }

// ─── Shared AudioContext (singleton em lib/audio-context) ─────────────────────
let mixerCaptureDest: MediaStreamAudioDestinationNode | null = null
function getMixerCaptureStream(): MediaStream | null {
  return mixerCaptureDest?.stream ?? null
}
type AudioNodes = { source: MediaElementAudioSourceNode; analyser: AnalyserNode }
const audioNodeMap = new WeakMap<HTMLAudioElement, AudioNodes>()
function getNodes(audioEl: HTMLAudioElement): AudioNodes {
  if (audioNodeMap.has(audioEl)) return audioNodeMap.get(audioEl)!
  const ctx = getSharedAudioContext()
  if (!mixerCaptureDest) mixerCaptureDest = createCaptureDestination()
  const source = ctx.createMediaElementSource(audioEl)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 64
  source.connect(analyser)
  analyser.connect(ctx.destination)
  analyser.connect(mixerCaptureDest)
  const nodes = { source, analyser }
  audioNodeMap.set(audioEl, nodes)
  return nodes
}

// ─── VU Meter (system channels) ───────────────────────────────────────────────
function VuMeter({ peak, muted }: { peak: number; muted: boolean }) {
  const SEGS = 24
  const boosted = muted ? 0 : Math.sqrt(peak) * 1.4
  const active = Math.min(SEGS, Math.ceil(boosted * SEGS))
  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2.25, alignItems: 'center', height: 144 }}>
      {Array.from({ length: SEGS }, (_, i) => {
        const on = i < active
        const isRed = i >= 20, isYellow = i >= 15 && i < 20
        const litColor = isRed ? '#ff1744' : isYellow ? '#ffd600' : 'var(--text-70)'
        const deadColor = isRed ? '#2a0808' : isYellow ? '#1e1800' : 'rgba(255,255,255,0.05)'
        return <div key={i} style={{ width: 15, height: 4, borderRadius: 1.5, background: on ? litColor : deadColor, transition: 'background 50ms' }} />
      })}
    </div>
  )
}

// ─── Deck Visualizer (soundtrack channels) ────────────────────────────────────
const CANVAS_STYLE: React.CSSProperties = { display: 'block', width: '100%', height: '24px', borderRadius: '4px', opacity: 0.85 }

function RealVisualizer({ audioEl }: { audioEl: HTMLAudioElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    let nodes: AudioNodes
    try { nodes = getNodes(audioEl) } catch { return }
    const { analyser } = nodes
    const data = new Uint8Array(analyser.frequencyBinCount)
    const FRAME_MS = 1000 / 30
    let lastFrame = 0
    let cachedH = 0
    let cachedGrad: CanvasGradient | null = null
    function draw(ts: number) {
      rafRef.current = requestAnimationFrame(draw)
      if (document.hidden) return
      if (ts - lastFrame < FRAME_MS) return
      lastFrame = ts
      const canvas = canvasRef.current; if (!canvas) return
      const w = canvas.width, h = canvas.height
      const dctx = canvas.getContext('2d')!
      dctx.clearRect(0, 0, w, h)
      if (cachedH !== h) {
        cachedGrad = dctx.createLinearGradient(0, 0, 0, h)
        cachedGrad.addColorStop(0, 'rgba(0,184,96,0.85)')
        cachedGrad.addColorStop(1, 'rgba(0,184,96,0.15)')
        cachedH = h
      }
      dctx.fillStyle = cachedGrad!
      analyser.getByteFrequencyData(data)
      const bars = Math.min(data.length, 20), bw = w / bars - 1
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(2, (data[i] / 255) * h)
        dctx.fillRect(i * (bw + 1), h - bh, bw, bh)
      }
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [audioEl])
  return <canvas ref={canvasRef} width={120} height={24} style={CANVAS_STYLE} />
}

function MockVisualizer({ volume }: { volume: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)
  const volRef = useRef(volume)
  useEffect(() => { volRef.current = volume }, [volume])
  const N = 14
  const barsRef = useRef<number[]>(Array.from({ length: N }, () => 0.2 + Math.random() * 0.4))
  const targetRef = useRef<number[]>(Array.from({ length: N }, () => 0.2 + Math.random() * 0.4))
  const phaseRef = useRef<number[]>(Array.from({ length: N }, (_, i) => i * 0.6))
  useEffect(() => {
    const FRAME_MS = 1000 / 30 // 30 fps cap
    // Gradient cache shared by all bars; recriado só se height mudar.
    let cachedH = 0
    let cachedGrad: CanvasGradient | null = null
    function draw(ts: number) {
      rafRef.current = requestAnimationFrame(draw)
      if (document.hidden) return
      if (ts - lastFrameRef.current < FRAME_MS) return
      const canvas = canvasRef.current; if (!canvas) return
      const dt = Math.min((ts - lastTickRef.current) / 1000, 0.1)
      lastTickRef.current = ts
      lastFrameRef.current = ts
      const bars = barsRef.current, targets = targetRef.current, phases = phaseRef.current
      const w = canvas.width, h = canvas.height
      const dctx = canvas.getContext('2d')!
      dctx.clearRect(0, 0, w, h)
      if (cachedH !== h) {
        cachedGrad = dctx.createLinearGradient(0, 0, 0, h)
        cachedGrad.addColorStop(0, 'rgba(0,184,96,0.55)')
        cachedGrad.addColorStop(1, 'rgba(0,184,96,0.05)')
        cachedH = h
      }
      dctx.fillStyle = cachedGrad!
      const bw = Math.floor(w / N) - 1
      const vol = volRef.current / 100
      for (let i = 0; i < N; i++) {
        phases[i] += dt * (0.4 + i * 0.07)
        const sineBase = (0.1 + vol * 0.25) + Math.sin(phases[i]) * (0.1 + vol * 0.2)
        if (Math.random() < dt * 0.4) targets[i] = Math.max(0.05, Math.min(0.85, sineBase + (Math.random() - 0.5) * 0.15))
        bars[i] += (targets[i] - bars[i]) * Math.min(1, dt * 2.5)
        const bh = Math.max(2, bars[i] * h)
        dctx.fillRect(i * (bw + 1), h - bh, bw, bh)
      }
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])
  return <canvas ref={canvasRef} width={120} height={24} style={CANVAS_STYLE} />
}

function Visualizer({ audioEl, mock, volume }: { audioEl: HTMLAudioElement | null; mock: boolean; volume: number }) {
  if (mock || !audioEl) return <MockVisualizer volume={volume} />
  return <RealVisualizer audioEl={audioEl} />
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, duration, onSeek }: { current: number; duration: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const pct = duration > 0 ? (current / duration) * 100 : 0
  function calc(e: MouseEvent | React.MouseEvent) {
    const el = ref.current; if (!el || !duration) return
    const r = el.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration)
  }
  useEffect(() => {
    const up = () => { drag.current = false }
    const mv = (e: MouseEvent) => { if (drag.current) calc(e) }
    window.addEventListener('mouseup', up); window.addEventListener('mousemove', mv)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv) }
  }, [duration])
  return (
    <div ref={ref} style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, position: 'relative', cursor: 'pointer' }}
      onMouseDown={e => { drag.current = true; calc(e) }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: 'rgba(255,255,255,0.45)', borderRadius: 99 }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: 'var(--bg-btn-silver)', border: '1px solid rgba(255,255,255,0.2)' }} />
    </div>
  )
}

// ─── Horizontal vol slider (deck cards) ───────────────────────────────────────
function VolSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  function calc(e: MouseEvent | React.MouseEvent) {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    onChange(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100))
  }
  useEffect(() => {
    const up = () => { drag.current = false }
    const mv = (e: MouseEvent) => { if (drag.current) calc(e) }
    window.addEventListener('mouseup', up); window.addEventListener('mousemove', mv)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv) }
  }, [])
  return (
    <div ref={ref} style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, position: 'relative', cursor: 'pointer', width: '100%' }}
      onMouseDown={e => { drag.current = true; calc(e) }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${value}%`, background: 'var(--status-ok)', borderRadius: 99 }} />
      <div style={{ position: 'absolute', top: '50%', left: `${value}%`, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: 'var(--bg-btn-silver)', border: '1px solid rgba(255,255,255,0.2)' }} />
    </div>
  )
}

// ─── Vertical drag slider (system channel strips) ─────────────────────────────
function VerticalSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const calc = useCallback((y: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    onChange(clamp(1 - (y - r.top) / r.height))
  }, [onChange])
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (active.current) calc(e.clientY) }
    const up = () => { active.current = false }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
  }, [calc])
  const pct = value * 100
  return (
    <div ref={trackRef}
      onMouseDown={e => { if (!disabled) { active.current = true; calc(e.clientY); e.preventDefault() } }}
      style={{ width: 18, height: 162, borderRadius: 9, background: 'var(--bg-input)', boxShadow: 'var(--shadow-input)', border: '1.5px solid rgba(0,0,0,.8)', position: 'relative', cursor: disabled ? 'default' : 'ns-resize', userSelect: 'none', flexShrink: 0 }}>
      <div style={{ position: 'absolute', bottom: 12, left: 4.5, right: 4.5, height: `calc(${pct}% - 24px)`, minHeight: 0, borderRadius: 4.5, background: disabled ? 'var(--text-20)' : 'var(--text-70)', transition: 'height 60ms ease' }} />
      <div style={{ position: 'absolute', left: -6, right: -6, height: 18, bottom: `calc(${pct}% - 9px)`, borderRadius: 4.5, background: 'var(--bg-btn-silver)', boxShadow: '0 4.5px 9px rgba(0,0,0,.8), inset 0 1.5px 0 rgba(255,255,255,0.4)', transition: 'bottom 60ms ease', cursor: disabled ? 'default' : 'ns-resize', zIndex: 1 }}>
        <div style={{ position: 'absolute', inset: '6px 4.5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {[0, 1, 2].map(j => <div key={j} style={{ height: 1.5, background: 'rgba(0,0,0,.3)', borderRadius: 1.5 }} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Mic monitor hook ─────────────────────────────────────────────────────────
function useMicMonitor() {
  const [active, setActive] = useState(false)
  const refs = useRef<{ ctx: AudioContext; source: MediaStreamAudioSourceNode; stream: MediaStream } | null>(null)
  async function toggle() {
    if (active) {
      refs.current?.source.disconnect()
      refs.current?.ctx.close()
      refs.current?.stream.getTracks().forEach(t => t.stop())
      refs.current = null
      setActive(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      source.connect(ctx.destination)
      refs.current = { ctx, source, stream }
      setActive(true)
    } catch { /* permission denied */ }
  }
  return { active, toggle }
}

export type DeckPublicState = { playing: boolean; currentTime: number; duration: number; volume: number }

// ─── Soundtrack Deck (card) ───────────────────────────────────────────────────
function Deck({ keyId, action, buttonMode, onKeyRef, onSyncRef, onWillPlay, registerPause, onHide, onRename, onStateChange, onVolumeRef }: {
  keyId: string; action: Action; buttonMode: boolean
  onKeyRef: (id: string, fn: () => void) => void
  onSyncRef?: (id: string, fn: (forcePlaying?: boolean) => void) => void
  onWillPlay: (id: string) => void
  registerPause: (id: string, fn: () => void) => void
  onHide: () => void; onRename: (name: string) => void
  onStateChange?: (id: string, s: DeckPublicState) => void
  onVolumeRef?: (id: string, fn: (v: number) => void) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamUrlRef = useRef<string | null>(null)
  const [state, setState] = useState<DeckState>({ playing: false, currentTime: 0, duration: 0, volume: 80 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [resolving, _setResolving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const path = action.path ?? ''
  const isYT = isYouTube(path)
  const fileName = isYT ? 'YouTube' : (path.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '')
  const label = action.label || fileName
  const keyName = KEY_NAMES[keyId] ?? keyId

  const onStateChangeRef = useRef(onStateChange)
  useEffect(() => { onStateChangeRef.current = onStateChange }, [onStateChange])
  function emit(s: DeckState) { onStateChangeRef.current?.(keyId, s) }

  function makeAudio(src: string, cors = false) {
    const a = new Audio(src)
    if (cors) a.crossOrigin = 'anonymous'
    a.volume = state.volume / 100
    let lastTu = 0
    a.addEventListener('timeupdate', () => {
      const now = performance.now()
      if (now - lastTu < 200) return
      lastTu = now
      setState(s => { const n = { ...s, currentTime: a.currentTime }; emit(n); return n })
    })
    a.addEventListener('loadedmetadata', () => setState(s => { const n = { ...s, duration: a.duration }; emit(n); return n }))
    a.addEventListener('ended', () => setState(s => { const n = { ...s, playing: false, currentTime: 0 }; emit(n); return n }))
    audioRef.current = a
    return a
  }

  const toggle = useCallback(async () => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      setState(s => { const n = { ...s, playing: false }; emit(n); return n })
      return
    }
    let a = audioRef.current
    if (!a) {
      if (isYT) {
        a = makeAudio(`${API}/api/yt-stream?url=${encodeURIComponent(path)}`, false)
        streamUrlRef.current = a.src
      } else {
        a = makeAudio(`${API}/api/preview?path=${encodeURIComponent(path)}`, true)
      }
    }
    onWillPlay(keyId)
    const ctx = getSharedAudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    a.play().catch(console.error)
    setState(s => { const n = { ...s, playing: true }; emit(n); return n })
  }, [path, isYT])

  const syncVisual = useCallback((forcePlaying?: boolean) => {
    setState(s => { const n = { ...s, playing: forcePlaying !== undefined ? forcePlaying : !s.playing }; emit(n); return n })
  }, [])

  useEffect(() => { onKeyRef(keyId, toggle) }, [toggle])
  useEffect(() => { onSyncRef?.(keyId, syncVisual) }, [syncVisual])
  useEffect(() => {
    if (onVolumeRef) onVolumeRef(keyId, (v: number) => {
      setState(s => { const n = { ...s, volume: v }; emit(n); return n })
      if (audioRef.current) audioRef.current.volume = v / 100
    })
  }, [])
  useEffect(() => {
    registerPause(keyId, () => { audioRef.current?.pause(); setState(s => { const n = { ...s, playing: false }; emit(n); return n }) })
  }, [])
  useEffect(() => () => { audioRef.current?.pause() }, [])

  function startEdit() { setEditVal(label); setEditing(true); setTimeout(() => inputRef.current?.select(), 10) }
  function commitEdit() { setEditing(false); if (editVal.trim()) onRename(editVal.trim()) }

  if (buttonMode) {
    return (
      <button onClick={toggle} title={label} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 8px',
        borderRadius: 10, border: `1px solid ${state.playing ? 'rgba(0,184,96,0.4)' : 'rgba(255,255,255,0.07)'}`,
        background: state.playing ? 'linear-gradient(135deg,rgba(0,184,96,0.15),rgba(0,184,96,0.05))' : 'rgba(255,255,255,0.04)',
        cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
        boxShadow: state.playing ? '0 0 12px rgba(0,184,96,0.15)' : 'none',
      }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'var(--text-40)', fontWeight: 900, letterSpacing: '0.1em' }}>{keyName}</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: state.playing ? 'var(--status-ok)' : 'rgba(255,255,255,0.12)', boxShadow: state.playing ? '0 0 6px rgba(0,184,96,0.8)' : 'none' }} />
        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-70)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolving ? '⏳' : label}</span>
      </button>
    )
  }

  return (
    <div style={{
      borderRadius: 14,
      background: state.playing ? 'linear-gradient(160deg,rgba(0,184,96,0.08),rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${state.playing ? 'rgba(0,184,96,0.25)' : 'rgba(255,255,255,0.05)'}`,
      boxShadow: state.playing ? '0 0 20px rgba(0,184,96,0.08)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 12px 10px', minHeight: 148,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.1em', padding: '2px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: 'var(--text-40)', flexShrink: 0 }}>{keyName}</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: state.playing ? 'var(--status-ok)' : 'rgba(255,255,255,0.1)', boxShadow: state.playing ? '0 0 6px rgba(0,184,96,0.7)' : 'none' }} />
        {editing ? (
          <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            style={{ flex: 1, fontSize: 'var(--fs-md)', fontWeight: 700, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: 'var(--text-pure)', padding: '1px 5px', outline: 'none', minWidth: 0 }}
          />
        ) : (
          <span onDoubleClick={startEdit} title={`${path} — dbl-click para renomear`}
            style={{ flex: 1, fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>
            {label}
          </span>
        )}
        <button onClick={onHide} title="Esconder" style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 'var(--fs-md)', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
      </div>
      {state.playing && <Visualizer audioEl={audioRef.current} mock={isYT} volume={state.volume} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <ProgressBar current={state.currentTime} duration={state.duration}
          onSeek={t => { if (audioRef.current) audioRef.current.currentTime = t; setState(s => ({ ...s, currentTime: t })) }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--fs-base)', fontFamily: 'monospace', color: 'var(--text-20)' }}>{fmt(state.currentTime)}</span>
          <span style={{ fontSize: 'var(--fs-base)', fontFamily: 'monospace', color: 'var(--text-20)' }}>{fmt(state.duration)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={toggle} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, background: state.playing ? 'var(--status-ok)' : 'var(--bg-btn-silver)', color: state.playing ? '#000' : 'rgba(255,255,255,0.85)', fontSize: 'var(--fs-lg)', boxShadow: 'var(--shadow-btn)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {resolving ? '⏳' : state.playing ? '⏸' : '▶'}
        </button>
        <div style={{ flex: 1 }}>
          <VolSlider value={state.volume} onChange={v => { setState(s => ({ ...s, volume: v })); if (audioRef.current) audioRef.current.volume = v / 100 }} />
        </div>
        <span style={{ fontSize: 'var(--fs-base)', fontFamily: 'monospace', color: 'var(--text-20)', minWidth: 24, textAlign: 'right', flexShrink: 0 }}>{state.volume}</span>
      </div>
    </div>
  )
}

// ─── Soundboard Channel Strip (mirrors ChannelStrip layout exactly) ───────────
const SbStrip = React.memo(function SbStrip({ ch }: { ch: SbChannel }) {
  // No fake VU: peak deriva direto do volume com a transition do VuMeter.
  const peak = ch.volume / 100
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%',
      padding: '18px 12px 15px', borderRadius: 'var(--radius-key)',
      background: 'var(--bg-key-off)', boxShadow: 'var(--shadow-key-off)', position: 'relative',
    }}>
      <span style={{ fontSize: 'var(--fs-7xl)', lineHeight: 1, marginTop: 6 }}>{ch.emoji}</span>
      <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-40)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{ch.label}</span>
      <VuMeter peak={peak} muted={false} />
      <VerticalSlider value={ch.volume / 100} onChange={v => ch.setVolume(Math.round(v * 100))} />
      <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-70)', fontFamily: 'monospace', fontWeight: 'bold' }}>{ch.volume}%</span>
      <button onClick={ch.stop} style={{
        width: 54, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 'var(--fs-base)', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
        background: 'var(--status-ok)', color: '#000', boxShadow: 'var(--shadow-btn)',
      }}>⏹</button>
    </div>
  )
})

// ─── Soundboard Deck (button mode only — strip is default) ────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _SbDeck({ ch, buttonMode }: { ch: SbChannel; buttonMode: boolean }) {
  if (buttonMode) {
    return (
      <button onClick={ch.stop} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 8px',
        borderRadius: 10, border: '1px solid rgba(0,184,96,0.4)',
        background: 'linear-gradient(135deg,rgba(0,184,96,0.15),rgba(0,184,96,0.05))',
        cursor: 'pointer', flexShrink: 0,
      }}>
        <span style={{ fontSize: 'var(--fs-2xl)' }}>{ch.emoji}</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-ok)', boxShadow: '0 0 6px rgba(0,184,96,0.8)' }} />
        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-70)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.label}</span>
      </button>
    )
  }
  return <SbStrip ch={ch} />
}

// ─── System Channel Strip ─────────────────────────────────────────────────────
const ChannelStrip = React.memo(function ChannelStrip({ s, onVolume, onMute, onHide }: {
  s: AudioSession
  onVolume: (pid: number, v: number) => void
  onMute: (pid: number, muted: boolean) => void
  onHide: (name: string) => void
}) {
  const pct = Math.round(s.volume * 100)
  const appIcon = icon(s.display_name, s.name, s.is_input)
  const mic = useMicMonitor()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%',
      padding: '18px 12px 15px', borderRadius: 'var(--radius-key)',
      background: 'var(--bg-key-off)', boxShadow: 'var(--shadow-key-off)', position: 'relative',
      opacity: s.inactive ? 0.45 : 1, transition: 'opacity 300ms',
    }}>
      <button onClick={() => onHide(s.name)} style={{
        position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-20)', fontSize: 'var(--fs-lg)', padding: 3, lineHeight: 1, transition: 'color 120ms',
      }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-err)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-20)' }}
      >✕</button>
      <span style={{ fontSize: 'var(--fs-7xl)', lineHeight: 1, marginTop: 6 }}>{appIcon}</span>
      <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-40)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{s.display_name}</span>
      <VuMeter peak={s.peak} muted={s.muted} />
      <VerticalSlider value={s.volume} onChange={v => onVolume(s.pid, v)} disabled={s.muted} />
      <span style={{ fontSize: 'var(--fs-lg)', color: s.muted ? 'var(--text-20)' : 'var(--text-70)', fontFamily: 'monospace', fontWeight: 'bold' }}>{pct}%</span>
      {s.is_input && (
        <button onClick={mic.toggle} title="Monitor mic input" style={{
          width: 54, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 'var(--fs-base)', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
          transition: 'all 100ms', color: mic.active ? '#000' : 'var(--text-40)',
          background: mic.active ? '#ffd600' : 'var(--bg-key-off)',
          boxShadow: 'var(--shadow-btn)', transform: mic.active ? 'translateY(3px)' : undefined,
        }}>👂</button>
      )}
      <button onClick={() => onMute(s.pid, !s.muted)} style={{
        width: 54, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: 'var(--fs-base)', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
        transition: 'all 100ms', color: '#000',
        background: s.muted ? 'var(--status-err)' : 'var(--bg-btn-silver)',
        boxShadow: 'var(--shadow-btn)', transform: s.muted ? 'translateY(3px)' : undefined,
      }}>M</button>
    </div>
  )
}, (a, b) => {
  // Skip re-render if nothing visível mudou (peak, volume, muted, inactive, display_name).
  const x = a.s, y = b.s
  return x.pid === y.pid && x.peak === y.peak && x.volume === y.volume
    && x.muted === y.muted && x.inactive === y.inactive
    && x.display_name === y.display_name && x.name === y.name
    && x.is_input === y.is_input
    && a.onVolume === b.onVolume && a.onMute === b.onMute && a.onHide === b.onHide
})

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function AudioMixer({ onClose, config = { buttons: {} }, sbChannels = [], dragHandleClass, onRenameKey, onRegisterToggler, onRegisterSyncer, onPlayStateChange, onDeckStateChange, onRegisterVolumer }: {
  onClose?: () => void
  config?: Config
  sbChannels?: SbChannel[]
  dragHandleClass?: string
  onRenameKey?: (keyId: string, label: string) => void
  onRegisterToggler?: (keyId: string, fn: () => void) => void
  onRegisterSyncer?: (keyId: string, fn: (forcePlaying?: boolean) => void) => void
  onPlayStateChange?: (keyId: string, playing: boolean) => void
  onDeckStateChange?: (keyId: string, s: DeckPublicState) => void
  onRegisterVolumer?: (keyId: string, fn: (v: number) => void) => void
}) {
  // ── System session state ──
  const [sessions, setSessions] = useState<AudioSession[]>([])
  const [hiddenSys, setHiddenSys] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mixer-hidden') || '[]') } catch { return [] }
  })
  const [showHiddenSys, setShowHiddenSys] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const localVols = useRef<Map<number, { v: number; expires: number }>>(new Map())

  // ── Soundtrack state ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [buttonMode, _setButtonMode] = useState(() => localStorage.getItem('soundtrack-buttonmode') === 'true')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hiddenDecks, _setHiddenDecks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('soundtrack-hidden') || '[]') } catch { return [] }
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_hiddenExpanded, _setHiddenExpanded] = useState(false)
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('soundtrack-labels') || '{}') } catch { return {} }
  })
  const togglersRef = useRef<Record<string, () => void>>({})
  const syncersRef = useRef<Record<string, (forcePlaying?: boolean) => void>>({})
  const pauseFnsRef = useRef<Record<string, () => void>>({})
  const playingQueueRef = useRef<string[]>([])

  useEffect(() => {
    captureRegistry.register({ id: 'soundtrack', label: 'Soundtrack', getStream: getMixerCaptureStream })
    return () => captureRegistry.unregister('soundtrack')
  }, [])

  useEffect(() => { localStorage.setItem('soundtrack-buttonmode', String(buttonMode)) }, [buttonMode])
  useEffect(() => { localStorage.setItem('soundtrack-hidden', JSON.stringify(hiddenDecks)) }, [hiddenDecks])
  useEffect(() => { localStorage.setItem('soundtrack-labels', JSON.stringify(labels)) }, [labels])

  // ── System fetch ──
  // Retorna `true` se sucesso, `false` se erro/offline — usado pelo loop de
  // polling para aplicar backoff exponencial quando backend está morto.
  const fetchSessions = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(`${API}/api/audio/sessions`, { signal: AbortSignal.timeout(500) })
      if (!r.ok) { setAvailable(false); return false }
      const raw: AudioSession[] = await r.json()
      const merged = new Map<string, AudioSession>()
      for (const s of raw) {
        const key = s.display_name
        if (!merged.has(key)) { merged.set(key, { ...s }); continue }
        const ex = merged.get(key)!
        if (s.inactive && !ex.inactive) continue
        if (!s.inactive && ex.inactive) { merged.set(key, { ...s }); continue }
        merged.set(key, { ...ex, peak: Math.min(1, ex.peak + s.peak), volume: Math.max(ex.volume, s.volume) })
      }
      const data = Array.from(merged.values())
      const now = Date.now()
      const livePids = new Set(data.map(s => s.pid))
      for (const pid of localVols.current.keys()) if (!livePids.has(pid)) localVols.current.delete(pid)
      setSessions(data.map(s => {
        const local = localVols.current.get(s.pid)
        if (local && local.expires > now) return { ...s, volume: local.v }
        localVols.current.delete(s.pid)
        return s
      }))
      setAvailable(true)
      return true
    } catch { setAvailable(false); return false }
  }, [])

  // Loop adaptativo: 250 ms quando saudável, backoff exponencial até 5 s offline,
  // pausa total em background (visibilitychange).
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let wakeup: (() => void) | null = null
    const FAST = 250, MAX = 5000
    let delay = FAST

    function waitVisible(): Promise<void> {
      if (!document.hidden) return Promise.resolve()
      return new Promise(res => { wakeup = res })
    }
    function onVis() {
      if (!document.hidden && wakeup) { const fn = wakeup; wakeup = null; fn() }
    }
    document.addEventListener('visibilitychange', onVis)

    async function loop() {
      while (active) {
        await waitVisible()
        if (!active) break
        const ok = await fetchSessions()
        if (!active) break
        delay = ok ? FAST : Math.min(delay * 2, MAX)
        await new Promise<void>(res => { timer = setTimeout(res, delay) })
      }
    }
    loop()
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVis)
      if (timer) clearTimeout(timer)
      wakeup?.()
    }
  }, [fetchSessions])

  // ── System handlers ──
  const handleVolume = useCallback(async (pid: number, volume: number) => {
    localVols.current.set(pid, { v: volume, expires: Date.now() + 400 })
    setSessions(p => p.map(s => s.pid === pid ? { ...s, volume } : s))
    if (pid === -1) return
    await fetch(`${API}/api/audio/sessions/volume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid, volume }),
    }).catch(() => {})
  }, [])

  const handleMute = useCallback(async (pid: number, muted: boolean) => {
    setSessions(p => p.map(s => s.pid === pid ? { ...s, muted } : s))
    if (pid === -1) return
    await fetch(`${API}/api/audio/sessions/mute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid, muted }),
    }).catch(() => {})
  }, [])

  const handleHideSys = useCallback((name: string) => {
    setHiddenSys(p => { const n = [...p, name]; localStorage.setItem('mixer-hidden', JSON.stringify(n)); return n })
  }, [])

  const handleUnhideSys = useCallback((name: string) => {
    setHiddenSys(p => { const n = p.filter(x => x !== name); localStorage.setItem('mixer-hidden', JSON.stringify(n)); return n })
  }, [])

  // ── Soundtrack handlers ──
  const handleKeyRef = useCallback((id: string, fn: () => void) => {
    togglersRef.current[id] = fn
    onRegisterToggler?.(id, fn)
  }, [])

  const handleSyncRef = useCallback((id: string, fn: (forcePlaying?: boolean) => void) => {
    syncersRef.current[id] = fn
    onRegisterSyncer?.(id, fn)
  }, [])

  const handleWillPlay = useCallback((activeId: string) => {
    const q = playingQueueRef.current.filter(id => id !== activeId)
    if (q.length >= 2) { const oldest = q.shift()!; pauseFnsRef.current[oldest]?.() }
    q.push(activeId)
    playingQueueRef.current = q
    onPlayStateChange?.(activeId, true)
  }, [])

  const handleRegisterPause = useCallback((id: string, fn: () => void) => {
    pauseFnsRef.current[id] = () => {
      fn()
      playingQueueRef.current = playingQueueRef.current.filter(q => q !== id)
      onPlayStateChange?.(id, false)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const match = Object.keys(KEY_NAMES).find(k => KEY_NAMES[k].toLowerCase() === e.key.toLowerCase())
      if (match && togglersRef.current[match]) { e.preventDefault(); togglersRef.current[match]() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── Derived ──
  const allDecks = Object.entries(config.buttons ?? {}).filter(([, a]) => a.type === 'play_audio' && a.path)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _visibleDecks = allDecks.filter(([id]) => !hiddenDecks.includes(id))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hiddenDeckItems = allDecks.filter(([id]) => hiddenDecks.includes(id))
  const visibleSessions = sessions.filter(s => !hiddenSys.includes(s.name))
  const hiddenSessionItems = sessions.filter(s => hiddenSys.includes(s.name))

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hasSoundtrack = allDecks.length > 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hasSystem = visibleSessions.length > 0 || sbChannels.length > 0

  return (
    <CaptureIdContext.Provider value="soundtrack">
    <div style={{
      borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)', boxShadow: 'var(--shadow-chassis)',
      padding: '0 0 20px 0', display: 'flex', flexDirection: 'column', gap: 0, width: '100%', minWidth: 0,
    }}>
      <PanelHeader title="// Audio" onClose={onClose} className={dragHandleClass}>
        {hiddenSessionItems.length > 0 && (
          <button onClick={() => setShowHiddenSys(p => !p)} style={{
            fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            background: showHiddenSys ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-xs)',
            color: 'var(--text-40)', padding: '3px 7px', cursor: 'pointer',
          }}>{hiddenSessionItems.length} hidden</button>
        )}
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: available === null ? '#555' : available ? 'var(--status-ok)' : 'var(--status-err)' }} />
      </PanelHeader>

      {/* Deck engines — mounted but hidden; audio state managed here, displayed on keyboard keys */}
      <div style={{ display: 'none' }}>
        {allDecks.map(([keyId, action]) => (
          <Deck
            key={keyId} keyId={keyId}
            action={{ ...action, label: labels[keyId] || action.label }}
            buttonMode={false}
            onKeyRef={handleKeyRef} onSyncRef={handleSyncRef}
            onWillPlay={handleWillPlay} registerPause={handleRegisterPause}
            onHide={() => {}} onRename={name => { setLabels(l => ({ ...l, [keyId]: name })); onRenameKey?.(keyId, name) }}
            onStateChange={onDeckStateChange}
            onVolumeRef={onRegisterVolumer}
          />
        ))}
      </div>

      {/* System mixer strips + soundboard active channels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 12, padding: '12px 20px 0' }}>
        {visibleSessions.map(s => (
          <ChannelStrip key={s.display_name} s={s} onVolume={handleVolume} onMute={handleMute} onHide={handleHideSys} />
        ))}
        {sbChannels.map(ch => (
          <SbStrip key={ch.id} ch={ch} />
        ))}
      </div>

      {/* Hidden system sessions */}
      {showHiddenSys && hiddenSessionItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 20px 0' }}>
          <div style={{ fontSize: 'var(--fs-sm)', letterSpacing: '0.3em', color: 'var(--text-40)', textTransform: 'uppercase' }}>Hidden</div>
          {hiddenSessionItems.map(s => (
            <div key={s.display_name} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px' }}>
              <span style={{ fontSize: 'var(--fs-3xl)' }}>{icon(s.display_name, s.name, s.is_input)}</span>
              <span style={{ fontSize: 'var(--fs-md)', color: 'var(--text-40)', flex: 1 }}>{s.display_name}</span>
              <button onClick={() => handleUnhideSys(s.name)} style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'var(--text-40)', padding: '2px 7px', cursor: 'pointer' }}>Show</button>
            </div>
          ))}
        </div>
      )}
    </div>
    </CaptureIdContext.Provider>
  )
}
