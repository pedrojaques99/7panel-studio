import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import { API, resolveUrl } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { ToneVisualizer } from '../lib/ToneVisualizer'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { WHITE_NOTES, NOTE_CENTS, KEY_NOTE } from '../lib/notes'
import { encodeWav } from '../lib/audio-utils'
import { BpmControl } from '../lib/BpmControl'
import { SynthKnob } from '../lib/SynthKnob'
import type { FxParams, FxChain } from '../lib/fx-rack'
import { FX_DEFAULTS, createFxChain, updateFxChain, disposeFxChain, driftFxParams } from '../lib/fx-rack'
import { EffectsRack } from '../lib/EffectsRack'

/* ── Notes ───────────────────────────────────────────────────────── */

type Note = typeof WHITE_NOTES[number] | 'REST'
const SEQ_NOTES: Note[] = ['REST', ...WHITE_NOTES]
const LAYER_COLORS = ['#00b860','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4']
const STEPS = 8

/* ── Types ───────────────────────────────────────────────────────── */

type Status = 'idle' | 'loading' | 'ready' | 'playing'
type GranularParams = { grainSize: number; overlap: number; playbackRate: number }
const GRANULAR_DEFAULTS: GranularParams = { grainSize: 0.3, overlap: 0.2, playbackRate: 0.4 }

type LayerData = {
  id: string; label: string; color: string
  urlInput: string; srcLabel: string; loadedUrl: string | null; status: Status
  params: GranularParams; fxParams: FxParams; activeNote: Note | null
  seqSteps: Note[]; expanded: boolean; muted: boolean; showFx: boolean
  trimStart: number; trimEnd: number
  genEnabled: Set<keyof FxParams | keyof GranularParams>
}

type AudioEntry = { player: Tone.GrainPlayer; chain: FxChain }

function makeLayer(idx: number): LayerData {
  return {
    id: crypto.randomUUID(), label: `Layer ${idx + 1}`,
    color: LAYER_COLORS[idx % LAYER_COLORS.length],
    urlInput: '', srcLabel: '', loadedUrl: null, status: 'idle',
    params: { ...GRANULAR_DEFAULTS }, fxParams: { ...FX_DEFAULTS }, activeNote: null,
    seqSteps: Array(STEPS).fill('REST'), expanded: true, muted: false, showFx: false,
    trimStart: 0, trimEnd: 0,
    genEnabled: new Set(),
  }
}

/* ── WAV encoder (PCM, no deps) ─────────────────────────────────── */



/* ── Note Keyboard ───────────────────────────────────────────────── */

function NoteKeyboard({ activeNote, onPlay, onRecord }: {
  activeNote: Note | null
  onPlay: (n: Note) => void
  onRecord?: (n: Note) => void
}) {
  const rows: [Note[], string[]][] = [
    [['C3','D3','E3','F3','G3','A3','B3'], ['z','x','c','v','b','n','m']],
    [['C4','D4','E4','F4','G4','A4','B4','C5'], ['a','s','d','f','g','h','j','k']],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {onRecord && (
        <span style={{ fontSize: 'var(--fs-3xs)', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
          left-click = play · right-click = record to seq
        </span>
      )}
      {rows.map(([notes, keys], ri) => (
        <div key={ri} style={{ display: 'flex', gap: 3 }}>
          {(notes as Note[]).map((n, i) => (
            <button key={n}
              onMouseDown={e => { if (e.button === 0) onPlay(n) }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onRecord?.(n) }}
              title={`${n} [${keys[i]}]${onRecord ? ' · right-click to record' : ''}`}
              style={{
                flex: 1, minWidth: 0, padding: '5px 2px', border: 'none', borderRadius: 5, cursor: 'pointer',
                background: activeNote === n ? 'var(--status-ok)' : 'var(--bg-hover)',
                color: activeNote === n ? '#000' : 'var(--text-40)',
                fontSize: 'var(--fs-2xs)', fontWeight: 900, textTransform: 'uppercase', transition: 'all 0.08s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                boxShadow: activeNote === n ? '0 0 6px var(--status-ok)' : 'none',
              }}>
              <span>{n.replace(/\d/, '')}{n.slice(-1)}</span>
              <span style={{ opacity: 0.4, fontSize: 'var(--fs-3xs)' }}>{keys[i]}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── YT Downloader widget ────────────────────────────────────────── */

function YtDownloader({ onLoaded, disabled }: {
  onLoaded: (url: string, label: string) => void
  disabled?: boolean
}) {
  const [ytUrl, setYtUrl] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function download() {
    const url = ytUrl.trim(); if (!url) return
    setState('loading'); setErrMsg('')
    try {
      const params = new URLSearchParams({ url })
      if (start.trim()) params.set('start', start.trim())
      if (end.trim()) params.set('end', end.trim())
      const res = await fetch(resolveUrl(`/api/yt-download?${params}`))
      const data = await res.json()
      if (data.error) { setState('err'); setErrMsg(data.error); return }
      const label = url.split('v=')[1]?.slice(0, 11) || 'yt-sample'
      onLoaded(resolveUrl(`/api/preview?path=${encodeURIComponent(data.path)}`), label)
      setState('idle')
    } catch (e) {
      setState('err'); setErrMsg(String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
      padding: '8px 10px', borderRadius: 8,
      background: 'rgba(255,0,0,0.04)', border: '1px solid rgba(255,80,80,0.12)' }}>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
        color: 'rgba(255,100,100,0.6)' }}>YouTube → MP3</span>
      <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && download()}
        onClick={e => e.stopPropagation()}
        placeholder="https://youtube.com/watch?v=…"
        style={{ ...ytInp, fontSize: 'var(--fs-base)' }} />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input value={start} onChange={e => setStart(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="start  0:30"
          style={{ ...ytInp, flex: 1, fontSize: 'var(--fs-sm)' }} />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)' }}>→</span>
        <input value={end} onChange={e => setEnd(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="end  1:45"
          style={{ ...ytInp, flex: 1, fontSize: 'var(--fs-sm)' }} />
        <button onClick={download} disabled={!ytUrl.trim() || disabled || state === 'loading'}
          style={{ ...smBtn, width: 'auto', padding: '3px 10px', fontSize: 'var(--fs-sm)', flexShrink: 0,
            background: state === 'loading' ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.7)',
            color: state === 'loading' ? 'var(--text-20)' : '#fff' }}>
          {state === 'loading' ? '⏳' : '↓'}
        </button>
      </div>
      {state === 'err' && (
        <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444', fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={errMsg}>{errMsg}</span>
      )}
    </div>
  )
}

const ytInp: React.CSSProperties = {
  padding: '5px 7px', borderRadius: 6,
  border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
  color: 'var(--text-pure)', outline: 'none', boxShadow: 'var(--shadow-input)', width: '100%',
}

/* ── Step Grid ───────────────────────────────────────────────────── */

function StepGrid({ steps, seqStep, seqPlaying, color, onCycle, onClear, onSetStep, recCursor }: {
  steps: Note[]; seqStep: number; seqPlaying: boolean; color: string
  onCycle: (i: number) => void; onClear: () => void
  onSetStep: (i: number, note: Note) => void
  recCursor?: number
}) {
  // track drag mode: 'cycle' paints with the note cycled on mousedown, 'erase' clears
  const paintRef = useRef<{ active: boolean; mode: 'cycle' | 'erase'; note: Note }>({
    active: false, mode: 'cycle', note: 'C4',
  })

  useEffect(() => {
    const up = () => { paintRef.current.active = false }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1].map(group => (
          <div key={group} style={{
            flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3,
            padding: '4px', borderRadius: 7,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {Array.from({ length: 4 }, (_, j) => {
              const i = group * 4 + j
              const note = steps[i]
              const isCurrent = seqPlaying && seqStep === i
              const isRecCursor = recCursor === i
              const hasNote = note !== 'REST'
              return (
                <button key={i}
                  title={`Step ${i + 1}: ${note} · click to cycle · right-click = erase · drag to paint`}
                  onPointerDown={e => {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                    if (e.button === 2) {
                      onSetStep(i, 'REST')
                      paintRef.current = { active: true, mode: 'erase', note: 'REST' }
                      return
                    }
                    // left-click: cycle, then use resulting note for drag
                    onCycle(i)
                    const cur = SEQ_NOTES.indexOf(steps[i])
                    const nextNote = SEQ_NOTES[(cur + 1) % SEQ_NOTES.length]
                    paintRef.current = { active: true, mode: 'cycle', note: nextNote }
                  }}
                  onPointerEnter={() => {
                    if (!paintRef.current.active) return
                    if (paintRef.current.mode === 'erase') onSetStep(i, 'REST')
                    else onSetStep(i, paintRef.current.note)
                  }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
                  style={{
                    padding: '5px 2px', border: 'none', borderRadius: 5, cursor: 'crosshair',
                    background: isCurrent
                      ? color
                      : hasNote ? `${color}44` : 'rgba(255,255,255,0.04)',
                    color: isCurrent ? '#000' : hasNote ? color : 'rgba(255,255,255,0.15)',
                    fontSize: 'var(--fs-2xs)', fontWeight: 900,
                    transition: 'background 0.07s, box-shadow 0.07s',
                    outline: isRecCursor ? `2px solid ${color}` : 'none',
                    outlineOffset: -2,
                    boxShadow: isCurrent
                      ? `0 0 8px ${color}88`
                      : hasNote ? `inset 0 0 0 1px ${color}66` : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    userSelect: 'none',
                  }}>
                  <span style={{ opacity: isCurrent ? 0.7 : isRecCursor ? 0.8 : 0.3, fontSize: 'var(--fs-3xs)' }}>
                    {isRecCursor ? '●' : i + 1}
                  </span>
                  <span>{hasNote ? note.replace(/(\d)/, '') + note.slice(-1) : '·'}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button onClick={onClear}
          style={{ ...smBtn, alignSelf: 'flex-end', width: 'auto', padding: '2px 8px', fontSize: 'var(--fs-xs)' }}
          title="Clear all steps">
          clear
        </button>
        <span style={{ fontSize: 'var(--fs-3xs)', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace' }}>
          click=cycle · right-click=erase · drag=paint
        </span>
      </div>
    </div>
  )
}

/* ── Layer Context Menu ──────────────────────────────────────────── */

type CtxMenu = { x: number; y: number; layerId: string } | null

function LayerContextMenu({ menu, layers, onClose, onMute, onSolo, onRemove, onDuplicate }: {
  menu: CtxMenu; layers: LayerData[]
  onClose: () => void; onMute: (id: string) => void
  onSolo: (id: string) => void; onRemove: (id: string) => void
  onDuplicate: (id: string) => void
}) {
  useEffect(() => {
    if (!menu) return
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close) }
  }, [menu, onClose])

  if (!menu) return null
  const layer = layers.find(l => l.id === menu.layerId)
  if (!layer) return null

  const items: { label: string; action: () => void; danger?: boolean }[] = [
    { label: layer.muted ? '🔊 Unmute' : '🔇 Mute', action: () => { onMute(menu.layerId); onClose() } },
    { label: '◉ Solo', action: () => { onSolo(menu.layerId); onClose() } },
    { label: '⧉ Duplicate', action: () => { onDuplicate(menu.layerId); onClose() } },
    { label: '✕ Remove', action: () => { onRemove(menu.layerId); onClose() }, danger: true },
  ]

  return (
    <div onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999,
        background: 'var(--bg-chassis)', border: '1px solid var(--border-light)',
        borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 140,
      }}>
      <div style={{
        padding: '5px 10px 4px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--fs-xs)', fontWeight: 900, color: layer.color, letterSpacing: '0.1em',
      }}>
        {layer.label}
      </div>
      {items.map(item => (
        <button key={item.label} onClick={item.action}
          style={{
            display: 'block', width: '100%', padding: '7px 12px', border: 'none',
            background: 'transparent', color: item.danger ? '#ef4444' : 'var(--text-70)',
            fontSize: 'var(--fs-sm)', textAlign: 'left', cursor: 'pointer',
            transition: 'background 0.08s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

/* ── Waveform Trim ──────────────────────────────────────────────── */

function fmtTimecode(s: number) {
  if (!isFinite(s) || s < 0) return '0:00.000'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 1000)
  return `${m}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function WaveformTrim({ buffer, color, trimStart, trimEnd, isPlaying, playbackRate, onTrimChange }: {
  buffer: Tone.ToneAudioBuffer
  color: string
  trimStart: number
  trimEnd: number
  isPlaying: boolean
  playbackRate: number
  onTrimChange: (start: number, end: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const staticRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: 'start' | 'end' | 'region'; startX: number; origStart: number; origEnd: number } | null>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const epochRef = useRef(0)
  const dur = buffer.duration
  const W = 320
  const H = 48

  const trimStartRef = useRef(trimStart); trimStartRef.current = trimStart
  const trimEndRef = useRef(trimEnd); trimEndRef.current = trimEnd
  const playbackRateRef = useRef(playbackRate); playbackRateRef.current = playbackRate

  // Track play epoch for playhead position
  useEffect(() => {
    if (isPlaying) epochRef.current = performance.now()
  }, [isPlaying])

  // Animate playhead via rAF (no re-renders)
  useEffect(() => {
    if (!isPlaying) {
      if (playheadRef.current) playheadRef.current.style.opacity = '0'
      cancelAnimationFrame(rafRef.current)
      return
    }
    function tick() {
      const el = playheadRef.current
      const container = containerRef.current
      if (!el || !container) { rafRef.current = requestAnimationFrame(tick); return }

      const ts = trimStartRef.current
      const te = trimEndRef.current
      const loopDur = (te - ts) / playbackRateRef.current
      if (loopDur <= 0) { rafRef.current = requestAnimationFrame(tick); return }

      const elapsed = (performance.now() - epochRef.current) / 1000
      const pos = ts + ((elapsed * playbackRateRef.current) % (te - ts))
      const pct = (pos / dur) * 100

      el.style.opacity = '1'
      el.style.left = `${pct}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, dur])

  useEffect(() => {
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const ctx = off.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const data = buffer.toArray(0) as Float32Array
    const step = Math.ceil(data.length / W)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < W; x++) {
      let mn = 1, mx = -1
      for (let j = 0; j < step; j++) {
        const s = data[x * step + j] ?? 0
        if (s < mn) mn = s; if (s > mx) mx = s
      }
      ctx.moveTo(x, ((1 - mx) / 2) * H)
      ctx.lineTo(x, ((1 - mn) / 2) * H)
    }
    ctx.stroke()
    staticRef.current = off
  }, [buffer])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)

    const ts = (trimStart / dur) * W
    const te = (trimEnd / dur) * W

    // dim outside region
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, ts, H)
    ctx.fillRect(te, 0, W - te, H)

    // active region highlight
    ctx.fillStyle = color + '12'
    ctx.fillRect(ts, 0, te - ts, H)

    // static waveform
    if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0)

    // tinted active waveform
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = color + '30'
    ctx.fillRect(ts, 0, te - ts, H)
    ctx.restore()

    // trim markers
    ctx.strokeStyle = color + 'bb'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ts, 0); ctx.lineTo(ts, H)
    ctx.moveTo(te, 0); ctx.lineTo(te, H)
    ctx.stroke()

    // handle grips
    for (const px of [ts, te]) {
      ctx.fillStyle = color
      ctx.fillRect(px - 3, H / 2 - 8, 6, 16)
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(px - 1, H / 2 - 4, 2, 8)
    }
  }, [trimStart, trimEnd, dur, color])

  useEffect(() => { draw() }, [draw])

  function pxToTime(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const ratio = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(dur, ratio * dur))
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    const t = pxToTime(e.clientX)
    const threshold = dur * 0.02
    let handle: 'start' | 'end' | 'region'
    if (Math.abs(t - trimStart) < threshold) handle = 'start'
    else if (Math.abs(t - trimEnd) < threshold) handle = 'end'
    else if (t > trimStart && t < trimEnd) handle = 'region'
    else return
    dragRef.current = { handle, startX: e.clientX, origStart: trimStart, origEnd: trimEnd }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const { handle, startX, origStart, origEnd } = dragRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = ((e.clientX - startX) / rect.width) * dur
    const MIN_SPAN = 0.05

    if (handle === 'start') {
      const ns = Math.max(0, Math.min(origEnd - MIN_SPAN, origStart + dx))
      onTrimChange(ns, trimEnd)
    } else if (handle === 'end') {
      const ne = Math.max(origStart + MIN_SPAN, Math.min(dur, origEnd + dx))
      onTrimChange(trimStart, ne)
    } else {
      const span = origEnd - origStart
      let ns = origStart + dx
      let ne = origEnd + dx
      if (ns < 0) { ns = 0; ne = span }
      if (ne > dur) { ne = dur; ns = dur - span }
      onTrimChange(ns, ne)
    }
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function onDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    onTrimChange(0, dur)
  }

  const trimDur = trimEnd - trimStart

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: 'var(--text-20)', letterSpacing: '0.05em' }}>
          {fmtTimecode(trimStart)}
        </span>
        <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: color, fontWeight: 700, letterSpacing: '0.05em' }}>
          {isPlaying ? '◉ ' : ''}{fmtTimecode(trimDur)}
        </span>
        <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: 'var(--text-20)', letterSpacing: '0.05em' }}>
          {fmtTimecode(trimEnd)}
        </span>
      </div>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        title="Drag handles to trim · Double-click to reset"
        style={{ position: 'relative', cursor: 'ew-resize', touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: '100%', height: H, borderRadius: 6, background: 'rgba(0,0,0,0.4)', display: 'block' }}
        />
        {/* Playhead */}
        <div ref={playheadRef} style={{
          position: 'absolute', top: 0, bottom: 0, width: 2,
          background: color,
          boxShadow: `0 0 6px ${color}, 0 0 2px ${color}`,
          borderRadius: 1,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.15s',
        }} />
      </div>
    </div>
  )
}

/* ── Layer Card ──────────────────────────────────────────────────── */

function LayerCard({ layer, focused, seqStep, seqPlaying, analyser, buffer, onFocus, onUpdate, onLoadUrl, onLoadFile, onToggleDrone, onTriggerNote, onRemove, onContextMenu, onToggleGen }: {
  layer: LayerData; focused: boolean; seqStep: number; seqPlaying: boolean
  analyser: Tone.Analyser | null
  buffer: Tone.ToneAudioBuffer | null
  onFocus: () => void; onUpdate: (patch: Partial<LayerData>) => void
  onLoadUrl: (url: string, label: string) => void; onLoadFile: (file: File) => void
  onToggleDrone: () => void; onTriggerNote: (note: Note) => void; onRemove: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleGen: (key: keyof FxParams | keyof GranularParams) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [showYt, setShowYt] = useState(false)
  // recording cursor: right-click a note on the keyboard to record to this step, then advances
  const [recCursor, setRecCursor] = useState(0)
  const isPlaying = layer.status === 'playing'
  const hasPlayer = layer.status === 'ready' || isPlaying

  function setParam<K extends keyof GranularParams>(key: K, v: GranularParams[K]) {
    onUpdate({ params: { ...layer.params, [key]: v } })
  }
  function cycleStep(i: number) {
    const steps = [...layer.seqSteps]
    const cur = SEQ_NOTES.indexOf(steps[i])
    steps[i] = SEQ_NOTES[(cur + 1) % SEQ_NOTES.length]
    onUpdate({ seqSteps: steps })
    setRecCursor(i) // clicking a step moves the recording cursor there
  }
  function setStep(i: number, note: Note) {
    const steps = [...layer.seqSteps]
    steps[i] = note
    onUpdate({ seqSteps: steps })
  }
  function recordNote(note: Note) {
    // right-click on keyboard: write note to rec cursor position, advance cursor
    setStep(recCursor, note)
    setRecCursor(c => (c + 1) % STEPS)
  }
  function handleUrlLoad() {
    const raw = layer.urlInput.trim(); if (!raw) return
    const url = raw.startsWith('http') ? raw : `${API}/api/preview?path=${encodeURIComponent(raw)}`
    onLoadUrl(url, raw.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'sample')
  }

  return (
    <div
      onClick={onFocus}
      onContextMenu={onContextMenu}
      style={{
        borderRadius: 12, padding: '10px 12px',
        background: focused ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${focused ? layer.color + '55' : 'var(--bg-hover)'}`,
        display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.15s',
        cursor: focused ? 'default' : 'pointer',
        boxShadow: focused ? `inset 0 0 0 1px ${layer.color}22` : 'none',
      }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: layer.muted ? 'rgba(255,255,255,0.2)' : layer.color,
          boxShadow: isPlaying && !layer.muted ? `0 0 8px ${layer.color}` : 'none',
          transition: 'box-shadow 0.2s, background 0.2s',
        }} />
        <input value={layer.label} onChange={e => onUpdate({ label: e.target.value })}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            color: layer.muted ? 'var(--text-20)' : 'var(--text-70)',
            fontSize: 'var(--fs-md)', fontWeight: 700, cursor: 'text',
          }} />

        {isPlaying && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <ToneVisualizer analyser={analyser} color={layer.color} />
          </div>
        )}

        {layer.activeNote && layer.activeNote !== 'REST' && (
          <span style={{
            fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: layer.color, fontWeight: 900,
            padding: '1px 5px', borderRadius: 4, background: `${layer.color}22`, flexShrink: 0,
          }}>
            {layer.activeNote}
          </span>
        )}

        {layer.srcLabel && !isPlaying && (
          <span style={{
            fontSize: 'var(--fs-xs)', color: 'var(--text-20)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 72, flexShrink: 0,
          }}>
            {layer.status === 'loading' ? '⏳' : layer.srcLabel}
          </span>
        )}

        <button onClick={e => { e.stopPropagation(); onUpdate({ muted: !layer.muted }) }}
          title={layer.muted ? "Unmute [M in context menu]" : "Mute"}
          aria-label={layer.muted ? "Unmute" : "Mute"}
          style={{
            ...smBtn,
            background: layer.muted ? 'rgba(239,68,68,0.3)' : 'var(--bg-hover)',
            color: layer.muted ? '#ef4444' : 'var(--text-20)',
          }}>M</button>

        <button onClick={e => { e.stopPropagation(); onToggleDrone() }} disabled={!hasPlayer}
          title={isPlaying ? "Stop [▶ toggle]" : "Play drone"}
          aria-label={isPlaying ? "Stop" : "Play"}
          style={{
            ...smBtn,
            background: isPlaying ? layer.color : 'var(--border-subtle)',
            color: isPlaying ? '#000' : 'var(--text-40)',
            opacity: hasPlayer ? 1 : 0.35,
          }}>
          {isPlaying ? '⏹' : '▶'}
        </button>

        <button onClick={e => { e.stopPropagation(); onUpdate({ expanded: !layer.expanded }) }}
          aria-label={layer.expanded ? "Collapse" : "Expand"}
          style={smBtn}>{layer.expanded ? '▲' : '▼'}</button>

        <button onClick={e => { e.stopPropagation(); onRemove() }}
          title="Remove layer [right-click for more options]" aria-label="Remove layer"
          style={{ ...smBtn, color: 'rgba(239,68,68,0.5)' }}>×</button>
      </div>

      {/* Expanded body */}
      {layer.expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Load */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input value={layer.urlInput} onChange={e => onUpdate({ urlInput: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
              onClick={e => e.stopPropagation()}
              placeholder="URL or path…"
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 'var(--radius-input)',
                border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
                color: 'var(--text-pure)', fontSize: 'var(--fs-base)', outline: 'none', boxShadow: 'var(--shadow-input)',
              }} />
            <button onClick={handleUrlLoad} disabled={!layer.urlInput.trim() || layer.status === 'loading'}
              style={{ ...smBtn, width: 28 }}>↵</button>
            <button onClick={() => fileRef.current?.click()} disabled={layer.status === 'loading'}
              style={{ ...smBtn, width: 28 }} title="Browse" aria-label="Browse files">📁</button>
            <button onClick={e => { e.stopPropagation(); setShowYt(v => !v) }}
              style={{ ...smBtn, width: 28, color: showYt ? '#ef4444' : 'rgba(255,80,80,0.55)' }}
              title="YouTube download" aria-label="YouTube download">YT</button>
            <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.aif,.aiff"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onLoadFile(f); e.target.value = '' }} />
          </div>

          {showYt && (
            <YtDownloader
              disabled={layer.status === 'loading'}
              onLoaded={(url, label) => { onLoadUrl(url, label); setShowYt(false) }}
            />
          )}

          {/* Waveform trim */}
          {buffer && buffer.duration > 0 && (
            <WaveformTrim
              buffer={buffer}
              color={layer.color}
              trimStart={layer.trimStart}
              trimEnd={layer.trimEnd || buffer.duration}
              isPlaying={isPlaying}
              playbackRate={layer.params.playbackRate}
              onTrimChange={(s, e) => onUpdate({ trimStart: s, trimEnd: e })}
            />
          )}

          {/* Note keyboard (focused only) */}
          {focused && (
            <NoteKeyboard
              activeNote={layer.activeNote}
              onPlay={onTriggerNote}
              onRecord={recordNote}
            />
          )}

          {/* Steps */}
          <StepGrid
            steps={layer.seqSteps} seqStep={seqStep} seqPlaying={seqPlaying}
            color={layer.color} onCycle={cycleStep} onSetStep={setStep}
            onClear={() => { onUpdate({ seqSteps: Array(STEPS).fill('REST') }); setRecCursor(0) }}
            recCursor={focused ? recCursor : undefined}
          />

          {/* Granular Params */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
            padding: '10px 6px 8px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <SynthKnob label="GRAIN" value={layer.params.grainSize} min={0.05} max={1.0} size={48}
              accent={layer.color} fmt={v => `${v.toFixed(2)}s`}
              onChange={v => setParam('grainSize', v)}
              genActive={layer.genEnabled.has('grainSize')} onRightClick={() => onToggleGen('grainSize')} />
            <SynthKnob label="OVERLAP" value={layer.params.overlap} min={0.01} max={0.5} size={48}
              accent={layer.color} fmt={v => v.toFixed(2)}
              onChange={v => setParam('overlap', v)}
              genActive={layer.genEnabled.has('overlap')} onRightClick={() => onToggleGen('overlap')} />
            <SynthKnob label="RATE" value={layer.params.playbackRate} min={0.05} max={10.0} size={48}
              accent={layer.color} fmt={v => `${v.toFixed(2)}×`} log
              onChange={v => setParam('playbackRate', v)}
              genActive={layer.genEnabled.has('playbackRate')} onRightClick={() => onToggleGen('playbackRate')} />
          </div>

          {/* FX Rack toggle + collapsible */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); onUpdate({ showFx: !layer.showFx }) }}
              style={{
                ...smBtn, width: 'auto', padding: '3px 10px', alignSelf: 'flex-start',
                fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', fontWeight: 900,
                background: layer.showFx ? `${layer.color}22` : 'var(--bg-hover)',
                color: layer.showFx ? layer.color : 'var(--text-30)',
                border: layer.showFx ? `1px solid ${layer.color}33` : '1px solid transparent',
              }}>
              FX {layer.showFx ? '▲' : '▼'}
            </button>
            {layer.showFx && (
              <EffectsRack
                compact
                params={layer.fxParams}
                accent={layer.color}
                onChange={patch => onUpdate({ fxParams: { ...layer.fxParams, ...patch } })}
                genEnabled={layer.genEnabled as Set<keyof FxParams>}
                onToggleGen={k => onToggleGen(k)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Export Section ──────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ExportSection({ layers, bpm, seqSteps: _seqSteps }: {
  layers: LayerData[]; bpm: number; seqSteps?: never
}) {
  const [duration, setDuration] = useState(30)
  const [withSeq, setWithSeq] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')

  async function doExport() {
    const active = layers.filter(l => !l.muted && l.loadedUrl)
    if (active.length === 0) { setProgress('Nenhuma camada carregada'); return }
    setExporting(true)
    setProgress('Rendering…')
    try {
      const buf = await Tone.Offline(async () => {
        for (const layer of active) {
          // TODO: use full FxChain in offline context
          const reverb = new Tone.Reverb({ decay: layer.fxParams.reverbDecay, wet: layer.fxParams.reverbWet })
          await reverb.generate()
          reverb.toDestination()
          const player = new Tone.GrainPlayer({ url: layer.loadedUrl!, loop: true })
          await Tone.loaded()
          player.grainSize = layer.params.grainSize
          player.overlap = layer.params.overlap
          player.playbackRate = layer.params.playbackRate
          const activeKey = layer.activeNote ?? 'C4'
          player.detune = activeKey !== 'REST' ? NOTE_CENTS[activeKey] ?? 0 : 0
          player.volume.value = Tone.gainToDb(layer.fxParams.vol)
          player.connect(reverb)

          if (withSeq) {
            const stepsCopy = [...layer.seqSteps]
            Tone.getTransport().bpm.value = bpm
            let idx = 0
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            new Tone.Sequence((_time) => {
              const note = stepsCopy[idx % STEPS]
              if (note !== 'REST') player.detune = NOTE_CENTS[note] ?? 0
              idx++
            }, Array.from({ length: STEPS }, (_, i) => i), '4n').start(0)
            player.start(0)
            Tone.getTransport().start(0)
          } else {
            player.start(0)
          }
        }
      }, duration)

      setProgress('Encoding…')
      const blob = encodeWav(buf.get()!)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `drone-${Date.now()}.wav`; a.click()
      URL.revokeObjectURL(url)
      setProgress(`Pronto — ${duration}s WAV`)
    } catch (e) {
      console.error('Export error', e)
      setProgress('Falha na exportação')
    }
    setExporting(false)
  }

  const durationLabel = duration >= 60
    ? `${Math.floor(duration / 60)}m${duration % 60 > 0 ? `${duration % 60}s` : ''}`
    : `${duration}s`

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-20)' }}>Export WAV</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace', flexShrink: 0, minWidth: 32 }}>{durationLabel}</span>
        <input type="range" min={5} max={3600} step={5} value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--status-ok)', cursor: 'pointer' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={withSeq} onChange={e => setWithSeq(e.target.checked)}
            style={{ accentColor: 'var(--status-ok)' }} />
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)' }}>seq</span>
        </label>
        <button onClick={doExport} disabled={exporting}
          style={{
            ...smBtn, width: 'auto', padding: '4px 12px', fontSize: 'var(--fs-sm)',
            background: exporting ? 'rgba(255,255,255,0.05)' : 'var(--bg-btn-silver)',
            color: exporting ? 'var(--text-20)' : '#000', fontWeight: 800,
          }}>
          {exporting ? '…' : '↓ WAV'}
        </button>
      </div>
      {progress && <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-40)' }}>{progress}</span>}
    </div>
  )
}

/* ── Panel ───────────────────────────────────────────────────────── */

let droneCaptureDest: MediaStreamAudioDestinationNode | null = null

function getDroneCaptureStream(): MediaStream | null {
  return droneCaptureDest?.stream ?? null
}

function ensureDroneTap() {
  if (droneCaptureDest) return
  const rawCtx = Tone.getContext().rawContext as AudioContext
  droneCaptureDest = rawCtx.createMediaStreamDestination()
  Tone.getDestination().connect(droneCaptureDest)
}

export function DronePanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('drone', { x: 880, y: 160, w: 360, h: 500 })

  const [layers, setLayers] = useState<LayerData[]>(() => [makeLayer(0)])
  const [focusedId, setFocusedId] = useState<string>('')
  const [seqPlaying, setSeqPlaying] = useState(false)
  const [seqStep, setSeqStep] = useState(-1)
  const [bpm, setBpm] = useState(80)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const audioMap = useRef<Map<string, AudioEntry>>(new Map())
  const masterSeqRef = useRef<Tone.Sequence | null>(null)
  const layersRef = useRef(layers)
  layersRef.current = layers

  // seqPlaying ref for keyboard handler
  const seqPlayingRef = useRef(seqPlaying)
  seqPlayingRef.current = seqPlaying

  useEffect(() => {
    captureRegistry.register({ id: 'drone', label: 'Drone', getStream: getDroneCaptureStream })
    return () => captureRegistry.unregister('drone')
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focusedId && layers.length > 0) setFocusedId(layers[0].id)
  }, [])

  function cleanupLayer(id: string) {
    const e = audioMap.current.get(id); if (!e) return
    try { e.player.stop() } catch { /* noop */ }
    try { e.player.dispose() } catch { /* noop */ }
    disposeFxChain(e.chain)
    audioMap.current.delete(id)
  }

  useEffect(() => () => {
    stopSeq()
    audioMap.current.forEach((_, id) => cleanupLayer(id))
  }, [])

  async function loadLayerUrl(id: string, url: string, label: string, params: GranularParams, fxParams: FxParams) {
    cleanupLayer(id)
    updateLayer(id, { status: 'loading', srcLabel: label, loadedUrl: null })
    try {
      await Tone.start()
      ensureDroneTap()
      const chain = createFxChain(fxParams, droneCaptureDest ?? undefined)
      const player = new Tone.GrainPlayer({ url, loop: true })
      await Tone.loaded()
      player.grainSize = params.grainSize
      player.overlap = params.overlap
      player.playbackRate = params.playbackRate
      player.detune = 0
      player.volume.value = 0 // volume is handled by chain.outputGain
      player.connect(chain.input)
      audioMap.current.set(id, { player, chain })
      updateLayer(id, { status: 'ready', loadedUrl: url, trimStart: 0, trimEnd: player.buffer.duration })
    } catch (e) {
      console.error('DronePanel load error', e)
      updateLayer(id, { status: 'idle' })
    }
  }

  async function handleLoadFile(id: string, file: File, params: GranularParams, fxParams: FxParams) {
    const blob = URL.createObjectURL(file)
    await loadLayerUrl(id, blob, file.name.replace(/\.[^.]+$/, ''), params, fxParams)
  }

  function syncGranularParams(id: string, params: GranularParams) {
    const e = audioMap.current.get(id); if (!e) return
    e.player.grainSize = params.grainSize
    e.player.overlap = params.overlap
    e.player.playbackRate = params.playbackRate
  }

  function syncFxParams(id: string, patch: Partial<FxParams>) {
    const e = audioMap.current.get(id); if (!e) return
    updateFxChain(e.chain, patch)
  }

  function syncTrim(id: string, trimStart: number, trimEnd: number) {
    const e = audioMap.current.get(id); if (!e) return
    e.player.loopStart = trimStart
    e.player.loopEnd = trimEnd > 0 ? trimEnd : e.player.buffer.duration
  }

  function updateLayer(id: string, patch: Partial<LayerData>) {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const next = { ...l, ...patch }
      if (patch.params) syncGranularParams(id, next.params)
      if (patch.fxParams) syncFxParams(id, patch.fxParams)
      if (patch.trimStart !== undefined || patch.trimEnd !== undefined) syncTrim(id, next.trimStart, next.trimEnd)
      return next
    }))
  }

  function toggleGen(id: string, key: keyof FxParams | keyof GranularParams) {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const next = new Set(l.genEnabled)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...l, genEnabled: next }
    }))
  }

  // Generative drift interval
  const driftRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const anyGenActive = layers.some(l => l.genEnabled.size > 0)

  useEffect(() => {
    if (!anyGenActive) {
      if (driftRef.current) { clearInterval(driftRef.current); driftRef.current = null }
      return
    }
    const nudge = (v: number, lo: number, hi: number, strength = 0.04) => {
      const d = (Math.random() - 0.5) * 2 * strength * (hi - lo)
      return Math.max(lo, Math.min(hi, v + d))
    }
    const nudgeLog = (v: number, lo: number, hi: number, strength = 0.04) => {
      const d = (Math.random() - 0.5) * 2 * strength * (Math.log(hi) - Math.log(lo))
      return Math.max(lo, Math.min(hi, Math.exp(Math.log(v) + d)))
    }
    const tick = () => {
      setLayers(prev => prev.map(l => {
        if (l.genEnabled.size === 0) return l
        const en = l.genEnabled
        const baseDrifted = driftFxParams(l.fxParams, en as Set<keyof FxParams>)
        const params = { ...l.params }
        if (en.has('grainSize')) params.grainSize = nudge(params.grainSize, 0.05, 1.0, 0.04)
        if (en.has('overlap')) params.overlap = nudge(params.overlap, 0.01, 0.5, 0.04)
        if (en.has('playbackRate')) params.playbackRate = nudgeLog(params.playbackRate, 0.05, 10.0, 0.03)
        const e = audioMap.current.get(l.id)
        if (e) {
          updateFxChain(e.chain, baseDrifted, 0.8)
          e.player.grainSize = params.grainSize
          e.player.overlap = params.overlap
          e.player.playbackRate = params.playbackRate
        }
        return { ...l, fxParams: baseDrifted, params }
      }))
    }
    driftRef.current = setInterval(tick, 800 + Math.random() * 400)
    return () => { if (driftRef.current) clearInterval(driftRef.current) }
  }, [anyGenActive])

  function toggleDrone(id: string) {
    const layer = layersRef.current.find(l => l.id === id); if (!layer) return
    const e = audioMap.current.get(id); if (!e) return
    if (layer.status === 'playing') { e.player.stop(); updateLayer(id, { status: 'ready' }) }
    else { e.player.start(); updateLayer(id, { status: 'playing' }) }
  }

  const triggerNote = useCallback((id: string, note: Note) => {
    updateLayer(id, { activeNote: note })
    const e = audioMap.current.get(id); if (!e || note === 'REST') return
    e.player.detune = NOTE_CENTS[note] ?? 0
    const layer = layersRef.current.find(l => l.id === id)
    if (layer && layer.status !== 'playing') { e.player.start(); updateLayer(id, { status: 'playing' }) }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return

      // Space = seq toggle
      if (ev.key === ' ') {
        ev.preventDefault()
        if (seqPlayingRef.current) stopSeq(); else startSeq()
        return
      }

      // Tab = cycle focused layer
      if (ev.key === 'Tab') {
        ev.preventDefault()
        const cur = layersRef.current.findIndex(l => l.id === focusedId)
        const next = layersRef.current[(cur + 1) % layersRef.current.length]
        if (next) setFocusedId(next.id)
        return
      }

      // Note keys → play on focused layer
      const note = KEY_NOTE[ev.key.toLowerCase()]
      if (note && focusedId) triggerNote(focusedId, note)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedId, triggerNote])

  useEffect(() => {
    function onPs(e: Event) {
      const { url, label } = (e as CustomEvent).detail
      if (!focusedId) return
      const fl = layersRef.current.find(l => l.id === focusedId)
      loadLayerUrl(focusedId, url, label, fl?.params ?? GRANULAR_DEFAULTS, fl?.fxParams ?? FX_DEFAULTS)
    }
    window.addEventListener('ps:load', onPs)
    return () => window.removeEventListener('ps:load', onPs)
  }, [focusedId])

  function stopSeq() {
    masterSeqRef.current?.stop(); masterSeqRef.current?.dispose(); masterSeqRef.current = null
    Tone.getTransport().stop(); setSeqPlaying(false); setSeqStep(-1)
  }

  function startSeq() {
    stopSeq()
    Tone.getTransport().bpm.value = bpm
    let idx = 0
    const seq = new Tone.Sequence((time) => {
      const step = idx % STEPS
      Tone.getDraw().schedule(() => setSeqStep(step), time)
      idx++
      layersRef.current.forEach(layer => {
        if (layer.muted) return
        const note = layer.seqSteps[step]; if (note === 'REST') return
        const e = audioMap.current.get(layer.id); if (!e) return
        e.player.detune = NOTE_CENTS[note] ?? 0
        if (layer.status !== 'playing') {
          e.player.start()
          setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, status: 'playing' } : l))
        }
        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, activeNote: note } : l))
      })
    }, Array.from({ length: STEPS }, (_, i) => i), '4n')
    seq.start(0); masterSeqRef.current = seq; Tone.getTransport().start(); setSeqPlaying(true)
  }

  useEffect(() => { Tone.getTransport().bpm.value = bpm }, [bpm])

  function addLayer() {
    if (layers.length >= 6) return
    const l = makeLayer(layers.length)
    setLayers(prev => [...prev, l]); setFocusedId(l.id)
  }

  function removeLayer(id: string) {
    cleanupLayer(id)
    setLayers(prev => {
      const next = prev.filter(l => l.id !== id)
      if (focusedId === id && next.length > 0) setFocusedId(next[0].id)
      return next
    })
  }

  function soloLayer(id: string) {
    setLayers(prev => prev.map(l => ({ ...l, muted: l.id !== id })))
  }

  function duplicateLayer(id: string) {
    if (layers.length >= 6) return
    const src = layersRef.current.find(l => l.id === id)
    if (!src) return
    const dup: LayerData = {
      ...src, id: crypto.randomUUID(),
      label: src.label + ' copy',
      color: LAYER_COLORS[layers.length % LAYER_COLORS.length],
      status: 'idle', loadedUrl: null, srcLabel: '', activeNote: null,
    }
    setLayers(prev => [...prev, dup]); setFocusedId(dup.id)
  }

  function handleLayerContextMenu(e: React.MouseEvent, layerId: string) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, layerId })
  }

  return (
    <CaptureIdContext.Provider value="drone">
      <LayerContextMenu
        menu={ctxMenu}
        layers={layers}
        onClose={() => setCtxMenu(null)}
        onMute={id => updateLayer(id, { muted: !layers.find(l => l.id === id)?.muted })}
        onSolo={soloLayer}
        onRemove={removeLayer}
        onDuplicate={duplicateLayer}
      />
      <Rnd
        default={{ x: geo.x, y: geo.y, width: geo.w || 360, height: 'auto' }}
        minWidth={320} maxWidth={600}
        enableResizing={{ right: true, left: true }}
        bounds={undefined}
        dragHandleClassName="drone-drag"
        className={`panel-drag${isDragging('drone') ? ' dragging' : ''}`}
        scale={scale}
        onDragStart={() => bringToFront('drone')}
        onDragStop={(_e, d) => { saveGeo('drone', { x: d.x, y: d.y }); endDrag('drone') }}
        onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo('drone', { w: ref.offsetWidth, x: pos.x, y: pos.y })}
        style={{ zIndex: zOf('drone', 13) }}
      >
        <div style={{
          borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
          boxShadow: 'var(--shadow-chassis)', padding: '16px 18px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <PanelHeader title="// Drone" onClose={onClose} className="drone-drag">
            <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BpmControl bpm={bpm} onChange={setBpm} min={2} max={300} />
              <button onClick={seqPlaying ? stopSeq : startSeq}
                title="Space to toggle"
                aria-label={seqPlaying ? "Stop sequencer" : "Play sequencer"}
                style={{
                  ...smBtn, padding: '3px 10px', width: 'auto',
                  background: seqPlaying ? '#3b82f6' : 'var(--border-subtle)',
                  color: seqPlaying ? '#fff' : 'var(--text-40)',
                  boxShadow: seqPlaying ? '0 0 8px #3b82f688' : 'none',
                }}>
                {seqPlaying ? '⏹ Seq' : '▶ Seq'}
              </button>
              {layers.length < 6 && (
                <button onClick={addLayer}
                  style={{ ...smBtn, padding: '3px 8px', width: 'auto', color: 'var(--status-ok)' }}
                  title="Add layer" aria-label="Add layer">+ Layer</button>
              )}
              <button onClick={() => setShowShortcuts(v => !v)}
                title="Keyboard shortcuts" aria-label="Keyboard shortcuts"
                style={{ ...smBtn, opacity: showShortcuts ? 1 : 0.4, fontSize: 'var(--fs-xs)' }}>?</button>
            </div>
          </PanelHeader>

          {/* Shortcuts hint */}
          {showShortcuts && (
            <div style={{
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px',
            }}>
              {[
                ['Space', 'play / stop seq'],
                ['Tab', 'next layer focus'],
                ['a–k, z–m', 'play notes'],
                ['Scroll on BPM', 'adjust tempo'],
                ['Shift+scroll', '×5 speed'],
                ['Drag steps', 'paint / erase'],
                ['Right-click step', 'erase step'],
                ['Right-click layer', 'more options'],
                ['Double-click value', 'reset to default'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: 'var(--status-ok)', fontWeight: 700, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-20)' }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '75vh', overflowY: 'auto' }}>
            {layers.map(layer => (
              <LayerCard
                key={layer.id} layer={layer}
                focused={focusedId === layer.id}
                seqStep={seqStep} seqPlaying={seqPlaying}
                analyser={audioMap.current.get(layer.id)?.chain.analyser ?? null}
                buffer={audioMap.current.get(layer.id)?.player.buffer ?? null}
                onFocus={() => setFocusedId(layer.id)}
                onUpdate={patch => updateLayer(layer.id, patch)}
                onLoadUrl={(url, label) => loadLayerUrl(layer.id, url, label, layer.params, layer.fxParams)}
                onLoadFile={file => handleLoadFile(layer.id, file, layer.params, layer.fxParams)}
                onToggleDrone={() => toggleDrone(layer.id)}
                onTriggerNote={note => triggerNote(layer.id, note)}
                onRemove={() => removeLayer(layer.id)}
                onContextMenu={e => handleLayerContextMenu(e, layer.id)}
                onToggleGen={key => toggleGen(layer.id, key)}
              />
            ))}
          </div>

          <ExportSection layers={layers} bpm={bpm} />
        </div>
      </Rnd>
    </CaptureIdContext.Provider>
  )
}

const smBtn: React.CSSProperties = {
  width: 26, height: 22, padding: 0, border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'var(--bg-hover)', color: 'var(--text-40)',
  fontSize: 'var(--fs-base)', fontWeight: 800, flexShrink: 0, transition: 'all 0.1s',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
