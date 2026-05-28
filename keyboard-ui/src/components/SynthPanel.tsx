import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import { API, isBackendOnline, hasCloudApi, resolveUrl } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { WHITE_NOTES, NOTE_CENTS, KEY_NOTE, BLACK_KEYS } from '../lib/notes'
import { BpmControl } from '../lib/BpmControl'
import { globalClock } from '../lib/global-clock'
import { SynthKnob } from '../lib/SynthKnob'
import { ADSRDisplay } from '../lib/ADSRDisplay'
import { EffectsRack } from '../lib/EffectsRack'
import type { FxParams as BaseFxParams, FxChain } from '../lib/fx-rack'
import {
  FX_DEFAULTS as BASE_FX_DEFAULTS,
  createFxChain, updateFxChain, disposeFxChain,
  driftFxParams, randomizeFxParams, resolveFxParams,
} from '../lib/fx-rack'
import { noteBus } from '../lib/note-bus'
import { requestMIDIAccess, createMIDIListener, listMIDIInputs } from '../lib/midi'
import { FilterEnvParams, FILTER_ENV_DEFAULTS, createFilterEnvelope, updateFilterEnvelope, triggerFilterEnvAttack, triggerFilterEnvRelease, disposeFilterEnvelope } from '../lib/filter-envelope'
import { LFOParams, LFO_DEFAULTS, LFO_TARGETS, type LFOWave, createLFO, connectLFO, disconnectLFO, updateLFO, disposeLFO } from '../lib/lfo'

type Note = typeof WHITE_NOTES[number]

const _synthBpmRegistry = ((window as any).__synthBpmRegistry ??= new Map<string, number>()) as Map<string, number>

function getHarmonyInfo(myBpm: number, myId: string): { harmonic: boolean; ratio: string; otherBpm: number } | null {
  const ratios = [[1,1],[1,2],[2,1],[1,3],[3,1],[2,3],[3,2],[1,4],[4,1],[3,4],[4,3]]
  for (const [id, bpm] of _synthBpmRegistry) {
    if (id === myId || bpm <= 0) continue
    for (const [a, b] of ratios) {
      if (Math.abs(myBpm / bpm - a / b) < 0.02) {
        return { harmonic: true, ratio: a === b ? '1:1' : `${a}:${b}`, otherBpm: bpm }
      }
    }
    return { harmonic: false, ratio: '', otherBpm: bpm }
  }
  return null
}

const PAUL_MODE = { grainSize: 0.85, overlap: 0.45, playbackRate: 0.22 }
const NORMAL_MODE = { grainSize: 0.25, overlap: 0.18, playbackRate: 1.0 }

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** Transpose a note name by octaveShift (e.g. "C3" + 1 → "C4") and adjust cents accordingly */
function transposeNote(noteName: string, shift: number): { name: string; cents: number } {
  const match = noteName.match(/^([A-G]#?)(\d+)$/)
  if (!match) return { name: noteName, cents: NOTE_CENTS[noteName as keyof typeof NOTE_CENTS] ?? 0 }
  const letter = match[1]
  const oct = parseInt(match[2]) + shift
  const newName = `${letter}${oct}`
  const baseCents = NOTE_CENTS[noteName as keyof typeof NOTE_CENTS] ?? 0
  return { name: newName, cents: baseCents + shift * 1200 }
}

function setPlayerDetune(player: any, cents: number) {
  if (player.detune && typeof player.detune === 'object' && 'value' in player.detune) {
    player.detune.value = cents
  } else {
    player.detune = cents
  }
}

function getPlayerDetune(player: any): number {
  if (player.detune && typeof player.detune === 'object' && 'value' in player.detune) {
    return player.detune.value
  }
  return Number(player.detune) || 0
}

function applyPitchAndSpeed(player: any, cents: number, analogMode: boolean, rateMultiplier: number, basePaul: number) {
  setPlayerDetune(player, cents)
  if (analogMode) {
    player.playbackRate = rateMultiplier * Math.pow(2, cents / 1200)
    player.grainSize = basePaul
    player.overlap = Math.min(0.5, basePaul * 0.55)
  } else {
    player.playbackRate = rateMultiplier
    if (cents === 0) {
      player.grainSize = basePaul
      player.overlap = Math.min(0.5, basePaul * 0.55)
    } else {
      // Ultra-tight granular settings for pitch shifting
      // This minimizes the "stuttering" or "rhythmic distortion" by slicing into 30ms grains
      player.grainSize = 0.04
      player.overlap = 0.035
    }
  }
}

function TrimSlider({ trimStart, trimEnd, duration, accent, onChange }: {
  trimStart: number; trimEnd: number; duration: number; accent: string
  onChange: (start: number, end: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dur = duration || 1
  const s = trimStart
  const e = trimEnd || dur
  const leftPct = Math.min(100, Math.max(0, (s / dur) * 100))
  const rightPct = Math.min(100, Math.max(0, (e / dur) * 100))
  const HANDLE = 8
  const TRACK_H = 4

  const drag = useCallback((ev: React.MouseEvent, handle: 'start' | 'end') => {
    ev.stopPropagation(); ev.preventDefault()
    const track = trackRef.current; if (!track) return
    const move = (me: MouseEvent) => {
      const r = track.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (me.clientX - r.left) / r.width))
      const t = Math.round(pct * dur)
      if (handle === 'start') onChange(Math.min(t, (trimEnd || dur) - 1), trimEnd)
      else onChange(trimStart, Math.max(t, trimStart + 1))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [dur, trimStart, trimEnd, onChange])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 7,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
      overflow: 'hidden',
    }} onClick={ev => ev.stopPropagation()}>
      <span style={{ color: 'var(--text-20)', fontWeight: 700, letterSpacing: '0.1em', fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', flexShrink: 0 }}>TRIM</span>
      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-30)', fontFamily: 'monospace', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{fmtTime(s)}</span>
      <div ref={trackRef} style={{ flex: 1, height: HANDLE + 6, position: 'relative', overflow: 'visible', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: TRACK_H, marginTop: -TRACK_H / 2, borderRadius: 2, background: 'var(--bg-hover)' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%`, height: TRACK_H, marginTop: -TRACK_H / 2, borderRadius: 2, background: accent, opacity: 0.35 }} />
        <div onMouseDown={ev => drag(ev, 'start')} style={{
          position: 'absolute', top: '50%', left: `calc(${leftPct}% - ${HANDLE / 2}px)`,
          width: HANDLE, height: HANDLE + 4, marginTop: -(HANDLE + 4) / 2, borderRadius: 2,
          background: accent, cursor: 'ew-resize',
        }} />
        <div onMouseDown={ev => drag(ev, 'end')} style={{
          position: 'absolute', top: '50%', left: `calc(${rightPct}% - ${HANDLE / 2}px)`,
          width: HANDLE, height: HANDLE + 4, marginTop: -(HANDLE + 4) / 2, borderRadius: 2,
          background: accent, cursor: 'ew-resize',
        }} />
      </div>
      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-30)', fontFamily: 'monospace', minWidth: 28, flexShrink: 0 }}>{fmtTime(e)}</span>
      {(trimStart > 0 || trimEnd > 0) && (
        <button onClick={() => onChange(0, 0)} style={{ border: 'none', background: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', fontSize: 'var(--fs-2xs)', fontWeight: 900, padding: 0, flexShrink: 0 }}>✕</button>
      )}
    </div>
  )
}

function fmtTime(s: number): string {
  if (!s || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function parseTime(v: string): number {
  const parts = v.replace(/[^0-9:]/g, '').split(':')
  if (parts.length === 2) return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
  return parseInt(parts[0]) || 0
}

type Status = 'idle' | 'loading' | 'ready' | 'playing'

type SeqStep = { noteName: string; cents: number; velocity?: number }

type TimedEvent = { noteName: string; cents: number; timeMs: number; durationMs: number }

type SeqLoop = {
  steps: SeqStep[]
  muted: boolean
  freestyle?: TimedEvent[]
  freestyleLenMs?: number
}

const LOOP_COLORS = ['#a78bfa', '#34d399', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316']

/* ── Big oscilloscope/spectrum (real-time) ────────────────────────── */

function Scope({ analyser, fftAnalyser, color, height = 84, mode = 'wave', onToggleMode, voiceCount = 0, cpuLatency = 0 }: {
  analyser: Tone.Analyser | null; fftAnalyser: Tone.Analyser | null; color: string; height?: number
  mode?: 'wave' | 'fft'; onToggleMode?: () => void
  voiceCount?: number; cpuLatency?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const raf = useRef<number>(0)
  const modeRef = useRef(mode); modeRef.current = mode

  useEffect(() => {
    const activeAnalyser = modeRef.current === 'fft' ? fftAnalyser : analyser
    if (!activeAnalyser && !analyser) return
    function draw() {
      raf.current = requestAnimationFrame(draw)
      const c = ref.current; if (!c) return
      const ctx = c.getContext('2d')!
      const w = c.width, h = c.height
      ctx.fillStyle = 'rgba(8,9,11,0.85)'
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let i = 0; i < 8; i++) {
        const x = (w / 8) * i
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()

      if (modeRef.current === 'fft' && fftAnalyser) {
        const data = fftAnalyser.getValue() as Float32Array
        const barCount = Math.min(data.length / 2, 128)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.7
        for (let i = 0; i < barCount; i++) {
          const logI = Math.pow(i / barCount, 2) * (data.length / 2)
          const idx = Math.min(Math.floor(logI), data.length - 1)
          const db = data[idx] as number
          const norm = Math.max(0, Math.min(1, (db + 100) / 100))
          const bw = w / barCount
          ctx.fillRect(i * bw, h - norm * h, bw - 1, norm * h)
        }
        ctx.globalAlpha = 1
      } else if (analyser) {
        const data = analyser.getValue() as Float32Array
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
    }
    draw()
    return () => cancelAnimationFrame(raf.current)
  }, [analyser, fftAnalyser, color])

  const cpuColor = cpuLatency < 10 ? '#34d399' : cpuLatency < 20 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={ref} width={420} height={height} style={{
        width: '100%', height, display: 'block', borderRadius: 10,
        background: 'linear-gradient(180deg,#0a0b0d,#06070a)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)',
      }} />
      {onToggleMode && (
        <button onClick={onToggleMode} style={{
          position: 'absolute', top: 4, left: 6, padding: '1px 6px',
          fontSize: 9, fontFamily: 'monospace', fontWeight: 800,
          background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer',
          letterSpacing: '0.1em',
        }}>{mode === 'wave' ? 'WAVE' : 'FFT'}</button>
      )}
      <span style={{
        position: 'absolute', top: 4, right: 6,
        fontSize: 9, fontFamily: 'monospace', fontWeight: 800,
        color: voiceCount > 0 ? color : 'rgba(255,255,255,0.25)',
      }}>{voiceCount}/64</span>
      <div title={`Audio latency: ${cpuLatency.toFixed(1)}ms`} style={{
        position: 'absolute', bottom: 4, right: 6,
        display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontFamily: 'monospace', color: cpuColor,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: cpuColor }} />
        {cpuLatency.toFixed(0)}ms
      </div>
    </div>
  )
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
  onToggleSeq: (noteName: string, cents: number, e?: React.MouseEvent) => void
}) {
  const whitesArr = [...WHITE_NOTES]
  const reverseKey = (note: Note) =>
    Object.entries(KEY_NOTE).find(([, n]) => n === note)?.[0] ?? ''

  const seqIndex = (n: string) => sequence.findIndex(s => s.noteName === n)

  // Track mouse-held notes in a ref to avoid re-render → mouseLeave → noteOff loops
  const heldRef = useRef(new Set<string>())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function globalUp() {
      heldRef.current.forEach(n => onNoteOff(n))
      heldRef.current.clear()
    }
    window.addEventListener('pointerup', globalUp)
    window.addEventListener('pointercancel', globalUp)
    return () => {
      window.removeEventListener('pointerup', globalUp)
      window.removeEventListener('pointercancel', globalUp)
    }
  }, [onNoteOff])

  const handleDown = useCallback((noteName: string, cents: number, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    heldRef.current.add(noteName)
    onNoteOn(noteName, cents)
  }, [onNoteOn])

  const handleEnter = useCallback((noteName: string, cents: number, e: React.PointerEvent) => {
    if (!(e.buttons & 1) || heldRef.current.has(noteName)) return
    heldRef.current.add(noteName)
    onNoteOn(noteName, cents)
  }, [onNoteOn])

  const handleLeave = useCallback((noteName: string, e: React.PointerEvent) => {
    if (!(e.buttons & 1) || !heldRef.current.has(noteName)) return
    heldRef.current.delete(noteName)
    onNoteOff(noteName)
  }, [onNoteOff])

  const downHandlers = (noteName: string, cents: number) => ({
    onPointerDown: (e: React.PointerEvent) => handleDown(noteName, cents, e),
    onPointerEnter: (e: React.PointerEvent) => handleEnter(noteName, cents, e),
    onPointerLeave: (e: React.PointerEvent) => handleLeave(noteName, e),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault(); onToggleSeq(noteName, cents, e)
    },
  })

  return (
    <div ref={containerRef} style={{ position: 'relative', height: 110, userSelect: 'none', touchAction: 'none' }}>
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
              aria-label={n}
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
              {inSeq && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '15%', right: '15%',
                  height: Math.round((sequence[seqIdx].velocity ?? 0.8) * 12),
                  background: seqColor, opacity: 0.5, borderRadius: '2px 2px 0 0',
                }} />
              )}
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
              aria-label={bk.label}
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
              {inSeq && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '20%', right: '20%',
                  height: Math.round((sequence[seqIdx].velocity ?? 0.8) * 10),
                  background: seqColor, opacity: 0.6, borderRadius: '2px 2px 0 0',
                }} />
              )}
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

/** SynthPanel extends the shared FxParams with player-specific fields */
type FxParams = BaseFxParams & {
  paul: number        // grainSize seconds 0.05..1.5 (couples overlap)
  rate: number        // playbackRate 0.05..2
  velocity: number    // note velocity 0.1..1 (scales volume per trigger)
  envAttack: number   // envelope attack 0.001..2
  envDecay: number    // envelope decay 0.01..2
  envSustain: number  // envelope sustain 0..1
  envRelease: number  // envelope release 0.01..5
} & FilterEnvParams & LFOParams

const FX_DEFAULTS: FxParams = {
  ...BASE_FX_DEFAULTS,
  paul: 0.5, rate: 0.5, velocity: 1,
  envAttack: 0.05, envDecay: 0.3, envSustain: 0.6, envRelease: 1.2,
  ...FILTER_ENV_DEFAULTS, ...LFO_DEFAULTS,
}

/* ── Presets ─────────────────────────────────────────────────────── */

type SynthPreset = {
  id: string
  name: string
  // Partial: missing fields are merged with FX_DEFAULTS at apply-time so old presets stay compatible
  fx: Partial<FxParams>
  paulMode: boolean
  synthType?: 'fm' | 'am' | 'sine' | 'square' | 'sawtooth' | 'triangle'
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

type Engine = {
  chain: FxChain
  polySynth: Tone.PolySynth
  player: Tone.GrainPlayer | null
  filterEnv: Tone.FrequencyEnvelope | null
  lfo: Tone.LFO | null
  lfoTarget: string
  fftAnalyser: Tone.Analyser
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
      const r = await fetch(resolveUrl(`/api/yt-download?${params}`))
      const d = await r.json()
      if (d.error) { setState('err'); setErr(d.error); return }
      const label = u.split('v=')[1]?.slice(0, 11) || 'yt-sample'
      onLoaded(resolveUrl(`/api/preview?path=${encodeURIComponent(d.path)}`), label)
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
  factory, user, current, anchorRef, onApply, onSave, onDelete, onClose, onExport, onImport,
}: {
  factory: SynthPreset[]; user: SynthPreset[]; current: SynthPreset | null
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onApply: (p: SynthPreset) => void; onSave: (name: string) => void
  onDelete: (id: string) => void; onClose: () => void
  onExport: () => void; onImport: () => void
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
      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
        <button onClick={onExport}
          style={{
            ...miniBtn, flex: 1, padding: '5px 0', fontSize: 'var(--fs-xs)',
            background: 'rgba(6,182,212,0.12)', color: 'rgba(6,182,212,0.8)',
          }}>↓ Export</button>
        <button onClick={onImport}
          style={{
            ...miniBtn, flex: 1, padding: '5px 0', fontSize: 'var(--fs-xs)',
            background: 'rgba(167,139,250,0.12)', color: 'rgba(167,139,250,0.8)',
          }}>↑ Import</button>
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
  const [analogMode, setAnalogMode] = useState(false)
  const analogModeRef = useRef(analogMode); analogModeRef.current = analogMode
  const [octaveShift, setOctaveShift] = useState(0)
  const octaveShiftRef = useRef(octaveShift); octaveShiftRef.current = octaveShift
  const [synthType, setSynthType] = useState<'fm' | 'am' | 'sine' | 'square' | 'sawtooth' | 'triangle'>('fm')
  const [status, setStatus] = useState<Status>('idle')
  const [srcLabel, setSrcLabel] = useState('')
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [sampleSpeed, setSampleSpeed] = useState(1)
  const sampleSpeedRef = useRef(1)
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set())
  const [isRecording, setIsRecording] = useState(false)
  const [recElapsed, setRecElapsed] = useState(0)
  const [recStatus, setRecStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastRecPath, setLastRecPath] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Generative drift
  const [genEnabled, setGenEnabled] = useState<Set<keyof FxParams>>(new Set())
  const genRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toggleGen = (key: keyof FxParams) => setGenEnabled(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const genActive = genEnabled.size > 0

  const genEnabledRef = useRef(genEnabled)
  genEnabledRef.current = genEnabled

  useEffect(() => {
    if (!genActive) {
      if (genRef.current) { clearInterval(genRef.current); genRef.current = null }
      return
    }
    const nudge = (k: string, v: number, lo: number, hi: number, enabled: Set<keyof FxParams>, strength = 0.04) => {
      if (!enabled.has(k as keyof FxParams)) return v
      const d = (Math.random() - 0.5) * 2 * strength * (hi - lo)
      return Math.max(lo, Math.min(hi, v + d))
    }
    const nudgeLog = (k: string, v: number, lo: number, hi: number, enabled: Set<keyof FxParams>, strength = 0.04) => {
      if (!enabled.has(k as keyof FxParams)) return v
      const d = (Math.random() - 0.5) * 2 * strength * (Math.log(hi) - Math.log(lo))
      return Math.max(lo, Math.min(hi, Math.exp(Math.log(v) + d)))
    }
    const drift = () => {
      const enabled = genEnabledRef.current
      setFx(prev => {
        // Drift shared FX params
        const baseDrifted = driftFxParams(prev, enabled as Set<keyof BaseFxParams>)
        // Drift player-specific params
        const next: FxParams = {
          ...baseDrifted,
          paul: nudge('paul', prev.paul, 0.1, 1.2, enabled, 0.04),
          rate: nudgeLog('rate', prev.rate, 0.15, 1.5, enabled, 0.03),
          velocity: nudge('velocity', prev.velocity, 0.3, 1, enabled, 0.03),
        }
        const e = engineRef.current
        if (e) {
          updateFxChain(e.chain, baseDrifted, 0.8)
          if (e.player) {
            applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, next.rate * sampleSpeedRef.current, next.paul)
          }
        }
        return next
      })
    }
    genRef.current = setInterval(drift, 800 + Math.random() * 400)
    return () => { if (genRef.current) clearInterval(genRef.current) }
  }, [genActive])

  // Presets
  const [userPresets, setUserPresets] = useState<SynthPreset[]>(loadUserPresets)
  const [showPresets, setShowPresets] = useState(false)
  const [currentPresetId, setCurrentPresetId] = useState<string | null>('f-init')
  const presetBtnRef = useRef<HTMLButtonElement>(null)

  // Undo/Redo for FX params
  const [fxHistory, setFxHistory] = useState<FxParams[]>([FX_DEFAULTS])
  const [fxHistoryIdx, setFxHistoryIdx] = useState(0)
  const lastFxPushRef = useRef(0)

  function pushFxHistory(params: FxParams) {
    const now = Date.now()
    if (now - lastFxPushRef.current < 500) return
    lastFxPushRef.current = now
    setFxHistory(prev => {
      const trimmed = prev.slice(0, fxHistoryIdx + 1)
      const next = [...trimmed, params]
      if (next.length > 30) next.shift()
      return next
    })
    setFxHistoryIdx(prev => Math.min(prev + 1, 29))
  }

  function undoFx() {
    if (fxHistoryIdx <= 0) return
    const newIdx = fxHistoryIdx - 1
    setFxHistoryIdx(newIdx)
    const restored = fxHistory[newIdx]
    if (restored) {
      setFx(restored)
      const e = engineRef.current
      if (e) {
        updateFxChain(e.chain, restored)
        e.polySynth.volume.rampTo(Tone.gainToDb(restored.vol * 0.55), 0.05)
        if (e.player) applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, restored.rate * sampleSpeedRef.current, restored.paul)
      }
    }
  }

  function redoFx() {
    if (fxHistoryIdx >= fxHistory.length - 1) return
    const newIdx = fxHistoryIdx + 1
    setFxHistoryIdx(newIdx)
    const restored = fxHistory[newIdx]
    if (restored) {
      setFx(restored)
      const e = engineRef.current
      if (e) {
        updateFxChain(e.chain, restored)
        e.polySynth.volume.rampTo(Tone.gainToDb(restored.vol * 0.55), 0.05)
        if (e.player) applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, restored.rate * sampleSpeedRef.current, restored.paul)
      }
    }
  }

  // Sequencer — multi-loop
  const [loops, setLoops] = useState<SeqLoop[]>([{ steps: [], muted: false }])
  const [activeLoopIdx, setActiveLoopIdx] = useState(0)
  const [seqPlaying, setSeqPlaying] = useState(false)
  const [seqSteps, setSeqSteps] = useState<number[]>([-1]) // per-loop step index for UI
  const [seqBpm, setSeqBpm] = useState(80)
  const [seqGate, setSeqGate] = useState(0.95)
  const [seqSwing, setSeqSwing] = useState(0)
  const [harmonyInfo, setHarmonyInfo] = useState<ReturnType<typeof getHarmonyInfo>>(null)
  useEffect(() => {
    _synthBpmRegistry.set(instanceId, seqBpm)
    setHarmonyInfo(getHarmonyInfo(seqBpm, instanceId))
    return () => { _synthBpmRegistry.delete(instanceId) }
  }, [seqBpm, instanceId])
  const seqStepIdxRefs = useRef<number[]>([0])
  const loopsRef = useRef<SeqLoop[]>(loops)
  loopsRef.current = loops
  const seqBpmRef = useRef(seqBpm)
  seqBpmRef.current = seqBpm
  const seqGateRef = useRef(seqGate)
  seqGateRef.current = seqGate
  const seqSwingRef = useRef(seqSwing)
  seqSwingRef.current = seqSwing
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
  const [scopeMode, setScopeMode] = useState<'wave' | 'fft'>('wave')
  const [cpuLatency, setCpuLatency] = useState(0)

  useEffect(() => { saveUserPresets(userPresets) }, [userPresets])

  // CPU latency polling
  useEffect(() => {
    const id = setInterval(() => {
      try { setCpuLatency((Tone.getContext().rawContext as AudioContext).baseLatency * 1000) } catch {}
    }, 2000)
    return () => clearInterval(id)
  }, [])

  /* register capture */
  useEffect(() => {
    captureRegistry.register({ id: panelId, label: `Synth${panelId !== 'synth' ? ` ${panelId.slice(-4)}` : ''}`, getStream: getSynthCaptureStream, setMonitor: setSynthMonitor })
    return () => {
      captureRegistry.unregister(panelId)
      synthMonitorEnabled = true  // reset for next mount
    }
  }, [])

  const attackedNotes = useRef(new Set<string>())

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

  /* listen for note bus (Synesthizer, Drone, etc.) — manual toggle */
  const [noteBusLinked, setNoteBusLinked] = useState(false)
  const noteBusLinkedRef = useRef(false)
  noteBusLinkedRef.current = noteBusLinked

  useEffect(() => {
    if (!noteBusLinked) return
    return noteBus.subscribe(panelId, async ev => {
      const e = engineRef.current ?? await ensureEngine()
      const noteMs = Math.max(20, ev.durationMs)
      for (const note of ev.notes) {
        try { e.polySynth.triggerAttackRelease(note, noteMs / 1000, undefined, ev.velocity * fxRef.current.velocity) } catch { /* noop */ }
      }
      setActiveNotes(prev => { const n = new Set(prev); ev.notes.forEach(note => n.add(note)); return n })
      setTimeout(() => {
        setActiveNotes(prev => { const n = new Set(prev); ev.notes.forEach(note => n.delete(note)); return n })
      }, noteMs)
    })
  }, [noteBusLinked])

  /* ── MIDI input ─────────────────────────────────────────────────── */
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [midiInputName, setMidiInputName] = useState('')
  const midiListenerRef = useRef<ReturnType<typeof createMIDIListener> | null>(null)

  useEffect(() => {
    if (!midiEnabled) {
      midiListenerRef.current?.stop()
      midiListenerRef.current = null
      setMidiInputName('')
      return
    }
    let cancelled = false
    let accessRef: MIDIAccess | null = null
    ;(async () => {
      const access = await requestMIDIAccess()
      if (cancelled) return
      if (!access) { setMidiEnabled(false); return }
      setMidiAccess(access)
      accessRef = access
      const listener = createMIDIListener({
        noteOn: (noteName, _velocity) => {
          const wCents = NOTE_CENTS[noteName as Note]
          if (wCents !== undefined) { noteOn(noteName, wCents) }
          else { const bk = BLACK_KEYS.find(k => k.label === noteName); if (bk) noteOn(noteName, bk.cents) }
        },
        noteOff: (noteName) => { noteOff(noteName) },
        cc: (controller, value) => {
          if (controller === 1) { setFx(prev => ({ ...prev, cutoff: 200 + (value / 127) * 15800 })) }
        },
        pitchBend: (value) => {
          const e = engineRef.current
          if (e?.player) applyPitchAndSpeed(e.player, value * 200, analogModeRef.current, fxRef.current.rate * sampleSpeedRef.current, fxRef.current.paul)
        },
      })
      midiListenerRef.current = listener
      function connectFirst(acc: MIDIAccess) {
        const inputs = listMIDIInputs(acc)
        if (inputs.length > 0) { listener.start(inputs[0]); setMidiInputName(inputs[0].name ?? 'MIDI Device') }
        else { setMidiInputName('') }
      }
      connectFirst(access)
      access.onstatechange = () => { if (!cancelled) connectFirst(access) }
    })()
    return () => { cancelled = true; midiListenerRef.current?.stop(); midiListenerRef.current = null; if (accessRef) accessRef.onstatechange = null }
  }, [midiEnabled, noteOn, noteOff])

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
    if (e.filterEnv) { try { disposeFilterEnvelope(e.filterEnv) } catch{ /* noop */ } }
    if (e.lfo) { try { disposeLFO(e.lfo) } catch{ /* noop */ } }
    try { e.fftAnalyser.dispose() } catch{ /* noop */ }
    attackedNotes.current.clear()
    disposeFxChain(e.chain)
    synthOutputGain = null
    engineRef.current = null
  }

  async function ensureEngine(): Promise<Engine> {
    if (engineRef.current) return engineRef.current
    await Tone.start()
    ensureSynthTap()
    const p = fxRef.current
    const chain = createFxChain(p, synthCaptureDest ?? undefined)

    // Override output gain with monitor-aware gain
    synthOutputGain = chain.outputGain
    if (!synthMonitorEnabled) chain.outputGain.gain.value = 0

    // PolySynth routed through FX chain input — type depends on synthType state
    const env = { attack: p.envAttack, decay: p.envDecay, sustain: p.envSustain, release: p.envRelease }
    const st = synthType
    let polySynth: Tone.PolySynth
    if (st === 'fm') {
      polySynth = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 64, harmonicity: 2.5, modulationIndex: 6,
        envelope: env, modulationEnvelope: { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 },
      })
    } else if (st === 'am') {
      polySynth = new Tone.PolySynth(Tone.AMSynth, {
        maxPolyphony: 64, harmonicity: 2.5,
        envelope: env, modulationEnvelope: { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 },
      })
    } else {
      polySynth = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 64, oscillator: { type: st },
        envelope: env,
      })
    }
    polySynth.volume.value = Tone.gainToDb(p.vol * 0.55)
    // Patch: suppress InvalidAccessError thrown by recycled voices
    for (const method of ['_triggerAttack', '_triggerRelease'] as const) {
      const orig = (polySynth as any)[method].bind(polySynth)
      ;(polySynth as any)[method] = (...args: any[]) => {
        try { return orig(...args) } catch { /* voice already stopped */ }
      }
    }
    polySynth.connect(chain.input)

    // FFT analyser for spectrum view
    const fftAnalyser = new Tone.Analyser('fft', 1024)
    chain.reverb.connect(fftAnalyser)

    // Filter envelope (only active when depth > 0)
    let filterEnv: Tone.FrequencyEnvelope | null = null
    if (p.fenvDepth > 0) {
      filterEnv = createFilterEnvelope(chain.filter, p as FilterEnvParams, p.cutoff)
    }

    // LFO (only active when depth > 0)
    let lfo: Tone.LFO | null = null
    if (p.lfoDepth > 0) {
      lfo = createLFO(p as LFOParams)
      connectLFO(lfo, chain, p.lfoTarget)
    }

    engineRef.current = { chain, polySynth, player: null, filterEnv, lfo, lfoTarget: p.lfoTarget, fftAnalyser }
    setEngineTick(t => t + 1)
    return engineRef.current
  }

  /** Rebuild polySynth with a different synth type, preserving ADSR and FX chain */
  function rebuildPolySynth(type: 'fm' | 'am' | 'sine' | 'square' | 'sawtooth' | 'triangle') {
    const e = engineRef.current
    if (!e) return
    const p = fxRef.current
    try { e.polySynth.releaseAll() } catch { /* noop */ }
    try { e.polySynth.dispose() } catch { /* noop */ }
    attackedNotes.current.clear()
    const env = { attack: p.envAttack, decay: p.envDecay, sustain: p.envSustain, release: p.envRelease }
    let polySynth: Tone.PolySynth
    if (type === 'fm') {
      polySynth = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 64, harmonicity: 2.5, modulationIndex: 6,
        envelope: env, modulationEnvelope: { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 },
      })
    } else if (type === 'am') {
      polySynth = new Tone.PolySynth(Tone.AMSynth, {
        maxPolyphony: 64, harmonicity: 2.5,
        envelope: env, modulationEnvelope: { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 },
      })
    } else {
      polySynth = new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 64, oscillator: { type },
        envelope: env,
      })
    }
    polySynth.volume.value = Tone.gainToDb(p.vol * 0.55)
    for (const method of ['_triggerAttack', '_triggerRelease'] as const) {
      const orig = (polySynth as any)[method].bind(polySynth)
      ;(polySynth as any)[method] = (...args: any[]) => {
        try { return orig(...args) } catch { /* voice already stopped */ }
      }
    }
    polySynth.connect(e.chain.input)
    e.polySynth = polySynth
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
      player.playbackRate = p.rate * sampleSpeedRef.current
      setPlayerDetune(player, 0)
      player.volume.value = Tone.gainToDb(p.vol * p.velocity)
      player.connect(e.chain.input)
      if (trimStart > 0) player.loopStart = trimStart
      if (trimEnd > 0) player.loopEnd = trimEnd
      e.player = player
      setLoadedUrl(url); setStatus('ready')
    } catch (err) {
      console.error('SynthPanel load error', err); setStatus('idle')
    }
  }

  function applyTrim(start: number, end: number) {
    setTrimStart(start); setTrimEnd(end)
    const e = engineRef.current
    if (e?.player) {
      e.player.loopStart = start > 0 ? start : 0
      e.player.loopEnd = end > 0 ? end : e.player.buffer.duration
    }
  }

  async function handleFile(file: File) {
    const blob = URL.createObjectURL(file)
    await loadFromUrl(blob, file.name.replace(/\.[^.]+$/, ''))
  }

  async function handleUrlLoad() {
    const raw = urlInput.trim(); if (!raw) return
    if (/youtube\.com|youtu\.be/.test(raw)) {
      if (!isBackendOnline() && !hasCloudApi()) { console.warn('YouTube download requires backend'); return }
      setStatus('loading'); setSrcLabel(raw.split('v=')[1]?.slice(0, 11) || 'yt-sample')
      try {
        const params = new URLSearchParams({ url: raw })
        const r = await fetch(resolveUrl(`/api/yt-download?${params}`))
        const d = await r.json()
        if (d.error) { console.error('YT error', d.error); setStatus('idle'); return }
        await loadFromUrl(resolveUrl(`/api/preview?path=${encodeURIComponent(d.path)}`), raw.split('v=')[1]?.slice(0, 11) || 'yt-sample')
      } catch (e) { console.error('YT download error', e); setStatus('idle') }
      return
    }
    if (raw.startsWith('http')) {
      loadFromUrl(raw, raw.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'sample')
    } else if (isBackendOnline()) {
      loadFromUrl(resolveUrl(`/api/preview?path=${encodeURIComponent(raw)}`), raw.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'sample')
    }
  }

  /* live param updates */
  function updateFx(patch: Partial<FxParams>) {
    setFx(prev => {
      const next = { ...prev, ...patch }
      pushFxHistory(next)
      const e = engineRef.current
      if (e) {
        // Shared FX chain params
        updateFxChain(e.chain, patch)
        // Player-specific params
        if (e.player) {
          if (patch.paul !== undefined || patch.rate !== undefined) {
            const nextPaul = patch.paul ?? fxRef.current.paul
            const nextRate = patch.rate ?? fxRef.current.rate
            applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, nextRate * sampleSpeedRef.current, nextPaul)
          }
          if (patch.vol !== undefined) e.player.volume.rampTo(Tone.gainToDb(patch.vol * (patch.velocity ?? fxRef.current.velocity)), 0.05)
        }
        if (patch.vol !== undefined) e.polySynth.volume.rampTo(Tone.gainToDb(patch.vol * 0.55), 0.05)
        // Apply ADSR envelope changes
        if (patch.envAttack !== undefined || patch.envDecay !== undefined || patch.envSustain !== undefined || patch.envRelease !== undefined) {
          e.polySynth.set({ envelope: {
            attack: patch.envAttack ?? next.envAttack,
            decay: patch.envDecay ?? next.envDecay,
            sustain: patch.envSustain ?? next.envSustain,
            release: patch.envRelease ?? next.envRelease,
          }})
        }
        // Filter envelope
        const fenvChanged = patch.fenvAttack !== undefined || patch.fenvDecay !== undefined ||
          patch.fenvSustain !== undefined || patch.fenvRelease !== undefined || patch.fenvDepth !== undefined
        if (fenvChanged) {
          const baseCutoff = patch.cutoff ?? next.cutoff
          if (next.fenvDepth > 0) {
            if (!e.filterEnv) {
              e.filterEnv = createFilterEnvelope(e.chain.filter, next as FilterEnvParams, baseCutoff)
            } else {
              updateFilterEnvelope(e.filterEnv, next as Partial<FilterEnvParams>, baseCutoff)
            }
          } else if (e.filterEnv) {
            disposeFilterEnvelope(e.filterEnv); e.filterEnv = null
          }
        }
        if (patch.cutoff !== undefined && e.filterEnv && next.fenvDepth > 0) {
          e.filterEnv.baseFrequency = next.cutoff
        }
        // LFO
        const lfoChanged = patch.lfoRate !== undefined || patch.lfoDepth !== undefined ||
          patch.lfoWave !== undefined || patch.lfoTarget !== undefined
        if (lfoChanged) {
          if (next.lfoDepth > 0) {
            if (!e.lfo) {
              e.lfo = createLFO(next as LFOParams)
              connectLFO(e.lfo, e.chain, next.lfoTarget)
              e.lfoTarget = next.lfoTarget
            } else {
              updateLFO(e.lfo, next as Partial<LFOParams>)
              if (patch.lfoTarget !== undefined && patch.lfoTarget !== e.lfoTarget) {
                disconnectLFO(e.lfo)
                connectLFO(e.lfo, e.chain, next.lfoTarget)
                e.lfoTarget = next.lfoTarget
              }
            }
          } else if (e.lfo) {
            disposeLFO(e.lfo); e.lfo = null
          }
        }
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

  function toggleInSequence(noteName: string, cents: number, e?: React.MouseEvent) {
    const velocity = e?.shiftKey ? 1.0 : 0.8
    setLoops(prev => prev.map((loop, i) => {
      if (i !== activeLoopIdx) return loop
      const idx = loop.steps.findIndex(s => s.noteName === noteName)
      if (idx >= 0) return { ...loop, steps: loop.steps.filter((_, j) => j !== idx) }
      return { ...loop, steps: [...loop.steps, { noteName, cents, velocity }] }
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

  const seqTimerRef = useRef<number | null>(null)
  const lastStepRef = useRef<number>(-1)

  function stopSeq() {
    if (seqTimerRef.current != null) { window.clearInterval(seqTimerRef.current); seqTimerRef.current = null }
    globalClock.leave(instanceId)
    stopFreestylePlayback()
    seqStepIdxRefs.current = seqStepIdxRefs.current.map(() => 0)
    lastStepRef.current = -1
    setSeqSteps(prev => prev.map(() => -1))
    setSeqPlaying(false)
    const e = engineRef.current
    if (e) try { e.polySynth.releaseAll() } catch{ /* noop */ }
    attackedNotes.current.clear()
    setActiveNotes(new Set())
  }

  function playNote(noteName: string, cents: number, noteMs: number, velocity?: number) {
    const e = engineRef.current; if (!e) return
    const vel = velocity ?? fxRef.current.velocity
    if (e.player && statusRef.current === 'playing') {
      applyPitchAndSpeed(e.player, cents, analogModeRef.current, fxRef.current.rate * sampleSpeedRef.current, fxRef.current.paul)
    } else {
      try { e.polySynth.triggerAttackRelease(noteName, noteMs / 1000, undefined, vel) } catch{ /* noop */ }
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

    // Epoch-aligned step: figure out which step we should be on based on shared t0
    // Apply swing: offset even-indexed steps by swing amount
    const swing = seqSwingRef.current
    const elapsed = performance.now() - globalClock.getEpoch()
    const globalStep = Math.floor(elapsed / stepMs)
    if (globalStep === lastStepRef.current) return
    // For swing: delay even-numbered steps (0-indexed even = beat 1,3,5... which are the off-beats)
    // Actually swing delays the "and" beats (odd steps in 0-indexed)
    if (swing > 0 && globalStep % 2 === 1) {
      const swingDelayMs = swing * stepMs * 0.5
      const timeInStep = elapsed - globalStep * stepMs
      if (timeInStep < swingDelayMs) return
    }
    lastStepRef.current = globalStep

    const newSteps = [...seqStepIdxRefs.current]
    const uiSteps: number[] = []

    for (let i = 0; i < allLoops.length; i++) {
      const loop = allLoops[i]
      if (loop.muted || loop.steps.length === 0) { uiSteps.push(-1); continue }
      const idx = globalStep % loop.steps.length
      newSteps[i] = idx + 1
      uiSteps.push(idx)
      const step = loop.steps[idx]
      playNote(step.noteName, step.cents, noteMs, step.velocity ?? 0.8)
    }
    seqStepIdxRefs.current = newSteps
    setSeqSteps(uiSteps)
  }

  function startEpochTimer() {
    if (seqTimerRef.current != null) window.clearInterval(seqTimerRef.current)
    // Poll at ~4x the step rate for tight alignment
    const pollMs = Math.max(5, (60000 / seqBpmRef.current) / 4)
    seqTimerRef.current = window.setInterval(tick, pollMs)
  }

  async function startSeq() {
    if (!hasAnyContent) return
    await ensureEngine()
    stopSeq()
    globalClock.join(instanceId)
    if (totalSteps > 0) {
      tick()
      startEpochTimer()
    }
    for (let i = 0; i < loopsRef.current.length; i++) {
      const l = loopsRef.current[i]
      if (!l.muted && l.freestyle && l.freestyle.length > 0) playFreestyleLoop(i)
    }
    setSeqPlaying(true)
  }

  useEffect(() => {
    if (!seqPlaying) return
    startEpochTimer()
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
      try { eng.chain.analyser.connect(synthCaptureDest) } catch { /* already connected */ }
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
      if (!isBackendOnline()) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `synth-rec-${Date.now()}.webm`
        a.click()
        URL.revokeObjectURL(a.href)
        setRecStatus('saved'); setTimeout(() => setRecStatus('idle'), 3000)
        return
      }
      try {
        const fd = new FormData()
        fd.append('file', blob, `synth-rec-${Date.now()}.webm`)
        const upRes = await fetch(resolveUrl('/api/upload'), { method: 'POST', body: fd })
        if (!upRes.ok) { setRecStatus('error'); return }
        const { path: filePath } = await upRes.json()

        const convRes = await fetch(resolveUrl('/api/convert/wav-to-mp3'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, bitrate: '192k' }),
        })
        if (!convRes.ok) { setRecStatus('error'); return }
        const { job_id: jobId } = await convRes.json()

        for (let i = 0; i < 60; i++) {
          const s = await fetch(resolveUrl(`/api/convert/status/${jobId}`)).then(r => r.json())
          if (s.status === 'done') { setLastRecPath(s.output ?? filePath); setRecStatus('saved'); setTimeout(() => setRecStatus('idle'), 3000); return }
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
    const baseRnd = randomizeFxParams()
    const useFenv = Math.random() < 0.4
    const useLfo = Math.random() < 0.35
    const next: FxParams = {
      ...baseRnd,
      paul: rnd(0.1, 1.2),
      rate: rndLog(0.15, 1.5),
      velocity: rnd(0.5, 1),
      envAttack: rndLog(0.005, 0.8),
      envDecay: rndLog(0.05, 1.2),
      envSustain: rnd(0.1, 0.9),
      envRelease: rndLog(0.1, 3.5),
      fenvAttack: rnd(0.01, 0.5), fenvDecay: rnd(0.05, 0.8),
      fenvSustain: rnd(0.2, 0.8), fenvRelease: rnd(0.1, 2),
      fenvDepth: useFenv ? rnd(0.1, 0.8) : 0,
      lfoRate: rndLog(0.2, 10), lfoDepth: useLfo ? rnd(0.1, 0.7) : 0,
      lfoWave: (['sine', 'triangle', 'sawtooth', 'square'] as const)[Math.floor(Math.random() * 4)],
      lfoTarget: LFO_TARGETS[Math.floor(Math.random() * LFO_TARGETS.length)],
    }
    const nextPaulMode = Math.random() < 0.3
    setCurrentPresetId(null)
    setPaulMode(nextPaulMode)
    setFx(next)
    const e = engineRef.current
    if (e) {
      updateFxChain(e.chain, baseRnd, 0.1)
      e.polySynth.volume.rampTo(Tone.gainToDb(next.vol * 0.55), 0.1)
      e.polySynth.set({ envelope: { attack: next.envAttack, decay: next.envDecay, sustain: next.envSustain, release: next.envRelease } })
      if (e.player) {
        applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, next.rate * sampleSpeedRef.current, next.paul)
        e.player.volume.rampTo(Tone.gainToDb(next.vol * next.velocity), 0.1)
      }
      // Filter envelope
      if (next.fenvDepth > 0) {
        if (!e.filterEnv) e.filterEnv = createFilterEnvelope(e.chain.filter, next as FilterEnvParams, next.cutoff)
        else updateFilterEnvelope(e.filterEnv, next as Partial<FilterEnvParams>, next.cutoff)
      } else if (e.filterEnv) { disposeFilterEnvelope(e.filterEnv); e.filterEnv = null }
      // LFO
      if (e.lfo) { disposeLFO(e.lfo); e.lfo = null }
      if (next.lfoDepth > 0) {
        e.lfo = createLFO(next as LFOParams)
        connectLFO(e.lfo, e.chain, next.lfoTarget)
        e.lfoTarget = next.lfoTarget
      }
    }
  }

  /* ── Preset actions ── */

  async function applyPreset(p: SynthPreset) {
    setCurrentPresetId(p.id)
    setPaulMode(p.paulMode)
    // Apply synthType from preset (default to 'fm' for older presets)
    const presetSynthType = p.synthType ?? 'fm'
    if (presetSynthType !== synthType) {
      setSynthType(presetSynthType)
      rebuildPolySynth(presetSynthType)
    }
    // Merge with defaults so older presets without new FX fields still work
    const fxFull: FxParams = { ...FX_DEFAULTS, ...p.fx }
    setFx(fxFull)
    const e = engineRef.current
    if (e) {
      updateFxChain(e.chain, fxFull)
      e.polySynth.volume.rampTo(Tone.gainToDb(fxFull.vol * 0.55), 0.05)
      e.polySynth.set({ envelope: { attack: fxFull.envAttack, decay: fxFull.envDecay, sustain: fxFull.envSustain, release: fxFull.envRelease } })
      if (e.player) {
        applyPitchAndSpeed(e.player, getPlayerDetune(e.player), analogModeRef.current, fxFull.rate * sampleSpeedRef.current, fxFull.paul)
        e.player.volume.rampTo(Tone.gainToDb(fxFull.vol * fxFull.velocity), 0.05)
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
      synthType,
      source,
    }
    setUserPresets(prev => [...prev, p])
    setCurrentPresetId(p.id)
  }

  function deletePreset(id: string) {
    setUserPresets(prev => prev.filter(p => p.id !== id))
    if (currentPresetId === id) setCurrentPresetId(null)
  }

  function exportPreset() {
    const data = {
      name: currentPreset?.name ?? 'Untitled',
      fx: { ...fx },
      paulMode,
      synthType,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `synth-preset-${(data.name).replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importPreset() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (!data.fx || typeof data.fx !== 'object') { console.warn('Invalid preset: missing fx'); return }
        const preset: SynthPreset = {
          id: `u-imp-${Date.now()}`,
          name: data.name || file.name.replace(/\.json$/, ''),
          fx: { ...FX_DEFAULTS, ...data.fx },
          paulMode: !!data.paulMode,
          synthType: data.synthType ?? 'fm',
        }
        setUserPresets(prev => [...prev, preset])
        applyPreset(preset)
      } catch (err) { console.error('Import preset error', err) }
    }
    input.click()
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

  const pendingRelease = useRef(new Set<string>())

  const noteOn = useCallback(async (noteName: string, cents: number) => {
    setActiveNotes(prev => { const n = new Set(prev); n.add(noteName); return n })
    pendingRelease.current.delete(noteName)
    freestyleNoteOn(noteName)
    const e = await ensureEngine()
    if (e.player) {
      if (statusRef.current !== 'playing') {
        try { e.player.start(); setStatus('playing') } catch { /* noop */ }
      }
      applyPitchAndSpeed(e.player, cents, analogModeRef.current, fxRef.current.rate * sampleSpeedRef.current, fxRef.current.paul)
      return
    }
    try {
      e.polySynth.triggerAttack(noteName, undefined, fxRef.current.velocity)
      attackedNotes.current.add(noteName)
      if (e.filterEnv && fxRef.current.fenvDepth > 0) triggerFilterEnvAttack(e.filterEnv)
    } catch (err) { console.warn('synth attack err', err) }
    if (pendingRelease.current.has(noteName)) {
      pendingRelease.current.delete(noteName)
      attackedNotes.current.delete(noteName)
      try { e.polySynth.triggerRelease(noteName) } catch { /* noop */ }
      if (e.filterEnv && fxRef.current.fenvDepth > 0) triggerFilterEnvRelease(e.filterEnv)
    }
  }, [])

  const noteOff = useCallback((noteName: string) => {
    setActiveNotes(prev => { const n = new Set(prev); n.delete(noteName); return n })
    freestyleNoteOff(noteName)
    const e = engineRef.current
    if (!e) { pendingRelease.current.add(noteName); return }
    if (e.player && statusRef.current === 'playing') return
    if (!attackedNotes.current.has(noteName)) { pendingRelease.current.add(noteName); return }
    attackedNotes.current.delete(noteName)
    try { e.polySynth.triggerRelease(noteName) } catch{ /* noop */ }
    if (e.filterEnv && fxRef.current.fenvDepth > 0) triggerFilterEnvRelease(e.filterEnv)
  }, [])

  /* Undo/Redo keyboard shortcut */
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement) return
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z' && !ev.shiftKey) { ev.preventDefault(); undoFx() }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z' && ev.shiftKey) { ev.preventDefault(); redoFx() }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Z') { ev.preventDefault(); redoFx() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fxHistoryIdx, fxHistory])

  /* Physical keyboard → noteOn/Off (sustain while held) + octave shift [ ] */
  useEffect(() => {
    const pressed = new Set<string>()
    const keyToTransposed = new Map<string, string>()
    function onDown(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement) return
      const k = ev.key.toLowerCase()
      if (k === '[') { setOctaveShift(o => Math.max(-3, o - 1)); return }
      if (k === ']') { setOctaveShift(o => Math.min(3, o + 1)); return }
      if (pressed.has(k)) return
      const note = KEY_NOTE[k]
      if (note) {
        pressed.add(k)
        const t = transposeNote(note, octaveShiftRef.current)
        keyToTransposed.set(k, t.name)
        noteOn(t.name, t.cents)
      }
    }
    function onUp(ev: KeyboardEvent) {
      const k = ev.key.toLowerCase()
      if (!pressed.has(k)) return
      pressed.delete(k)
      const tn = keyToTransposed.get(k)
      if (tn) { keyToTransposed.delete(k); noteOff(tn) }
    }
    function onBlur() {
      pressed.forEach(k => { const tn = keyToTransposed.get(k); if (tn) noteOff(tn) })
      pressed.clear(); keyToTransposed.clear()
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
                background: showPresets ? 'rgba(255,255,255,0.14)' : 'var(--bg-hover)',
                color: showPresets ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
                gap: 5,
              }}>
              <span style={{ fontSize: 'var(--fs-base)' }}>≡</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                {currentPreset?.name ?? 'PATCHES'}
              </span>
            </button>
            <button onClick={undoFx} disabled={fxHistoryIdx <= 0}
              title="Undo FX change (Ctrl+Z)"
              style={{
                ...miniBtn, padding: '3px 6px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: 'var(--bg-hover)',
                color: fxHistoryIdx <= 0 ? 'var(--text-20)' : 'var(--text-60)',
                opacity: fxHistoryIdx <= 0 ? 0.35 : 1,
              }}>←</button>
            <button onClick={redoFx} disabled={fxHistoryIdx >= fxHistory.length - 1}
              title="Redo FX change (Ctrl+Shift+Z)"
              style={{
                ...miniBtn, padding: '3px 6px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: 'var(--bg-hover)',
                color: fxHistoryIdx >= fxHistory.length - 1 ? 'var(--text-20)' : 'var(--text-60)',
                opacity: fxHistoryIdx >= fxHistory.length - 1 ? 0.35 : 1,
              }}>→</button>
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
            <button onClick={() => {
                if (genActive) { setGenEnabled(new Set()) }
                else {
                  const all = new Set<keyof FxParams>(Object.keys(FX_DEFAULTS) as (keyof FxParams)[])
                  all.delete('vol')
                  setGenEnabled(all)
                }
              }}
              title={genActive ? 'Disable all generative drift (or right-click individual knobs)' : 'Enable generative drift on all params (right-click to toggle individual)'}
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: genActive ? 'rgba(16,185,129,0.55)' : 'var(--bg-hover)',
                color: genActive ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}>
              ◎ GEN
            </button>
            <button onClick={() => setNoteBusLinked(v => !v)}
              title={noteBusLinked ? 'Linked — receiving notes from other panels (Synesthizer, etc.)' : 'Link — receive notes from other panels through this FX chain'}
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: noteBusLinked ? 'rgba(6,182,212,0.7)' : 'var(--bg-hover)',
                color: noteBusLinked ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}>
              🔗 LINK
            </button>
            <button onClick={() => { if (!navigator.requestMIDIAccess) return; setMidiEnabled(v => !v) }}
              title={!navigator.requestMIDIAccess ? 'MIDI not supported in this browser' : midiEnabled ? `MIDI: ${midiInputName || 'waiting...'}` : 'Enable MIDI input'}
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: midiEnabled ? (midiInputName ? 'rgba(16,185,129,0.7)' : 'rgba(245,158,11,0.5)') : 'var(--bg-hover)',
                color: midiEnabled ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
                opacity: navigator.requestMIDIAccess ? 1 : 0.35,
              }}>
              🎹 MIDI
            </button>
            <button onClick={togglePaulMode}
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: paulMode ? 'rgba(167,139,250,0.7)' : 'var(--bg-hover)',
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
                background: playing ? accent : 'var(--border-subtle)',
                color: playing ? '#000' : 'var(--text-40)',
                opacity: droneReady ? 1 : 0.35, fontWeight: 900,
              }}>
              {playing ? '⏹ DRONE' : '▶ DRONE'}
            </button>
            <button onClick={recStatus === 'saving' ? undefined : isRecording ? stopRecording : startRecording}
              title={isRecording ? `Gravando… ${Math.floor(recElapsed / 60)}:${String(recElapsed % 60).padStart(2, '0')} — clique para parar e salvar MP3` : recStatus === 'saving' ? 'Convertendo para MP3…' : recStatus === 'saved' ? 'Salvo nos assets!' : 'Gravar em MP3'}
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
            {lastRecPath && !isRecording && recStatus !== 'saving' && (
              <button
                onClick={e => { e.stopPropagation(); loadFromUrl(resolveUrl(`/api/preview?path=${encodeURIComponent(lastRecPath)}`), lastRecPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'rec') }}
                title={`Load last rec: ${lastRecPath}`}
                style={{
                  ...miniBtn, padding: '3px 6px', fontSize: 'var(--fs-xs)',
                  background: 'rgba(0,184,96,0.12)', color: 'rgba(0,184,96,0.8)',
                  fontWeight: 800, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>♪ LAST</button>
            )}
          </div>
        </PanelHeader>

        {/* Scope */}
        <Scope analyser={engineRef.current?.chain.analyser ?? null}
          fftAnalyser={engineRef.current?.fftAnalyser ?? null}
          color={accent} height={84}
          mode={scopeMode} onToggleMode={() => setScopeMode(m => m === 'wave' ? 'fft' : 'wave')}
          voiceCount={activeNotes.size} cpuLatency={cpuLatency} />

        {/* Status / src strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', borderRadius: 7,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'var(--text-40)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%',
            background: status === 'loading' ? '#f59e0b' : playing ? accent : hasSample ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.4)',
            boxShadow: status === 'loading' ? '0 0 8px #f59e0b' : playing ? `0 0 8px ${accent}` : 'none',
            animation: status === 'loading' ? 'sb-pulse 0.8s ease-in-out infinite' : 'none' }} />
          <span style={{ color: status === 'loading' ? '#f59e0b' : 'var(--text-20)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {status === 'loading' ? 'loading' : hasSample ? 'sample' : 'osc'}
          </span>
          <span style={{ flex: 1, color: status === 'loading' ? '#f59e0b' : 'var(--text-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status === 'loading' ? `loading ${srcLabel}…` : srcLabel || 'press a-k or z-m to play notes — load sample for drone'}
          </span>
          {activeNotes.size > 0 && (
            <span style={{ color: accent, fontWeight: 900 }}>
              {[...activeNotes].slice(0, 4).join(' ')}{activeNotes.size > 4 ? '…' : ''}
            </span>
          )}
          <button onClick={e => {
              e.stopPropagation()
              const cur = SPEED_PRESETS.indexOf(sampleSpeed as typeof SPEED_PRESETS[number])
              const next = SPEED_PRESETS[((cur === -1 ? 2 : cur) + 1) % SPEED_PRESETS.length]
              setSampleSpeed(next); sampleSpeedRef.current = next
              const p = engineRef.current?.player
              if (p) applyPitchAndSpeed(p, getPlayerDetune(p), analogModeRef.current, fxRef.current.rate * next, fxRef.current.paul)
            }}
            className="synth-vel-btn"
            style={{
              padding: '2px 6px', border: 'none', borderRadius: 4, cursor: 'pointer',
              background: 'var(--bg-active)', color: '#fff',
              fontSize: 'var(--fs-xs)', fontWeight: 800, fontFamily: 'monospace',
              flexShrink: 0, transition: 'transform 0.1s, background 0.15s',
            }}>{sampleSpeed}x</button>
        </div>

        {/* Trim slider */}
        {hasSample && <TrimSlider
          trimStart={trimStart} trimEnd={trimEnd}
          duration={engineRef.current?.player?.buffer?.duration ?? 0}
          accent={accent}
          onChange={(s, e) => applyTrim(s, e)}
        />}

        {/* Source row */}
        <div style={{ display: 'flex', gap: 5 }}>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
            onClick={e => e.stopPropagation()}
            placeholder="URL, YouTube link, or server path…"
            style={inp} />
          <button onClick={handleUrlLoad} disabled={!urlInput.trim() || status === 'loading'}
            style={actionBtn}>↵</button>
          <button onClick={() => fileRef.current?.click()} disabled={status === 'loading'}
            style={actionBtn} title="Pick file" aria-label="Pick file">📁</button>
          <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.aif,.aiff,.webm"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>

        {/* Panel-specific knobs: PAUL + RATE */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 24,
          padding: '10px 8px 4px',
        }}>
          <SynthKnob label="PAUL" value={fx.paul} min={0.05} max={1.5} accent="#a78bfa"
            fmt={v => `${v.toFixed(2)}s`} onChange={v => updateFx({ paul: v })}
            genActive={genEnabled.has('paul')} onRightClick={() => toggleGen('paul')} />
          <SynthKnob label="RATE" value={fx.rate} min={0.05} max={2} accent="#a78bfa" log
            fmt={v => `${v.toFixed(2)}×`} onChange={v => updateFx({ rate: v })}
            genActive={genEnabled.has('rate')} onRightClick={() => toggleGen('rate')} />
        </div>

        {/* ADSR Envelope */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '6px 8px 2px',
        }}>
          <ADSRDisplay
            attack={fx.envAttack} decay={fx.envDecay}
            sustain={fx.envSustain} release={fx.envRelease}
            accent={accent} width={120} height={36}
          />
          <SynthKnob label="ATK" value={fx.envAttack} min={0.001} max={2} size={48} accent={accent} log
            fmt={v => v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`}
            onChange={v => updateFx({ envAttack: v })} />
          <SynthKnob label="DEC" value={fx.envDecay} min={0.01} max={2} size={48} accent={accent} log
            fmt={v => v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`}
            onChange={v => updateFx({ envDecay: v })} />
          <SynthKnob label="SUS" value={fx.envSustain} min={0} max={1} size={48} accent={accent}
            fmt={v => `${(v * 100).toFixed(0)}%`}
            onChange={v => updateFx({ envSustain: v })} />
          <SynthKnob label="REL" value={fx.envRelease} min={0.01} max={5} size={48} accent={accent} log
            fmt={v => v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`}
            onChange={v => updateFx({ envRelease: v })} />
        </div>

        {/* Synth type selector */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 4, padding: '2px 8px',
        }}>
          {([
            ['fm', 'FM'], ['am', 'AM'], ['sine', 'SIN'], ['square', 'SQR'], ['sawtooth', 'SAW'], ['triangle', 'TRI'],
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setSynthType(val as typeof synthType); rebuildPolySynth(val as typeof synthType) }}
              style={{
                ...miniBtn, padding: '2px 8px', fontSize: 9, letterSpacing: '0.12em',
                background: synthType === val ? 'rgba(99,102,241,0.35)' : 'var(--bg-hover)',
                color: synthType === val ? '#c7d2fe' : 'var(--text-40)',
                border: synthType === val ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Shared FX rack */}
        <EffectsRack
          params={fx}
          onChange={updateFx}
          accent={accent}
          genEnabled={genEnabled as Set<keyof BaseFxParams>}
          onToggleGen={k => toggleGen(k as keyof FxParams)}
        />

        {/* Filter Envelope */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          borderRadius: 8, background: 'rgba(6,182,212,0.04)',
          border: '1px solid rgba(6,182,212,0.1)',
          opacity: fx.fenvDepth > 0 ? 1 : 0.5, transition: 'opacity 0.2s',
        }}>
          <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 900, letterSpacing: '0.15em', color: '#06b6d4', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>FENV</span>
          <ADSRDisplay attack={fx.fenvAttack} decay={fx.fenvDecay} sustain={fx.fenvSustain} release={fx.fenvRelease} accent="#06b6d4" width={60} height={30} />
          <SynthKnob label="ATK" value={fx.fenvAttack} min={0.001} max={2} size={42} accent="#06b6d4" log
            fmt={v => v < 0.1 ? `${(v*1000).toFixed(0)}ms` : `${v.toFixed(2)}s`}
            onChange={v => updateFx({ fenvAttack: v })} />
          <SynthKnob label="DEC" value={fx.fenvDecay} min={0.01} max={2} size={42} accent="#06b6d4" log
            fmt={v => v < 0.1 ? `${(v*1000).toFixed(0)}ms` : `${v.toFixed(2)}s`}
            onChange={v => updateFx({ fenvDecay: v })} />
          <SynthKnob label="SUS" value={fx.fenvSustain} min={0} max={1} size={42} accent="#06b6d4"
            fmt={v => `${Math.round(v*100)}%`}
            onChange={v => updateFx({ fenvSustain: v })} />
          <SynthKnob label="REL" value={fx.fenvRelease} min={0.01} max={5} size={42} accent="#06b6d4" log
            fmt={v => `${v.toFixed(2)}s`}
            onChange={v => updateFx({ fenvRelease: v })} />
          <SynthKnob label="DEPTH" value={fx.fenvDepth} min={0} max={1} size={42} accent="#06b6d4"
            fmt={v => `${Math.round(v*100)}%`}
            onChange={v => updateFx({ fenvDepth: v })} />
        </div>

        {/* LFO */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          borderRadius: 8, background: 'rgba(236,72,153,0.04)',
          border: '1px solid rgba(236,72,153,0.1)',
          opacity: fx.lfoDepth > 0 ? 1 : 0.5, transition: 'opacity 0.2s',
        }}>
          <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 900, letterSpacing: '0.15em', color: '#ec4899', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>LFO</span>
          <SynthKnob label="RATE" value={fx.lfoRate} min={0.05} max={20} size={42} accent="#ec4899" log
            fmt={v => `${v.toFixed(1)}Hz`}
            onChange={v => updateFx({ lfoRate: v })} />
          <SynthKnob label="DEPTH" value={fx.lfoDepth} min={0} max={1} size={42} accent="#ec4899"
            fmt={v => `${Math.round(v*100)}%`}
            onChange={v => updateFx({ lfoDepth: v })} />
          <div style={{ display: 'flex', gap: 2 }}>
            {(['sine', 'triangle', 'sawtooth', 'square'] as LFOWave[]).map(w => (
              <button key={w} onClick={() => updateFx({ lfoWave: w })}
                style={{
                  ...miniBtn, padding: '2px 5px', width: 'auto', fontSize: 'var(--fs-2xs)',
                  background: fx.lfoWave === w ? 'rgba(236,72,153,0.6)' : 'var(--bg-hover)',
                  color: fx.lfoWave === w ? '#fff' : 'var(--text-30)',
                }}>{w === 'sine' ? 'SIN' : w === 'triangle' ? 'TRI' : w === 'sawtooth' ? 'SAW' : 'SQR'}</button>
            ))}
          </div>
          <select value={fx.lfoTarget} onChange={e => updateFx({ lfoTarget: e.target.value })}
            style={{
              padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(236,72,153,0.2)',
              background: 'var(--bg-input)', color: 'var(--text-70)', fontSize: 'var(--fs-2xs)',
              cursor: 'pointer',
            }}>
            {LFO_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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
              aria-label={seqPlaying ? "Stop sequencer" : "Play sequencer"}
              style={{
                ...miniBtn, padding: '2px 8px', width: 'auto', fontSize: 'var(--fs-xs)',
                background: seqPlaying ? LOOP_COLORS[activeLoopIdx] : hasAnyContent ? 'rgba(167,139,250,0.25)' : 'var(--bg-hover)',
                color: seqPlaying ? '#000' : hasAnyContent ? '#a78bfa' : 'var(--text-20)',
                opacity: !hasAnyContent ? 0.4 : 1, fontWeight: 900,
              }}>
              {seqPlaying ? '⏹' : '▶'}
            </button>
            <button onClick={freestyleRec ? stopFreestyleRec : startFreestyleRec}
              title={freestyleRec ? 'Stop recording freestyle loop — play notes now!' : `Record freestyle loop into ${String.fromCharCode(65 + activeLoopIdx)}`}
              aria-label={freestyleRec ? "Stop recording" : "Record freestyle"}
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
                      <button onClick={() => removeLoop(i)} title="Remove" aria-label="Remove loop"
                        style={{ ...miniBtn, width: 14, height: 14, padding: 0, fontSize: 8, color: 'rgba(239,68,68,0.6)' }}>✕</button>
                    )}
                  </div>
                )
              })}
              {loops.length < LOOP_COLORS.length && (
                <button onClick={addLoop} title="Add loop" aria-label="Add loop"
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
            {harmonyInfo && _synthBpmRegistry.size > 1 && (
              <span title={harmonyInfo.harmonic ? `Harmônico ${harmonyInfo.ratio} com ${harmonyInfo.otherBpm} BPM` : `Fora de sincronia com ${harmonyInfo.otherBpm} BPM`}
                style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: harmonyInfo.harmonic ? '#34d399' : 'rgba(239,68,68,0.5)', flexShrink: 0, cursor: 'default' }}>
                {harmonyInfo.harmonic ? `♪ ${harmonyInfo.ratio}` : '⚠'}
              </span>
            )}
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-30)', fontFamily: 'monospace', flexShrink: 0 }}>
              gate {seqGate < 1 ? `${Math.round(seqGate * 100)}%` : seqGate === 1 ? 'tie' : `${seqGate.toFixed(1)}×`}
            </span>
            <input type="range" min={0.05} max={1.5} step={0.01} value={seqGate}
              onChange={e => {
                const v = Number(e.target.value)
                setSeqGate(Math.abs(v - 1) < 0.04 ? 1 : v)
              }}
              style={{ flex: 1, accentColor: '#34d399', cursor: 'pointer', minWidth: 50 }}
              title="Gate: <1 silent gap · 1 tie · >1 legato overlap" />

            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-30)', fontFamily: 'monospace', flexShrink: 0 }}>
              swing {seqSwing === 0 ? 'off' : `${Math.round(seqSwing * 100)}%`}
            </span>
            <input type="range" min={0} max={0.9} step={0.01} value={seqSwing}
              onChange={e => setSeqSwing(Number(e.target.value))}
              style={{ width: 50, accentColor: '#f59e0b', cursor: 'pointer', flexShrink: 0 }}
              title="Swing: shuffle timing of off-beat steps" />

            <div style={{ paddingLeft: 10, paddingRight: 6, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
              <VintageToggle 
                value={analogMode} 
                onChange={v => {
                  setAnalogMode(v);
                  const e = engineRef.current;
                  if (e?.player) {
                    applyPitchAndSpeed(e.player, getPlayerDetune(e.player), v, fxRef.current.rate * sampleSpeedRef.current, fxRef.current.paul)
                  }
                }} 
              />
            </div>
          </div>
        </div>

        {/* Octave badge + Piano */}
        <div style={{ position: 'relative' }}>
          {octaveShift !== 0 && (
            <div style={{
              position: 'absolute', top: -2, right: 8, zIndex: 2,
              padding: '1px 7px', borderRadius: 4,
              background: 'rgba(99,102,241,0.25)', color: '#a5b4fc',
              fontSize: 9, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.1em',
            }}>
              C{3 + octaveShift}–C{5 + octaveShift} ({octaveShift > 0 ? '+' : ''}{octaveShift})
            </div>
          )}
          <Piano activeNotes={activeNotes}
            sequence={activeSequence} seqStep={seqSteps[activeLoopIdx] ?? -1} seqPlaying={seqPlaying}
            seqColor={LOOP_COLORS[activeLoopIdx % LOOP_COLORS.length]}
            onNoteOn={(name, cents) => {
              const t = transposeNote(name, octaveShift)
              noteOn(t.name, t.cents)
            }}
            onNoteOff={(name) => {
              const t = transposeNote(name, octaveShift)
              noteOff(t.name)
            }}
            onToggleSeq={toggleInSequence} />
        </div>
      </div>
    </Rnd>
    {showPresets && createPortal(
      <PresetMenu
        factory={FACTORY_PRESETS}
        user={userPresets}
        current={currentPreset}
        anchorRef={presetBtnRef}
        onApply={applyPreset}
        onSave={savePreset}
        onDelete={deletePreset}
        onClose={() => setShowPresets(false)}
        onExport={exportPreset}
        onImport={importPreset}
      />,
      document.body,
    )}
    <style>{`
      @keyframes sb-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      .synth-vel-btn:active { transform: scale(0.88) !important; background: rgba(255,255,255,0.16) !important; }
    `}</style>
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
  background: 'var(--border-subtle)', color: 'var(--text-40)',
  fontSize: 'var(--fs-sm)', fontWeight: 800, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function VintageToggle({ 
  value, onChange 
}: { 
  value: boolean; onChange: (v: boolean) => void 
}) {
  return (
    <div 
      onClick={() => onChange(!value)}
      title={value ? "Analog Mode: Pitch changes sample speed" : "Pitch Mode: Constant sample speed"}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: 'pointer', userSelect: 'none',
        padding: '0 2px',
      }}
    >
      <span style={{ fontSize: '6px', fontWeight: 900, fontFamily: 'monospace', color: !value ? '#34d399' : 'var(--text-40)', opacity: !value ? 1 : 0.4, transition: 'color 0.2s', textShadow: !value ? '0 0 4px rgba(52,211,153,0.5)' : 'none' }}>
        PITCH
      </span>

      {/* Essentialist Hole + Lever ONLY */}
      <div style={{
        width: 10, height: 18, borderRadius: 5,
        background: '#0a0a0a',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,1), 0 1px 0 rgba(255,255,255,0.06)',
        position: 'relative',
        perspective: '100px',
      }}>
        {/* Lever */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 4, height: 14,
          marginLeft: -2, marginTop: -7,
          borderRadius: 2,
          background: 'linear-gradient(to right, #888, #fff 30%, #666 80%, #333)',
          transformOrigin: 'center 75%',
          transform: value ? 'rotateX(45deg)' : 'rotateX(-45deg)',
          transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 2,
        }}>
          {/* Ball tip */}
          <div style={{
            position: 'absolute',
            top: -3, left: -1,
            width: 6, height: 6, borderRadius: '50%',
            background: 'radial-gradient(circle at 2px 2px, #fff, #999 60%, #444)',
            boxShadow: value ? '0 -1px 2px rgba(0,0,0,0.6)' : '0 1px 2px rgba(0,0,0,0.5)',
          }} />
        </div>
      </div>

      <span style={{ fontSize: '6px', fontWeight: 900, fontFamily: 'monospace', color: value ? '#f59e0b' : 'var(--text-40)', opacity: value ? 1 : 0.4, transition: 'color 0.2s', textShadow: value ? '0 0 4px rgba(245,158,11,0.5)' : 'none' }}>
        ANALOG
      </span>
    </div>
  )
}
