import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import Knob from '../lib/vintage-imports/Knob1'
import { API } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { WHITE_NOTES, NOTE_CENTS, KEY_NOTE, BLACK_KEYS } from '../lib/notes'
import { BpmControl } from '../lib/BpmControl'

type Note = typeof WHITE_NOTES[number]

const PAUL_MODE = { grainSize: 0.85, overlap: 0.45, playbackRate: 0.22 }
const NORMAL_MODE = { grainSize: 0.25, overlap: 0.18, playbackRate: 1.0 }

type Status = 'idle' | 'loading' | 'ready' | 'playing'

type SeqStep = { noteName: string; cents: number }

type TimedEvent = { noteName: string; cents: number; timeMs: number; durationMs: number }

type SeqLoop = {
  steps: SeqStep[]
  muted: boolean
  freestyle?: TimedEvent[]
  freestyleLenMs?: number
}

const LOOP_COLORS = ['#a78bfa', '#34d399', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316']

function crushWet(bits: number): number {
  return bits >= 12 ? 0 : 1
}

/* ── Controlled knob built on the existing Knob1 SVG ──────────────── */

const KNOB_NATIVE = { w: 81, h: 75 }

function SynthKnob({
  label, value, min, max, size = 64, fmt, accent = '#00b860', onChange,
}: {
  label: string; value: number; min: number; max: number; size?: number
  fmt?: (v: number) => string; accent?: string; onChange: (v: number) => void
}) {
  const [drag, setDrag] = useState(false)
  const [hover, setHover] = useState(false)
  const [flash, setFlash] = useState(false)
  const lastY = useRef(0)
  const shiftRef = useRef(false)
  const sc = size / KNOB_NATIVE.w
  const scaledH = Math.round(KNOB_NATIVE.h * sc)
  const rotation = -135 + ((value - min) / (max - min)) * 270
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dy = lastY.current - e.clientY
      lastY.current = e.clientY
      shiftRef.current = e.shiftKey
      const sensitivity = e.shiftKey ? 0.004 : 0.022
      onChange(clamp(value + dy * sensitivity * (max - min)))
    }
    const onUp = () => setDrag(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [drag, value, min, max, onChange])

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault(); e.stopPropagation()
    const sensitivity = e.shiftKey ? 0.002 : 0.012
    const delta = (e.deltaY < 0 ? 1 : -1) * sensitivity * (max - min)
    onChange(clamp(value + delta))
  }

  const onDoubleClick = () => onChange((min + max) / 2)

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // right-click: random nudge — no shift = light, shift = medium, ctrl+shift = hard
    const range = max - min
    const spread = e.ctrlKey && e.shiftKey ? 0.8 : e.shiftKey ? 0.4 : 0.15
    const nudge = (Math.random() - 0.5) * 2 * spread * range
    onChange(clamp(value + nudge))
    setFlash(true); setTimeout(() => setFlash(false), 200)
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
      title={`${label}: ${fmt ? fmt(value) : value.toFixed(2)}\ndrag ↕ · shift fine · ctrl+scroll · dbl-click reset\nright-click: random nudge (shift=med ctrl+shift=hard)`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: drag ? 'grabbing' : 'grab',
        opacity: hover || drag ? 1 : 0.85,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{
        width: size, height: scaledH, position: 'relative',
        filter: flash ? `drop-shadow(0 0 10px ${accent})` : hover ? `drop-shadow(0 0 6px ${accent}44)` : 'none',
        transition: 'filter 0.15s',
      }}>
        <div style={{ transform: `scale(${sc})`, transformOrigin: 'top left', width: KNOB_NATIVE.w, height: KNOB_NATIVE.h }}>
          <Knob rotation={rotation} />
        </div>
      </div>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: hover ? 'var(--text-60)' : 'var(--text-40)', textTransform: 'uppercase', transition: 'color 0.15s' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: accent, marginTop: -2 }}>
        {fmt ? fmt(value) : value.toFixed(2)}
      </span>
    </div>
  )
}

/* ── Big oscilloscope/spectrum (real-time) ────────────────────────── */

function Scope({ analyser, color, height = 84 }: {
  analyser: Tone.Analyser | null; color: string; height?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!analyser) return
    function draw() {
      raf.current = requestAnimationFrame(draw)
      const c = ref.current; if (!c) return
      const ctx = c.getContext('2d')!
      const w = c.width, h = c.height
      ctx.fillStyle = 'rgba(8,9,11,0.85)'
      ctx.fillRect(0, 0, w, h)

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const x = (w / 8) * i
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()

      // waveform
      const data = analyser!.getValue() as Float32Array
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] as number)
        const x = (i / (data.length - 1)) * w
        const y = h / 2 - v * (h / 2) * 0.9
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    draw()
    return () => cancelAnimationFrame(raf.current)
  }, [analyser, color])

  return <canvas ref={ref} width={420} height={height} style={{
    width: '100%', height, display: 'block', borderRadius: 10,
    background: 'linear-gradient(180deg,#0a0b0d,#06070a)',
    boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)',
  }} />
}

/* ── Piano keyboard (horizontal, white + black) ──────────────────── */

function Piano({ activeNotes, sequence, seqStep, seqPlaying, seqColor = '#a78bfa', onNoteOn, onNoteOff, onToggleSeq }: {
  activeNotes: Set<string>
  sequence: SeqStep[]
  seqStep: number
  seqPlaying: boolean
  seqColor?: string
  onNoteOn: (noteName: string, cents: number) => void
  onNoteOff: (noteName: string) => void
  onToggleSeq: (noteName: string, cents: number) => void
}) {
  const whitesArr = [...WHITE_NOTES]
  const reverseKey = (note: Note) =>
    Object.entries(KEY_NOTE).find(([, n]) => n === note)?.[0] ?? ''

  const seqIndex = (n: string) => sequence.findIndex(s => s.noteName === n)

  const downHandlers = (noteName: string, cents: number) => ({
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault(); onNoteOn(noteName, cents)
    },
    onMouseUp: (e: React.MouseEvent) => {
      if (e.button !== 0) return
      onNoteOff(noteName)
    },
    onMouseEnter: (e: React.MouseEvent) => {
      if (!(e.buttons & 1)) return
      onNoteOn(noteName, cents)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      if ((e.buttons & 1) && activeNotes.has(noteName)) onNoteOff(noteName)
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault(); onToggleSeq(noteName, cents)
    },
  })

  return (
    <div style={{ position: 'relative', height: 110, userSelect: 'none' }}>
      {/* White keys */}
      <div style={{ display: 'flex', gap: 2, height: '100%' }}>
        {whitesArr.map(n => {
          const isActive = activeNotes.has(n)
          const seqIdx = seqIndex(n)
          const inSeq = seqIdx >= 0
          const isCurrentStep = seqPlaying && inSeq && seqStep === seqIdx
          return (
            <button key={n}
              {...downHandlers(n, NOTE_CENTS[n])}
              title={`${n} — left: play · right: ${inSeq ? 'remove from' : 'add to'} sequence`}
              style={{
                flex: 1, minWidth: 0, padding: 0, border: 'none', cursor: 'pointer',
                borderRadius: '0 0 6px 6px', position: 'relative',
                background: isActive
                  ? 'linear-gradient(180deg,#00b860,#008a44)'
                  : inSeq
                    ? `linear-gradient(180deg,#e6dcff,#bfa8ee)`
                    : 'linear-gradient(180deg,#f0f1f3,#cdd0d6)',
                boxShadow: isActive
                  ? 'inset 0 -2px 0 rgba(0,0,0,0.3), 0 0 12px rgba(0,184,96,0.5)'
                  : isCurrentStep
                    ? `inset 0 -3px 0 rgba(0,0,0,0.25), 0 0 14px ${seqColor}`
                    : 'inset 0 -3px 0 rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.6) inset',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', paddingBottom: 6,
                transition: 'all 0.07s',
              }}>
              {inSeq && (
                <span style={{
                  position: 'absolute', top: 4, left: 0, right: 0, textAlign: 'center',
                  fontSize: 'var(--fs-2xs)', fontWeight: 900, fontFamily: 'monospace',
                  color: isCurrentStep ? '#fff' : seqColor,
                }}>{seqIdx + 1}</span>
              )}
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 900, color: isActive ? '#fff' : 'rgba(0,0,0,0.55)' }}>
                {n}
              </span>
              <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)' }}>
                {reverseKey(n)}
              </span>
            </button>
          )
        })}
      </div>
      {/* Black keys overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '62%', pointerEvents: 'none' }}>
        {BLACK_KEYS.map(bk => {
          const leftPct = ((bk.afterWhite + 1) / WHITE_NOTES.length) * 100
          const isActive = activeNotes.has(bk.label)
          const seqIdx = seqIndex(bk.label)
          const inSeq = seqIdx >= 0
          const isCurrentStep = seqPlaying && inSeq && seqStep === seqIdx
          return (
            <button key={bk.label}
              {...downHandlers(bk.label, bk.cents)}
              title={`${bk.label} — left: play · right: ${inSeq ? 'remove from' : 'add to'} sequence`}
              style={{
                position: 'absolute', top: 0, left: `calc(${leftPct}% - ${100 / WHITE_NOTES.length / 2}%)`,
                width: `${100 / WHITE_NOTES.length * 0.62}%`, height: '100%',
                transform: 'translateX(-50%)', border: 'none', cursor: 'pointer',
                pointerEvents: 'auto',
                background: isActive
                  ? 'linear-gradient(180deg,#00b860,#006a37 80%,#003d20)'
                  : inSeq
                    ? `linear-gradient(180deg,#3a2d5e,#1a0f3c 80%,#0a0418)`
                    : 'linear-gradient(180deg,#1a1b1d,#0a0b0d 75%,#000)',
                borderRadius: '0 0 4px 4px',
                boxShadow: isActive
                  ? '0 0 10px rgba(0,184,96,0.6), inset 0 -2px 0 rgba(0,0,0,0.4)'
                  : isCurrentStep
                    ? `0 0 12px ${seqColor}, inset 0 -2px 0 rgba(0,0,0,0.4)`
                    : 'inset 0 -3px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.6)',
                color: isActive ? '#fff' : inSeq ? seqColor : 'rgba(255,255,255,0.35)',
                fontSize: 'var(--fs-3xs)', fontWeight: 900,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', paddingBottom: 4,
                transition: 'background 0.07s, box-shadow 0.07s',
              }}>
              {inSeq && (
                <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: isCurrentStep ? '#fff' : seqColor, fontWeight: 900 }}>
                  {seqIdx + 1}
                </span>
              )}
              {bk.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Module-level capture (shared per-app) ─────────────────────────── */

let synthCaptureDest: MediaStreamAudioDestinationNode | null = null
let synthOutputGain: Tone.Gain | null = null
let synthMonitorEnabled = true

function getSynthCaptureStream(): MediaStream | null { return synthCaptureDest?.stream ?? null }
function setSynthMonitor(enabled: boolean) {
  synthMonitorEnabled = enabled
  synthOutputGain?.gain.rampTo(enabled ? 1 : 0, 0.05)
}
function ensureSynthTap() {
  if (synthCaptureDest) return
  const rawCtx = Tone.getContext().rawContext as AudioContext
  synthCaptureDest = rawCtx.createMediaStreamDestination()
}

/* ── Audio chain ───────────────────────────────────────────────────── */

type FxParams = {
  drive: number       // distortion 0..1
  bite: number        // chebyshev order 1..50 (int)
  cutoff: number      // filter Hz 80..18000
  resonance: number   // filter Q 0..20
  paul: number        // grainSize seconds 0.05..1.5 (couples overlap)
  rate: number        // playbackRate 0.05..2
  reverbWet: number   // 0..1
  reverbDecay: number // seconds 0.5..30
  vol: number         // 0..1 (linear, will be converted to dB)
  // Atmospheric FX
  crush: number       // BitCrusher bits 4..12 (12 = transparent)
  chorus: number      // wet 0..1 (lush detune shimmer)
  phaser: number      // wet 0..1 (slow moving fog)
  delay: number       // wet 0..1 (ping-pong tape echo)
  delayTime: number   // seconds 0.05..1.5
  delayFb: number     // feedback 0..0.95
}

const FX_DEFAULTS: FxParams = {
  drive: 0.15, bite: 4, cutoff: 8000, resonance: 1.5,
  paul: 0.5, rate: 0.5, reverbWet: 0.55, reverbDecay: 8, vol: 0.7,
  crush: 12, chorus: 0, phaser: 0, delay: 0, delayTime: 0.4, delayFb: 0.45,
}

/* ── Presets ─────────────────────────────────────────────────────── */

type SynthPreset = {
  id: string
  name: string
  // Partial: missing fields are merged with FX_DEFAULTS at apply-time so old presets stay compatible
  fx: Partial<FxParams>
  paulMode: boolean
  source?: { url: string; label: string } | null
  factory?: boolean
}

const FACTORY_PRESETS: SynthPreset[] = [
  { id: 'f-init',     name: 'Init',          factory: true, paulMode: false,
    fx: { ...FX_DEFAULTS } },
  { id: 'f-warm-pad', name: 'Warm Pad',      factory: true, paulMode: false,
    fx: { drive: 0.05, bite: 2, cutoff: 4500, resonance: 1.0, paul: 0.3, rate: 1.0, reverbWet: 0.7, reverbDecay: 12, vol: 0.7 } },
  { id: 'f-dark',     name: 'Dark Drone',    factory: true, paulMode: true,
    fx: { drive: 0.08, bite: 3, cutoff: 1400, resonance: 4, paul: 0.95, rate: 0.18, reverbWet: 0.65, reverbDecay: 18, vol: 0.75 } },
  { id: 'f-cathedral',name: 'Cathedral',     factory: true, paulMode: false,
    fx: { drive: 0.05, bite: 2, cutoff: 6500, resonance: 0.8, paul: 0.7, rate: 0.4, reverbWet: 0.95, reverbDecay: 28, vol: 0.65 } },
  { id: 'f-buzz',     name: 'Buzz Lead',     factory: true, paulMode: false,
    fx: { drive: 0.7, bite: 18, cutoff: 3200, resonance: 8, paul: 0.2, rate: 1.0, reverbWet: 0.25, reverbDecay: 4, vol: 0.55 } },
  { id: 'f-metal',    name: 'Metal Bite',    factory: true, paulMode: false,
    fx: { drive: 0.55, bite: 32, cutoff: 5000, resonance: 12, paul: 0.18, rate: 1.0, reverbWet: 0.35, reverbDecay: 6, vol: 0.55 } },
  { id: 'f-bass',     name: 'Sub Bass',      factory: true, paulMode: false,
    fx: { drive: 0.25, bite: 1, cutoff: 800, resonance: 6, paul: 0.2, rate: 1.0, reverbWet: 0.15, reverbDecay: 3, vol: 0.85 } },
  { id: 'f-shimmer',  name: 'Shimmer',       factory: true, paulMode: false,
    fx: { drive: 0.1, bite: 5, cutoff: 14000, resonance: 0.5, paul: 0.4, rate: 0.85, reverbWet: 0.85, reverbDecay: 18, vol: 0.65 } },
  { id: 'f-dust',     name: 'Granular Dust', factory: true, paulMode: true,
    fx: { drive: 0.3, bite: 7, cutoff: 7000, resonance: 2, paul: 1.2, rate: 0.15, reverbWet: 0.55, reverbDecay: 14, vol: 0.7,
          crush: 12, chorus: 0, phaser: 0, delay: 0, delayTime: 0.4, delayFb: 0.45 } },
  // ── Atmospheric / nostalgic patches ──
  { id: 'f-silenthill', name: 'Silent Hill Fog', factory: true, paulMode: false,
    fx: { drive: 0.18, bite: 3, cutoff: 2200, resonance: 3, paul: 0.4, rate: 0.7, reverbWet: 0.85, reverbDecay: 22, vol: 0.65,
          crush: 8, chorus: 0.45, phaser: 0.55, delay: 0.55, delayTime: 0.55, delayFb: 0.6 } },
  { id: 'f-ps2dream',   name: 'PS2 Dream Lab',   factory: true, paulMode: false,
    fx: { drive: 0.12, bite: 2, cutoff: 5500, resonance: 1.5, paul: 0.5, rate: 0.9, reverbWet: 0.7, reverbDecay: 14, vol: 0.7,
          crush: 6, chorus: 0.65, phaser: 0.3, delay: 0.4, delayTime: 0.32, delayFb: 0.5 } },
  { id: 'f-aether',     name: 'Aether',          factory: true, paulMode: true,
    fx: { drive: 0.05, bite: 2, cutoff: 9500, resonance: 1, paul: 1.0, rate: 0.3, reverbWet: 0.95, reverbDecay: 28, vol: 0.6,
          crush: 12, chorus: 0.7, phaser: 0.4, delay: 0.55, delayTime: 0.85, delayFb: 0.55 } },
  { id: 'f-tape',       name: 'Tape Memory',     factory: true, paulMode: false,
    fx: { drive: 0.22, bite: 5, cutoff: 4200, resonance: 2, paul: 0.45, rate: 0.85, reverbWet: 0.6, reverbDecay: 10, vol: 0.7,
          crush: 7, chorus: 0.5, phaser: 0.2, delay: 0.45, delayTime: 0.42, delayFb: 0.55 } },
  { id: 'f-naturefog',  name: 'Nature Fog',      factory: true, paulMode: true,
    fx: { drive: 0.08, bite: 2, cutoff: 3500, resonance: 1.5, paul: 0.95, rate: 0.22, reverbWet: 0.8, reverbDecay: 24, vol: 0.7,
          crush: 12, chorus: 0.55, phaser: 0.6, delay: 0.3, delayTime: 0.7, delayFb: 0.5 } },
]

// Backfill missing FX fields on existing factory presets defined above (so they all type-check with new fields)
FACTORY_PRESETS.forEach(p => { p.fx = { ...FX_DEFAULTS, ...p.fx } })

const USER_PRESETS_KEY = 'synth-user-presets'

function loadUserPresets(): SynthPreset[] {
  try { return JSON.parse(localStorage.getItem(USER_PRESETS_KEY) || '[]') } catch { return [] }
}
function saveUserPresets(list: SynthPreset[]) {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list))
}

type Fx = {
  bitcrusher: Tone.BitCrusher
  distortion: Tone.Distortion
  chebyshev: Tone.Chebyshev
  filter: Tone.Filter
  chorus: Tone.Chorus
  phaser: Tone.Phaser
  delay: Tone.PingPongDelay
  reverb: Tone.Reverb
  analyser: Tone.Analyser
}
type Engine = {
  fx: Fx
  polySynth: Tone.PolySynth
  player: Tone.GrainPlayer | null
}

/* ── YT downloader (mini) ─────────────────────────────────────────── */

function YtDownloader({ onLoaded, disabled }: {
  onLoaded: (url: string, label: string) => void; disabled?: boolean
}) {
  const [url, setUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'err'>('idle')
  const [err, setErr] = useState('')

  async function go() {
    const u = url.trim(); if (!u) return
    setState('loading'); setErr('')
    try {
      const params = new URLSearchParams({ url: u })
      if (start.trim()) params.set('start', start.trim())
      if (end.trim()) params.set('end', end.trim())
      const r = await fetch(`${API}/api/yt-download?${params}`)
      const d = await r.json()
      if (d.error) { setState('err'); setErr(d.error); return }
      const label = u.split('v=')[1]?.slice(0, 11) || 'yt-sample'
      onLoaded(`${API}/api/preview?path=${encodeURIComponent(d.path)}`, label)
      setState('idle')
    } catch (e) { setState('err'); setErr(String(e)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
      padding: '8px 10px', borderRadius: 8,
      background: 'rgba(255,0,0,0.04)', border: '1px solid rgba(255,80,80,0.14)' }}>
      <input value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        placeholder="https://youtube.com/watch?v=…"
        style={{ ...inp, fontSize: 'var(--fs-base)' }} />
      <div style={{ display: 'flex', gap: 4 }}>
        <input value={start} onChange={e => setStart(e.target.value)}
          placeholder="start  0:30" style={{ ...inp, flex: 1, fontSize: 'var(--fs-sm)' }} />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', alignSelf: 'center' }}>→</span>
        <input value={end} onChange={e => setEnd(e.target.value)}
          placeholder="end  1:45" style={{ ...inp, flex: 1, fontSize: 'var(--fs-sm)' }} />
        <button onClick={go} disabled={!url.trim() || disabled || state === 'loading'}
          style={{ ...miniBtn, padding: '3px 10px', fontSize: 'var(--fs-sm)',
            background: state === 'loading' ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.7)',
            color: state === 'loading' ? 'var(--text-20)' : '#fff' }}>
          {state === 'loading' ? '⏳' : '↓'}
        </button>
      </div>
      {state === 'err' && (
        <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444', fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err}>{err}</span>
      )}
    </div>
  )
}

/* ── Preset menu (popup) ──────────────────────────────────────────── */

function PresetMenu({
  factory, user, current, anchorRef, onApply, onSave, onDelete, onClose,
}: {
  factory: SynthPreset[]; user: SynthPreset[]; current: SynthPreset | null
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onApply: (p: SynthPreset) => void; onSave: (name: string) => void
  onDelete: (id: string) => void; onClose: () => void
}) {
  const [name, setName] = useState('')
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const popH = 380
    if (spaceBelow >= popH + 8) setPos({ top: r.bottom + 4, left: r.left })
    else setPos({ bottom: window.innerHeight - r.top + 4, left: r.left })
  }, [anchorRef])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={popRef} onMouseDown={e => e.stopPropagation()} style={{
      position: 'fixed', zIndex: 9999, width: 260, ...pos,
      borderRadius: 12, padding: 10,
      background: 'linear-gradient(180deg,#1c1d20,#141517)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); setName('') } }}
          placeholder="Save current as…" autoFocus
          style={{ ...inp, flex: 1, fontSize: 'var(--fs-md)' }} />
        <button onClick={() => { if (name.trim()) { onSave(name.trim()); setName('') } }}
          disabled={!name.trim()}
          style={{
            padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'linear-gradient(180deg,#e5e7eb,#9ca3af)', color: '#000',
            fontWeight: 800, fontSize: 'var(--fs-md)',
          }}>+</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 280, overflowY: 'auto' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.2em',
          color: 'var(--text-20)', textTransform: 'uppercase', padding: '4px 6px 2px' }}>Factory</div>
        {factory.map(p => (
          <PresetRow key={p.id} preset={p} active={current?.id === p.id} onApply={() => { onApply(p); onClose() }} />
        ))}

        {user.length > 0 && (
          <>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.2em',
              color: 'var(--text-20)', textTransform: 'uppercase', padding: '8px 6px 2px' }}>User</div>
            {user.map(p => (
              <PresetRow key={p.id} preset={p} active={current?.id === p.id}
                onApply={() => { onApply(p); onClose() }}
                onDelete={() => onDelete(p.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PresetRow({ preset, active, onApply, onDelete }: {
  preset: SynthPreset; active: boolean; onApply: () => void; onDelete?: () => void
}) {
  const tag = preset.paulMode ? '∿' : null
  const hasSample = !!preset.source
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 9px', borderRadius: 8,
      background: active ? 'rgba(0,184,96,0.12)' : 'rgba(255,255,255,0.03)',
      border: active ? '1px solid rgba(0,184,96,0.3)' : '1px solid rgba(255,255,255,0.04)',
    }}>
      <button onClick={onApply} title={`Apply "${preset.name}"`}
        style={{
          flex: 1, textAlign: 'left', border: 'none', background: 'none',
          color: active ? '#fff' : 'var(--text-70)',
          fontSize: 'var(--fs-md)', fontWeight: 700, cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
        {active ? '● ' : '▶ '}{preset.name}
      </button>
      {tag && <span style={{ fontSize: 'var(--fs-xs)', color: '#a78bfa', fontWeight: 900 }}>{tag}</span>}
      {hasSample && <span title="Has sample" style={{ fontSize: 'var(--fs-xs)', color: '#06b6d4', fontWeight: 900 }}>♪</span>}
      {onDelete && (
        <button onClick={onDelete} title="Delete"
          style={{ border: 'none', background: 'none', color: 'rgba(239,68,68,0.6)',
            fontSize: 'var(--fs-md)', fontWeight: 900, cursor: 'pointer', padding: 2 }}>✕</button>
      )}
    </div>
  )
}

/* ── Panel ─────────────────────────────────────────────────────────── */

export function SynthPanel({ onClose, instanceId = 'synth' }: { onClose: () => void; instanceId?: string }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geoKey = instanceId === 'synth' ? 'synth' : instanceId
  const panelId = instanceId
  const geo = loadGeo(geoKey, { x: 480 + Math.random() * 40, y: 100 + Math.random() * 40, w: 520, h: 0 })

  const [fx, setFx] = useState<FxParams>(FX_DEFAULTS)
  const [paulMode, setPaulMode] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [srcLabel, setSrcLabel] = useState('')
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set())
  const [showYt, setShowYt] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recElapsed, setRecElapsed] = useState(0)
  const [recStatus, setRecStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Presets
  const [userPresets, setUserPresets] = useState<SynthPreset[]>(loadUserPresets)
  const [showPresets, setShowPresets] = useState(false)
  const [currentPresetId, setCurrentPresetId] = useState<string | null>('f-init')
  const presetBtnRef = useRef<HTMLButtonElement>(null)

  // Sequencer — multi-loop
  const [loops, setLoops] = useState<SeqLoop[]>([{ steps: [], muted: false }])
  const [activeLoopIdx, setActiveLoopIdx] = useState(0)
  const [seqPlaying, setSeqPlaying] = useState(false)
  const [seqSteps, setSeqSteps] = useState<number[]>([-1]) // per-loop step index for UI
  const [seqBpm, setSeqBpm] = useState(80)
  const [seqGate, setSeqGate] = useState(0.85)
  const seqIntervalRef = useRef<number | null>(null)
  const seqStepIdxRefs = useRef<number[]>([0])
  const loopsRef = useRef<SeqLoop[]>(loops)
  loopsRef.current = loops
  const seqBpmRef = useRef(seqBpm)
  seqBpmRef.current = seqBpm
  const seqGateRef = useRef(seqGate)
  seqGateRef.current = seqGate
  const activeSequence = loops[activeLoopIdx]?.steps ?? []
  const totalSteps = loops.reduce((s, l) => s + (l.muted ? 0 : l.steps.length), 0)
  const hasAnyContent = loops.some(l => l.steps.length > 0 || (l.freestyle && l.freestyle.length > 0))

  // Freestyle loop recording
  const [freestyleRec, setFreestyleRec] = useState(false)
  const freestyleStartRef = useRef(0)
  const freestyleEventsRef = useRef<TimedEvent[]>([])
  const freestyleNoteStartRef = useRef<Map<string, number>>(new Map())
  const freestyleTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const engineRef = useRef<Engine | null>(null)
  const fxRef = useRef(fx); fxRef.current = fx
  const statusRef = useRef(status); statusRef.current = status
  // Force re-render of Scope when engine becomes available (analyser ref change)
  const [, setEngineTick] = useState(0)

  useEffect(() => { saveUserPresets(userPresets) }, [userPresets])

  /* register capture */
  useEffect(() => {
    captureRegistry.register({ id: panelId, label: `Synth${panelId !== 'synth' ? ` ${panelId.slice(-4)}` : ''}`, getStream: getSynthCaptureStream, setMonitor: setSynthMonitor })
    return () => {
      captureRegistry.unregister(panelId)
      synthMonitorEnabled = true  // reset for next mount
    }
  }, [])

  /* cleanup on unmount */
  useEffect(() => () => { disposeEngine() }, [])

  /* listen for paulstretch → synth */
  useEffect(() => {
    function onPs(e: Event) {
      const { url, label } = (e as CustomEvent).detail
      loadFromUrl(url, label)
    }
    window.addEventListener('synth:load', onPs)
    return () => window.removeEventListener('synth:load', onPs)
  }, [])

  function disposePlayer() {
    const e = engineRef.current; if (!e || !e.player) return
    try { e.player.stop() } catch{ /* noop */ }
    try { e.player.dispose() } catch{ /* noop */ }
    e.player = null
  }

  function disposeEngine() {
    const e = engineRef.current; if (!e) return
    disposePlayer()
    try { e.polySynth.releaseAll() } catch{ /* noop */ }
    try { e.polySynth.dispose() } catch{ /* noop */ }
    try { e.fx.bitcrusher.dispose() } catch{ /* noop */ }
    try { e.fx.distortion.dispose() } catch{ /* noop */ }
    try { e.fx.chebyshev.dispose() } catch{ /* noop */ }
    try { e.fx.filter.dispose() } catch{ /* noop */ }
    try { e.fx.chorus.dispose() } catch{ /* noop */ }
    try { e.fx.phaser.dispose() } catch{ /* noop */ }
    try { e.fx.delay.dispose() } catch{ /* noop */ }
    try { e.fx.reverb.dispose() } catch{ /* noop */ }
    try { e.fx.analyser.dispose() } catch{ /* noop */ }
    try { synthOutputGain?.dispose() } catch{ /* noop */ }
    synthOutputGain = null
    engineRef.current = null
  }

  async function ensureEngine(): Promise<Engine> {
    if (engineRef.current) return engineRef.current
    await Tone.start()
    ensureSynthTap()
    const p = fxRef.current
    const bitcrusher = new Tone.BitCrusher(Math.max(4, Math.round(p.crush)))
    bitcrusher.wet.value = crushWet(p.crush)
    const distortion = new Tone.Distortion({ distortion: p.drive, wet: 1 })
    const chebyshev = new Tone.Chebyshev({ order: Math.max(1, Math.round(p.bite)), wet: 0.6 })
    const filter = new Tone.Filter({ frequency: p.cutoff, type: 'lowpass', Q: p.resonance })
    const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 4, depth: 0.7, feedback: 0.15, wet: p.chorus }).start()
    const phaser = new Tone.Phaser({ frequency: 0.3, octaves: 3, baseFrequency: 350, wet: p.phaser })
    const delay = new Tone.PingPongDelay({ delayTime: p.delayTime, feedback: p.delayFb, wet: p.delay })
    const reverb = new Tone.Reverb({ decay: p.reverbDecay, wet: p.reverbWet })
    await reverb.generate()
    const analyser = new Tone.Analyser('waveform', 1024)

    // Output gain — muted when recorder is active and Synth is deselected
    const outputGain = new Tone.Gain(synthMonitorEnabled ? 1 : 0)
    synthOutputGain = outputGain

    // Chain: bitcrusher → dist → cheby → filter → chorus → phaser → delay → reverb → analyser → outputGain → out
    bitcrusher.chain(distortion, chebyshev, filter, chorus, phaser, delay, reverb, analyser, outputGain, Tone.getDestination())
    if (synthCaptureDest) analyser.connect(synthCaptureDest)

    // PolySynth (FM-ish warm pad) routed through FX head
    const polySynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2.5,
      modulationIndex: 6,
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 1.2 },
      modulationEnvelope: { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 },
    })
    polySynth.volume.value = Tone.gainToDb(p.vol * 0.55)
    polySynth.connect(bitcrusher)

    engineRef.current = {
      fx: { bitcrusher, distortion, chebyshev, filter, chorus, phaser, delay, reverb, analyser },
      polySynth, player: null,
    }
    setEngineTick(t => t + 1)
    return engineRef.current
  }

  async function loadFromUrl(url: string, label: string) {
    setStatus('loading'); setSrcLabel(label); setLoadedUrl(null)
    try {
      const e = await ensureEngine()
      disposePlayer()
      const p = fxRef.current
      const player = new Tone.GrainPlayer({ url, loop: true })
      await Tone.loaded()
      player.grainSize = p.paul
      player.overlap = Math.min(0.5, p.paul * 0.55)
      player.playbackRate = p.rate
      player.detune = 0
      player.volume.value = Tone.gainToDb(p.vol)
      player.connect(e.fx.bitcrusher)
      e.player = player
      setLoadedUrl(url); setStatus('ready')
    } catch (err) {
      console.error('SynthPanel load error', err); setStatus('idle')
    }
  }

  async function handleFile(file: File) {
    const blob = URL.createObjectURL(file)
    await loadFromUrl(blob, file.name.replace(/\.[^.]+$/, ''))
  }

  function handleUrlLoad() {
    const raw = urlInput.trim(); if (!raw) return
    const url = raw.startsWith('http') ? raw : `${API}/api/preview?path=${encodeURIComponent(raw)}`
    loadFromUrl(url, raw.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'sample')
  }

  /* live param updates */
  function updateFx(patch: Partial<FxParams>) {
    setFx(prev => {
      const next = { ...prev, ...patch }
      const e = engineRef.current
      if (e) {
        if (patch.drive !== undefined) e.fx.distortion.distortion = patch.drive
        if (patch.bite !== undefined) e.fx.chebyshev.order = Math.max(1, Math.round(patch.bite))
        if (patch.cutoff !== undefined) e.fx.filter.frequency.rampTo(patch.cutoff, 0.05)
        if (patch.resonance !== undefined) e.fx.filter.Q.value = patch.resonance
        if (patch.reverbWet !== undefined) e.fx.reverb.wet.rampTo(patch.reverbWet, 0.05)
        if (patch.crush !== undefined) {
          const b = Math.max(4, Math.round(patch.crush))
          e.fx.bitcrusher.bits.value = b
          e.fx.bitcrusher.wet.rampTo(crushWet(b), 0.05)
        }
        if (patch.chorus !== undefined) e.fx.chorus.wet.rampTo(patch.chorus, 0.05)
        if (patch.phaser !== undefined) e.fx.phaser.wet.rampTo(patch.phaser, 0.05)
        if (patch.delay !== undefined) e.fx.delay.wet.rampTo(patch.delay, 0.05)
        if (patch.delayTime !== undefined) e.fx.delay.delayTime.rampTo(patch.delayTime, 0.05)
        if (patch.delayFb !== undefined) e.fx.delay.feedback.rampTo(patch.delayFb, 0.05)
        if (e.player) {
          if (patch.paul !== undefined) {
            e.player.grainSize = patch.paul
            e.player.overlap = Math.min(0.5, patch.paul * 0.55)
          }
          if (patch.rate !== undefined) e.player.playbackRate = patch.rate
          if (patch.vol !== undefined) e.player.volume.rampTo(Tone.gainToDb(patch.vol), 0.05)
        }
        if (patch.vol !== undefined) e.polySynth.volume.rampTo(Tone.gainToDb(patch.vol * 0.55), 0.05)
      }
      return next
    })
  }

  function togglePaulMode() {
    const enable = !paulMode
    setPaulMode(enable)
    const m = enable ? PAUL_MODE : NORMAL_MODE
    updateFx({ paul: m.grainSize, rate: m.playbackRate })
  }

  /* ── Sequencer (multi-loop) ── */

  function toggleInSequence(noteName: string, cents: number) {
    setLoops(prev => prev.map((loop, i) => {
      if (i !== activeLoopIdx) return loop
      const idx = loop.steps.findIndex(s => s.noteName === noteName)
      if (idx >= 0) return { ...loop, steps: loop.steps.filter((_, j) => j !== idx) }
      return { ...loop, steps: [...loop.steps, { noteName, cents }] }
    }))
  }

  function addLoop() {
    setLoops(prev => {
      if (prev.length >= LOOP_COLORS.length) return prev
      return [...prev, { steps: [], muted: false }]
    })
    setActiveLoopIdx(loops.length)
    seqStepIdxRefs.current = [...seqStepIdxRefs.current, 0]
    setSeqSteps(prev => [...prev, -1])
  }

  function removeLoop(idx: number) {
    if (loops.length <= 1) return
    stopSeq()
    setLoops(prev => prev.filter((_, i) => i !== idx))
    seqStepIdxRefs.current = seqStepIdxRefs.current.filter((_, i) => i !== idx)
    setSeqSteps(prev => prev.filter((_, i) => i !== idx))
    setActiveLoopIdx(i => i >= idx ? Math.max(0, i - 1) : i)
  }

  function toggleMuteLoop(idx: number) {
    setLoops(prev => prev.map((l, i) => i === idx ? { ...l, muted: !l.muted } : l))
  }

  function clearActiveLoop() {
    stopSeq()
    setLoops(prev => prev.map((l, i) => i === activeLoopIdx ? { ...l, steps: [] } : l))
  }

  function clearAllLoops() {
    stopSeq()
    setLoops([{ steps: [], muted: false }])
    setActiveLoopIdx(0)
    seqStepIdxRefs.current = [0]
    setSeqSteps([-1])
  }

  function stopSeq() {
    if (seqIntervalRef.current != null) {
      window.clearInterval(seqIntervalRef.current)
      seqIntervalRef.current = null
    }
    stopFreestylePlayback()
    seqStepIdxRefs.current = seqStepIdxRefs.current.map(() => 0)
    setSeqSteps(prev => prev.map(() => -1))
    setSeqPlaying(false)
    const e = engineRef.current
    if (e) try { e.polySynth.releaseAll() } catch{ /* noop */ }
    setActiveNotes(new Set())
  }

  function playNote(noteName: string, cents: number, noteMs: number) {
    const e = engineRef.current; if (!e) return
    if (e.player && statusRef.current === 'playing') {
      e.player.detune = cents
    } else {
      try { e.polySynth.triggerAttackRelease(noteName, noteMs / 1000) } catch{ /* noop */ }
    }
    setActiveNotes(prev => { const n = new Set(prev); n.add(noteName); return n })
    window.setTimeout(() => {
      setActiveNotes(prev => { const n = new Set(prev); n.delete(noteName); return n })
    }, noteMs)
  }

  function tick() {
    const allLoops = loopsRef.current
    const e = engineRef.current; if (!e) return
    const stepMs = 60000 / seqBpmRef.current
    const noteMs = Math.max(20, stepMs * Math.max(0.02, seqGateRef.current))
    const newSteps = [...seqStepIdxRefs.current]
    const uiSteps: number[] = []

    for (let i = 0; i < allLoops.length; i++) {
      const loop = allLoops[i]
      if (loop.muted || loop.steps.length === 0) { uiSteps.push(-1); continue }
      const idx = (newSteps[i] ?? 0) % loop.steps.length
      newSteps[i] = idx + 1
      uiSteps.push(idx)
      const { noteName, cents } = loop.steps[idx]
      playNote(noteName, cents, noteMs)
    }
    seqStepIdxRefs.current = newSteps
    setSeqSteps(uiSteps)
  }

  async function startSeq() {
    if (!hasAnyContent) return
    await ensureEngine()
    stopSeq()
    // Start step-sequenced loops
    if (totalSteps > 0) {
      tick()
      seqIntervalRef.current = window.setInterval(tick, 60000 / seqBpmRef.current)
    }
    // Start freestyle loops
    for (let i = 0; i < loopsRef.current.length; i++) {
      const l = loopsRef.current[i]
      if (!l.muted && l.freestyle && l.freestyle.length > 0) playFreestyleLoop(i)
    }
    setSeqPlaying(true)
  }

  useEffect(() => {
    if (!seqPlaying) return
    if (seqIntervalRef.current != null) window.clearInterval(seqIntervalRef.current)
    const id = window.setInterval(tick, 60000 / seqBpm)
    seqIntervalRef.current = id
    return () => { window.clearInterval(id) }
  }, [seqBpm, seqPlaying])

  // Cleanup sequencer on unmount
  useEffect(() => () => stopSeq(), [])

  // Cleanup recorder on unmount
  useEffect(() => () => { stopRecording() }, [])

  async function startRecording() {
    const eng = await ensureEngine()
    ensureSynthTap()
    // Connect analyser → capture dest if not already connected
    if (eng && synthCaptureDest) {
      try { eng.fx.analyser.connect(synthCaptureDest) } catch { /* already connected */ }
    }
    const stream = getSynthCaptureStream()
    if (!stream) return
    recChunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      const blob = new Blob(recChunksRef.current, { type: mimeType })
      if (blob.size === 0) return
      setRecStatus('saving')
      try {
        const fd = new FormData()
        fd.append('file', blob, `synth-rec-${Date.now()}.webm`)
        const upRes = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
        if (!upRes.ok) { setRecStatus('error'); return }
        const { path: filePath } = await upRes.json()

        const convRes = await fetch(`${API}/api/convert/wav-to-mp3`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, bitrate: '192k' }),
        })
        if (!convRes.ok) { setRecStatus('error'); return }
        const { job_id: jobId } = await convRes.json()

        for (let i = 0; i < 60; i++) {
          const s = await fetch(`${API}/api/convert/status/${jobId}`).then(r => r.json())
          if (s.status === 'done') { setRecStatus('saved'); setTimeout(() => setRecStatus('idle'), 3000); return }
          if (s.status === 'error') { setRecStatus('error'); return }
          await new Promise(r => setTimeout(r, 500))
        }
        setRecStatus('error')
      } catch { setRecStatus('error') }
    }
    recorder.start(200)
    recorderRef.current = recorder
    setIsRecording(true); setRecElapsed(0)
    const t0 = Date.now()
    recTimerRef.current = setInterval(() => setRecElapsed(Math.floor((Date.now() - t0) / 1000)), 500)
  }

  function stopRecording() {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setIsRecording(false); setRecElapsed(0)
  }

  function startFreestyleRec() {
    freestyleEventsRef.current = []
    freestyleNoteStartRef.current.clear()
    freestyleStartRef.current = performance.now()
    setFreestyleRec(true)
  }

  function stopFreestyleRec() {
    const events = freestyleEventsRef.current
    const loopLen = performance.now() - freestyleStartRef.current
    // Close any still-held notes
    freestyleNoteStartRef.current.forEach((startMs, noteName) => {
      const cents = NOTE_CENTS[noteName as keyof typeof NOTE_CENTS] ?? 0
      events.push({ noteName, cents, timeMs: startMs, durationMs: loopLen - startMs })
    })
    freestyleNoteStartRef.current.clear()
    setFreestyleRec(false)
    if (events.length === 0) return
    setLoops(prev => prev.map((l, i) =>
      i === activeLoopIdx ? { ...l, freestyle: events, freestyleLenMs: loopLen } : l
    ))
  }

  function freestyleNoteOn(noteName: string) {
    if (!freestyleRec) return
    const t = performance.now() - freestyleStartRef.current
    freestyleNoteStartRef.current.set(noteName, t)
  }

  function freestyleNoteOff(noteName: string) {
    if (!freestyleRec) return
    const startMs = freestyleNoteStartRef.current.get(noteName)
    if (startMs === undefined) return
    freestyleNoteStartRef.current.delete(noteName)
    const t = performance.now() - freestyleStartRef.current
    const cents = NOTE_CENTS[noteName as keyof typeof NOTE_CENTS] ?? 0
    freestyleEventsRef.current.push({ noteName, cents, timeMs: startMs, durationMs: t - startMs })
  }

  // Playback for freestyle loops — schedule all events in a cycle via setTimeout
  function playFreestyleLoop(loopIdx: number) {
    const loop = loopsRef.current[loopIdx]
    if (!loop?.freestyle || loop.freestyle.length === 0 || !loop.freestyleLenMs) return
    const e = engineRef.current; if (!e) return
    const events = loop.freestyle
    const lenMs = loop.freestyleLenMs

    function scheduleCycle() {
      if (!loopsRef.current[loopIdx] || loopsRef.current[loopIdx].muted) return
      const fl = loopsRef.current[loopIdx].freestyle
      if (!fl || fl.length === 0) return
      for (const ev of fl) {
        const tid = setTimeout(() => {
          if (loopsRef.current[loopIdx]?.muted) return
          playNote(ev.noteName, ev.cents, Math.max(20, ev.durationMs))
        }, ev.timeMs)
        freestyleTimersRef.current.set(tid as unknown as number, tid)
      }
      const nextTid = setTimeout(scheduleCycle, lenMs)
      freestyleTimersRef.current.set(nextTid as unknown as number, nextTid)
    }
    scheduleCycle()
  }

  function stopFreestylePlayback() {
    freestyleTimersRef.current.forEach(tid => clearTimeout(tid))
    freestyleTimersRef.current.clear()
  }

  function randomize() {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const rndLog = (a: number, b: number) => Math.exp(rnd(Math.log(a), Math.log(b)))
    // Atmospheric FX ~ each has 50% chance of being engaged at all
    const chorusOn = Math.random() < 0.55
    const phaserOn = Math.random() < 0.45
    const delayOn = Math.random() < 0.6
    const crushOn = Math.random() < 0.35
    const next: FxParams = {
      drive: rnd(0, 0.55),
      bite: Math.round(rnd(1, 18)),
      cutoff: rndLog(400, 15000),
      resonance: rnd(0, 8),
      paul: rnd(0.1, 1.2),
      rate: rndLog(0.15, 1.5),
      reverbWet: rnd(0.3, 0.9),
      reverbDecay: rnd(3, 22),
      vol: rnd(0.5, 0.85),
      crush: crushOn ? Math.round(rnd(4, 8)) : 12,
      chorus: chorusOn ? rnd(0.3, 0.85) : 0,
      phaser: phaserOn ? rnd(0.25, 0.7) : 0,
      delay: delayOn ? rnd(0.2, 0.65) : 0,
      delayTime: rndLog(0.1, 1.2),
      delayFb: rnd(0.25, 0.7),
    }
    const nextPaulMode = Math.random() < 0.3
    setCurrentPresetId(null)
    setPaulMode(nextPaulMode)
    setFx(next)
    const e = engineRef.current
    if (e) {
      e.fx.distortion.distortion = next.drive
      e.fx.chebyshev.order = next.bite
      e.fx.filter.frequency.rampTo(next.cutoff, 0.1)
      e.fx.filter.Q.value = next.resonance
      e.fx.reverb.wet.rampTo(next.reverbWet, 0.1)
      e.fx.bitcrusher.bits.value = next.crush
      e.fx.bitcrusher.wet.rampTo(crushWet(next.crush), 0.1)
      e.fx.chorus.wet.rampTo(next.chorus, 0.1)
      e.fx.phaser.wet.rampTo(next.phaser, 0.1)
      e.fx.delay.wet.rampTo(next.delay, 0.1)
      e.fx.delay.delayTime.rampTo(next.delayTime, 0.1)
      e.fx.delay.feedback.rampTo(next.delayFb, 0.1)
      e.polySynth.volume.rampTo(Tone.gainToDb(next.vol * 0.55), 0.1)
      if (e.player) {
        e.player.grainSize = next.paul
        e.player.overlap = Math.min(0.5, next.paul * 0.55)
        e.player.playbackRate = next.rate
        e.player.volume.rampTo(Tone.gainToDb(next.vol), 0.1)
      }
    }
  }

  /* ── Preset actions ── */

  async function applyPreset(p: SynthPreset) {
    setCurrentPresetId(p.id)
    setPaulMode(p.paulMode)
    // Merge with defaults so older presets without new FX fields still work
    const fxFull: FxParams = { ...FX_DEFAULTS, ...p.fx }
    setFx(fxFull)
    const e = engineRef.current
    if (e) {
      e.fx.distortion.distortion = fxFull.drive
      e.fx.chebyshev.order = Math.max(1, Math.round(fxFull.bite))
      e.fx.filter.frequency.rampTo(fxFull.cutoff, 0.05)
      e.fx.filter.Q.value = fxFull.resonance
      e.fx.reverb.wet.rampTo(fxFull.reverbWet, 0.05)
      const b = Math.max(4, Math.round(fxFull.crush))
      e.fx.bitcrusher.bits.value = b
      e.fx.bitcrusher.wet.rampTo(crushWet(b), 0.05)
      e.fx.chorus.wet.rampTo(fxFull.chorus, 0.05)
      e.fx.phaser.wet.rampTo(fxFull.phaser, 0.05)
      e.fx.delay.wet.rampTo(fxFull.delay, 0.05)
      e.fx.delay.delayTime.rampTo(fxFull.delayTime, 0.05)
      e.fx.delay.feedback.rampTo(fxFull.delayFb, 0.05)
      e.polySynth.volume.rampTo(Tone.gainToDb(fxFull.vol * 0.55), 0.05)
      if (e.player) {
        e.player.grainSize = fxFull.paul
        e.player.overlap = Math.min(0.5, fxFull.paul * 0.55)
        e.player.playbackRate = fxFull.rate
        e.player.volume.rampTo(Tone.gainToDb(fxFull.vol), 0.05)
      }
    }
    if (p.source && p.source.url) {
      await loadFromUrl(p.source.url, p.source.label)
    }
  }

  function isSaveableUrl(url: string | null): boolean {
    return !!url && (url.startsWith('http') || url.startsWith('/'))
  }

  function savePreset(name: string) {
    const source = isSaveableUrl(loadedUrl)
      ? { url: loadedUrl as string, label: srcLabel }
      : null
    const p: SynthPreset = {
      id: `u-${Date.now()}`,
      name,
      fx: { ...fx },
      paulMode,
      source,
    }
    setUserPresets(prev => [...prev, p])
    setCurrentPresetId(p.id)
  }

  function deletePreset(id: string) {
    setUserPresets(prev => prev.filter(p => p.id !== id))
    if (currentPresetId === id) setCurrentPresetId(null)
  }

  const currentPreset = currentPresetId
    ? FACTORY_PRESETS.find(p => p.id === currentPresetId) ?? userPresets.find(p => p.id === currentPresetId) ?? null
    : null

  async function toggleDrone() {
    const e = await ensureEngine()
    if (!e.player) return
    if (status === 'playing') { e.player.stop(); setStatus('ready') }
    else { e.player.start(); setStatus('playing') }
  }

  const noteOn = useCallback(async (noteName: string, cents: number) => {
    setActiveNotes(prev => { const n = new Set(prev); n.add(noteName); return n })
    freestyleNoteOn(noteName)
    const e = await ensureEngine()
    if (e.player) {
      // Auto-start drone if sample is loaded but not playing yet
      if (statusRef.current !== 'playing') {
        try { e.player.start(); setStatus('playing') } catch { /* noop */ }
      }
      e.player.detune = cents
      return
    }
    try { e.polySynth.triggerAttack(noteName) } catch (err) { console.warn('synth attack err', err) }
  }, [])

  const noteOff = useCallback((noteName: string) => {
    setActiveNotes(prev => { const n = new Set(prev); n.delete(noteName); return n })
    freestyleNoteOff(noteName)
    const e = engineRef.current; if (!e) return
    if (e.player && statusRef.current === 'playing') return
    try { e.polySynth.triggerRelease(noteName) } catch{ /* noop */ }
  }, [])

  /* Physical keyboard → noteOn/Off (sustain while held) */
  useEffect(() => {
    const pressed = new Set<string>()
    function onDown(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement) return
      const k = ev.key.toLowerCase()
      if (pressed.has(k)) return // ignore OS auto-repeat
      const note = KEY_NOTE[k]
      if (note) { pressed.add(k); noteOn(note, NOTE_CENTS[note]) }
    }
    function onUp(ev: KeyboardEvent) {
      const k = ev.key.toLowerCase()
      if (!pressed.has(k)) return
      pressed.delete(k)
      const note = KEY_NOTE[k]
      if (note) noteOff(note)
    }
    function onBlur() {
      // release everything if window loses focus
      pressed.forEach(k => { const n = KEY_NOTE[k]; if (n) noteOff(n) })
      pressed.clear()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [noteOn, noteOff])

  const accent = paulMode ? '#a78bfa' : '#00b860'
  const hasSample = !!loadedUrl
  const droneReady = hasSample && status !== 'loading'
  const playing = status === 'playing'

  return (
    <CaptureIdContext.Provider value={panelId}>
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || 520, height: 'auto' }}
      minWidth={460} maxWidth={760}
      enableResizing={{ right: true, left: true }}
      bounds={undefined}
      dragHandleClassName="synth-drag"
      className={`panel-drag${isDragging(panelId) ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront(panelId)}
      onDragStop={(_e, d) => { saveGeo(geoKey, { x: d.x, y: d.y }); endDrag(panelId) }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo(geoKey, { w: ref.offsetWidth, x: pos.x, y: pos.y })}
      style={{ zIndex: zOf(panelId, 15) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)', padding: '14px 18px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <PanelHeader title="// Synth" onClose={onClose} className="synth-drag">
          <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button ref={presetBtnRef} onClick={() => setShowPresets(v => !v)}
              title="Patches"
              style={{
                ...miniBtn, padding: '3px 10px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: showPresets ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                color: showPresets ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
                gap: 5,
              }}>
              <span style={{ fontSize: 'var(--fs-base)' }}>≡</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                {currentPreset?.name ?? 'PATCHES'}
              </span>
            </button>
            <button onClick={randomize}
              title="Randomize all parameters"
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: 'rgba(245,158,11,0.15)',
                color: '#f59e0b',
                letterSpacing: '0.15em',
              }}>
              🎲 RND
            </button>
            <button onClick={togglePaulMode}
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: paulMode ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.06)',
                color: paulMode ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}
              title="Toggle Paul Mode (long grains, slow rate)">
              ∿ PAUL
            </button>
            <button onClick={toggleDrone} disabled={!droneReady}
              title={hasSample ? 'Toggle sample drone' : 'Load a sample first to enable drone'}
              style={{
                ...miniBtn, padding: '3px 12px', width: 'auto', fontSize: 'var(--fs-base)',
                background: playing ? accent : 'rgba(255,255,255,0.07)',
                color: playing ? '#000' : 'var(--text-40)',
                opacity: droneReady ? 1 : 0.35, fontWeight: 900,
              }}>
              {playing ? '⏹ DRONE' : '▶ DRONE'}
            </button>
            <button onClick={recStatus === 'saving' ? undefined : isRecording ? stopRecording : startRecording}
              title={isRecording ? `Recording… ${Math.floor(recElapsed / 60)}:${String(recElapsed % 60).padStart(2, '0')} — click to stop & save MP3` : recStatus === 'saving' ? 'Converting to MP3…' : recStatus === 'saved' ? 'Saved to assets!' : 'Record to MP3'}
              style={{
                ...miniBtn, padding: '3px 10px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: recStatus === 'saved' ? 'rgba(0,184,96,0.25)' : recStatus === 'saving' ? 'rgba(255,165,0,0.25)' : isRecording ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.15)',
                color: recStatus === 'saved' ? 'rgba(0,184,96,0.9)' : recStatus === 'saving' ? 'rgba(255,165,0,0.9)' : isRecording ? '#fff' : 'rgba(239,68,68,0.7)',
                fontWeight: 900, letterSpacing: '0.1em',
                animation: isRecording ? 'pulse-rec 1.2s ease-in-out infinite' : 'none',
                cursor: recStatus === 'saving' ? 'wait' : 'pointer',
              }}>
              {recStatus === 'saving' ? '⏳ MP3…' : recStatus === 'saved' ? '✓ SAVED' : isRecording ? `⏹ ${Math.floor(recElapsed / 60)}:${String(recElapsed % 60).padStart(2, '0')}` : '⏺ REC'}
            </button>
          </div>
        </PanelHeader>

        {/* Scope */}
        <Scope analyser={engineRef.current?.fx.analyser ?? null} color={accent} height={84} />

        {/* Status / src strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', borderRadius: 7,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'var(--text-40)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%',
            background: playing ? accent : hasSample ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.4)',
            boxShadow: playing ? `0 0 8px ${accent}` : 'none' }} />
          <span style={{ color: 'var(--text-20)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {hasSample ? 'sample' : 'osc'}
          </span>
          <span style={{ flex: 1, color: 'var(--text-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {srcLabel || 'press a-k or z-m to play notes — load sample for drone'}
          </span>
          {activeNotes.size > 0 && (
            <span style={{ color: accent, fontWeight: 900 }}>
              {[...activeNotes].slice(0, 4).join(' ')}{activeNotes.size > 4 ? '…' : ''}
            </span>
          )}
        </div>

        {/* Source row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
              onClick={e => e.stopPropagation()}
              placeholder="URL or server path…"
              style={inp} />
            <button onClick={handleUrlLoad} disabled={!urlInput.trim() || status === 'loading'}
              style={actionBtn}>↵</button>
            <button onClick={() => fileRef.current?.click()} disabled={status === 'loading'}
              style={actionBtn} title="Pick file">📁</button>
            <button onClick={() => setShowYt(v => !v)}
              style={{ ...actionBtn, color: showYt ? '#ef4444' : 'rgba(255,80,80,0.6)' }}
              title="YouTube">YT</button>
            <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.aif,.aiff,.webm"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          </div>
          {showYt && (
            <YtDownloader
              disabled={status === 'loading'}
              onLoaded={(url, label) => { loadFromUrl(url, label); setShowYt(false) }} />
          )}
        </div>

        {/* Knob rack — 2 rows × 5 = 10 knobs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, rowGap: 12,
          padding: '14px 8px 12px', borderRadius: 12,
          background: 'linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.15))',
          border: '1px solid rgba(255,255,255,0.04)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}>
          {/* Row 1 — drive / shape / filter / paul / vol */}
          <SynthKnob label="DRIVE" value={fx.drive} min={0} max={1} accent="#ef4444"
            fmt={v => `${Math.round(v * 100)}%`} onChange={v => updateFx({ drive: v })} />
          <SynthKnob label="BITE" value={fx.bite} min={1} max={50} accent="#f59e0b"
            fmt={v => String(Math.round(v))} onChange={v => updateFx({ bite: v })} />
          <SynthKnob label="CRUSH" value={fx.crush} min={4} max={12} accent="#fb923c"
            fmt={v => v >= 12 ? '—' : `${Math.round(v)}b`} onChange={v => updateFx({ crush: v })} />
          <SynthKnob label="CUTOFF" value={fx.cutoff} min={400} max={18000} accent="#06b6d4"
            fmt={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
            onChange={v => updateFx({ cutoff: v })} />
          <SynthKnob label="PAUL" value={fx.paul} min={0.05} max={1.5} accent="#a78bfa"
            fmt={v => `${v.toFixed(2)}s`} onChange={v => updateFx({ paul: v })} />

          {/* Row 2 — atmospheric */}
          <SynthKnob label="CHORUS" value={fx.chorus} min={0} max={1} accent="#34d399"
            fmt={v => v < 0.01 ? '—' : `${Math.round(v * 100)}%`}
            onChange={v => updateFx({ chorus: v })} />
          <SynthKnob label="PHASER" value={fx.phaser} min={0} max={1} accent="#c084fc"
            fmt={v => v < 0.01 ? '—' : `${Math.round(v * 100)}%`}
            onChange={v => updateFx({ phaser: v })} />
          <SynthKnob label="DELAY" value={fx.delay} min={0} max={1} accent="#facc15"
            fmt={v => v < 0.01 ? '—' : `${Math.round(v * 100)}%`}
            onChange={v => updateFx({ delay: v })} />
          <SynthKnob label="REVERB" value={fx.reverbWet} min={0} max={1} accent="#3b82f6"
            fmt={v => `${Math.round(v * 100)}%`} onChange={v => updateFx({ reverbWet: v })} />
          <SynthKnob label="VOL" value={fx.vol} min={0} max={1} accent={accent}
            fmt={v => `${Math.round(v * 100)}%`} onChange={v => updateFx({ vol: v })} />
        </div>

        {/* Secondary sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          <MiniSlider label="RES" value={fx.resonance} min={0} max={20} step={0.1}
            fmt={v => v.toFixed(1)} onChange={v => updateFx({ resonance: v })} />
          <MiniSlider label="RATE" value={fx.rate} min={0.05} max={2} step={0.01}
            fmt={v => `${v.toFixed(2)}×`} onChange={v => updateFx({ rate: v })} />
          <MiniSlider label="DECAY" value={fx.reverbDecay} min={0.5} max={30} step={0.5}
            fmt={v => `${v.toFixed(1)}s`} onChange={v => updateFx({ reverbDecay: v })} />
          <MiniSlider label="DLY TIME" value={fx.delayTime} min={0.05} max={1.5} step={0.01}
            fmt={v => `${v.toFixed(2)}s`} onChange={v => updateFx({ delayTime: v })} />
          <MiniSlider label="DLY FB" value={fx.delayFb} min={0} max={0.95} step={0.01}
            fmt={v => `${Math.round(v * 100)}%`} onChange={v => updateFx({ delayFb: v })} />
        </div>

        {/* Sequencer bar */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 5,
          padding: '7px 10px', borderRadius: 8,
          background: totalSteps > 0
            ? 'linear-gradient(90deg,rgba(167,139,250,0.08),rgba(167,139,250,0.02))'
            : 'rgba(255,255,255,0.02)',
          border: `1px solid ${totalSteps > 0 ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)'}`,
        }}>
          {/* Row 1: Loop slots + play + clear */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={seqPlaying ? stopSeq : startSeq}
              disabled={!hasAnyContent}
              style={{
                ...miniBtn, padding: '2px 8px', width: 'auto', fontSize: 'var(--fs-xs)',
                background: seqPlaying ? LOOP_COLORS[activeLoopIdx] : hasAnyContent ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.05)',
                color: seqPlaying ? '#000' : hasAnyContent ? '#a78bfa' : 'var(--text-20)',
                opacity: !hasAnyContent ? 0.4 : 1, fontWeight: 900,
              }}>
              {seqPlaying ? '⏹' : '▶'}
            </button>
            <button onClick={freestyleRec ? stopFreestyleRec : startFreestyleRec}
              title={freestyleRec ? 'Stop recording freestyle loop — play notes now!' : `Record freestyle loop into ${String.fromCharCode(65 + activeLoopIdx)}`}
              style={{
                ...miniBtn, padding: '2px 8px', width: 'auto', fontSize: 'var(--fs-xs)',
                background: freestyleRec ? 'rgba(239,68,68,0.8)' : 'rgba(239,68,68,0.12)',
                color: freestyleRec ? '#fff' : 'rgba(239,68,68,0.6)',
                fontWeight: 900,
                animation: freestyleRec ? 'pulse-rec 1.2s ease-in-out infinite' : 'none',
              }}>
              {freestyleRec ? '⏹ REC' : '⏺'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', flex: 1 }}>
              {loops.map((loop, i) => {
                const color = LOOP_COLORS[i % LOOP_COLORS.length]
                const isActive = i === activeLoopIdx
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <button
                      onClick={() => setActiveLoopIdx(i)}
                      onContextMenu={e => { e.preventDefault(); toggleMuteLoop(i) }}
                      title={`Loop ${String.fromCharCode(65 + i)} — ${loop.steps.length} steps${loop.freestyle?.length ? ` + ${loop.freestyle.length} freestyle` : ''}${loop.muted ? ' (muted)' : ''} · right-click: mute`}
                      style={{
                        ...miniBtn, padding: '2px 6px', width: 'auto', fontSize: 'var(--fs-2xs)',
                        background: isActive ? color : loop.muted ? 'rgba(255,255,255,0.03)' : `${color}22`,
                        color: isActive ? '#000' : loop.muted ? 'var(--text-20)' : color,
                        opacity: loop.muted ? 0.4 : 1,
                        border: isActive ? `1px solid ${color}` : '1px solid transparent',
                        fontWeight: 900,
                        textDecoration: loop.muted ? 'line-through' : 'none',
                      }}>
                      {String.fromCharCode(65 + i)}{loop.steps.length > 0 ? `·${loop.steps.length}` : ''}{loop.freestyle?.length ? '♫' : ''}
                    </button>
                    {loops.length > 1 && isActive && (
                      <button onClick={() => removeLoop(i)} title="Remove"
                        style={{ ...miniBtn, width: 14, height: 14, padding: 0, fontSize: 8, color: 'rgba(239,68,68,0.6)' }}>✕</button>
                    )}
                  </div>
                )
              })}
              {loops.length < LOOP_COLORS.length && (
                <button onClick={addLoop} title="Add loop"
                  style={{ ...miniBtn, width: 18, height: 18, padding: 0, fontSize: 'var(--fs-2xs)', color: 'var(--text-20)' }}>+</button>
              )}
            </div>
            <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: freestyleRec ? 'rgba(239,68,68,0.8)' : 'var(--text-20)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {freestyleRec ? 'playing…' : !hasAnyContent ? 'right-click keys / ⏺ freestyle' : `${totalSteps} steps`}
            </span>
            {activeSequence.length > 0 && (
              <button onClick={clearActiveLoop}
                title={`Clear loop ${String.fromCharCode(65 + activeLoopIdx)}`}
                style={{ ...miniBtn, width: 'auto', padding: '2px 6px', fontSize: 'var(--fs-2xs)', color: 'rgba(239,68,68,0.7)' }}>
                clr
              </button>
            )}
            {totalSteps > 0 && loops.length > 1 && (
              <button onClick={clearAllLoops} title="Clear all"
                style={{ ...miniBtn, width: 'auto', padding: '2px 6px', fontSize: 'var(--fs-2xs)', color: 'rgba(239,68,68,0.5)' }}>
                all
              </button>
            )}
          </div>
          {/* Row 2: BPM + Gate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BpmControl bpm={seqBpm} onChange={setSeqBpm} min={1} max={180} accent="#a78bfa" showSlider />
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-30)', fontFamily: 'monospace', flexShrink: 0 }}>
              gate {seqGate < 1 ? `${Math.round(seqGate * 100)}%` : seqGate === 1 ? 'tie' : `${seqGate.toFixed(1)}×`}
            </span>
            <input type="range" min={0.05} max={1.5} step={0.01} value={seqGate}
              onChange={e => setSeqGate(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#34d399', cursor: 'pointer', minWidth: 50 }}
              title="Gate: <1 silent gap · 1 tie · >1 legato overlap" />
          </div>
        </div>

        {/* Piano */}
        <Piano activeNotes={activeNotes}
          sequence={activeSequence} seqStep={seqSteps[activeLoopIdx] ?? -1} seqPlaying={seqPlaying}
          seqColor={LOOP_COLORS[activeLoopIdx % LOOP_COLORS.length]}
          onNoteOn={noteOn} onNoteOff={noteOff}
          onToggleSeq={toggleInSequence} />
      </div>
    </Rnd>
    {showPresets && (
      <PresetMenu
        factory={FACTORY_PRESETS}
        user={userPresets}
        current={currentPreset}
        anchorRef={presetBtnRef}
        onApply={applyPreset}
        onSave={savePreset}
        onDelete={deletePreset}
        onClose={() => setShowPresets(false)}
      />
    )}
    </CaptureIdContext.Provider>
  )
}

function MiniSlider({ label, value, min, max, step, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  fmt: (v: number) => string; onChange: (v: number) => void
}) {
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault(); e.stopPropagation()
    const mult = e.shiftKey ? 0.2 : 1
    const delta = (e.deltaY < 0 ? 1 : -1) * step * 3 * mult
    onChange(Math.max(min, Math.min(max, value + delta)))
  }
  const onDoubleClick = () => onChange((min + max) / 2)
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault()
    const range = max - min
    const spread = e.ctrlKey && e.shiftKey ? 0.8 : e.shiftKey ? 0.4 : 0.15
    onChange(Math.max(min, Math.min(max, value + (Math.random() - 0.5) * 2 * spread * range)))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
      onWheel={onWheel} onDoubleClick={onDoubleClick} onContextMenu={onCtx}
      title={`${label}: ${fmt(value)} · ctrl+scroll · dbl-click reset · right-click: rnd nudge`}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: 'var(--text-20)' }}>{label}</span>
        <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-40)' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--status-ok)', cursor: 'pointer' }} />
    </div>
  )
}

const inp: React.CSSProperties = {
  flex: 1, padding: '6px 9px', borderRadius: 'var(--radius-input)',
  border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
  color: 'var(--text-pure)', fontSize: 'var(--fs-md)', outline: 'none', boxShadow: 'var(--shadow-input)',
}
const actionBtn: React.CSSProperties = {
  width: 34, height: 30, border: 'none', borderRadius: 'var(--radius-input)',
  cursor: 'pointer', background: 'var(--bg-key-off)', color: 'var(--text-40)',
  fontSize: 'var(--fs-lg)', fontWeight: 800, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const miniBtn: React.CSSProperties = {
  padding: '3px 8px', border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'rgba(255,255,255,0.07)', color: 'var(--text-40)',
  fontSize: 'var(--fs-sm)', fontWeight: 800, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
