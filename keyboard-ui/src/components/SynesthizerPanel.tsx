import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { SynthKnob } from '../lib/SynthKnob'
import {
  imageToChords, imageMeanColor, tempoFromColor, pixelToNote, saturationToReverb,
  type Chord, type ScanMode, type ScaleMode,
} from '../lib/synesthizer'
import { noteBus } from '../lib/note-bus'
import { encodeWav } from '../lib/audio-utils'

/* ── IndexedDB image cache ──────────────────────────────────────── */
const DB_NAME = 'synesthizer-cache'
const STORE = 'images'
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function cacheImage(blob: Blob) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(blob, 'last')
  db.close()
}
async function loadCachedImage(): Promise<Blob | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get('last')
      req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
      req.onerror = () => { db.close(); resolve(null) }
    })
  } catch { return null }
}

/* ── Capture ────────────────────────────────────────────────────── */
let synCaptureDest: MediaStreamAudioDestinationNode | null = null
function getSynCaptureStream(): MediaStream | null { return synCaptureDest?.stream ?? null }
function ensureSynTap() {
  if (synCaptureDest) return
  const rawCtx = Tone.getContext().rawContext as AudioContext
  synCaptureDest = rawCtx.createMediaStreamDestination()
  Tone.getDestination().connect(synCaptureDest)
}

/* ── Shared styles (matching SynthPanel) ────────────────────────── */
const miniBtn: React.CSSProperties = {
  padding: '3px 8px', border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'var(--border-subtle)', color: 'var(--text-40)',
  fontSize: 'var(--fs-sm)', fontWeight: 800, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const SCAN_MODES: { id: ScanMode; label: string }[] = [
  { id: 'ltr', label: 'L→R' }, { id: 'spiral', label: 'SPIRAL' },
  { id: 'diagonal', label: 'DIAG' }, { id: 'random', label: 'RND' },
  { id: 'brush', label: 'BRUSH' },
]
const SCALE_MODES: { id: ScaleMode; label: string }[] = [
  { id: 'auto', label: 'AUTO' }, { id: 'chromatic', label: 'CHROM' },
  { id: 'major', label: 'MAJ' }, { id: 'minor', label: 'MIN' },
  { id: 'pentatonic', label: 'PENTA' }, { id: 'blues', label: 'BLUES' },
]

export function SynesthizerPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const panelId = 'synesthizer'
  const geo = loadGeo(panelId, { x: 300, y: 100, w: 500, h: 0 })

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [chords, setChords] = useState<Chord[]>([])
  const [cols, setCols] = useState(8)
  const [rows, setRows] = useState(6)
  const [bpm, setBpm] = useState(120)
  const [maxNotes, setMaxNotes] = useState(4)
  const [playing, setPlaying] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [instMode, setInstMode] = useState<'synth' | 'piano'>('synth')
  const [autoBpm, setAutoBpm] = useState(true)
  const [scanMode, setScanMode] = useState<ScanMode>('ltr')
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto')
  const [loopRegions, setLoopRegions] = useState<Set<string>>(new Set())
  const [paintingLoop, setPaintingLoop] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const imageDataRef = useRef<ImageData | null>(null)
  const synthRef = useRef<Tone.PolySynth | null>(null)
  const samplerRef = useRef<Tone.Sampler | null>(null)
  const reverbRef = useRef<Tone.Freeverb | null>(null)
  const seqRef = useRef<Tone.Part | null>(null)
  const playingRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const camRafRef = useRef(0)
  const brushLastRef = useRef<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    captureRegistry.register({ id: panelId, label: 'Synesthizer', getStream: getSynCaptureStream })
    return () => captureRegistry.unregister(panelId)
  }, [])

  const getImageData = useCallback((img: HTMLImageElement | HTMLVideoElement): ImageData => {
    const w = img instanceof HTMLVideoElement ? img.videoWidth : img.width
    const h = img instanceof HTMLVideoElement ? img.videoHeight : img.height
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, w, h)
  }, [])

  const reprocess = useCallback((imgData: ImageData) => {
    imageDataRef.current = imgData
    const result = imageToChords(imgData, { cols, rows, maxNotes, minWeight: 0, scanMode, scaleMode })
    setChords(result)
    if (autoBpm) {
      const mean = imageMeanColor(imgData)
      setBpm(tempoFromColor(mean.r, mean.g, mean.b))
    }
    return result
  }, [cols, rows, maxNotes, scanMode, scaleMode, autoBpm])

  const loadImageBlob = useCallback((blob: Blob, persist = true) => {
    stopCamera()
    if (persist) cacheImage(blob)
    const url = URL.createObjectURL(blob)
    setImageUrl(url)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const imgData = getImageData(img)
      const result = reprocess(imgData)
      drawPreview(img, result, -1)
    }
    img.src = url
  }, [reprocess, getImageData])

  const processImage = useCallback((file: File) => {
    loadImageBlob(file, true)
  }, [loadImageBlob])

  // Restore cached image on mount
  useEffect(() => {
    loadCachedImage().then(blob => { if (blob && !imgRef.current) loadImageBlob(blob, false) })
  }, [])

  useEffect(() => {
    if (!imgRef.current) return
    const imgData = getImageData(imgRef.current)
    const result = reprocess(imgData)
    drawPreview(imgRef.current, result, -1)
  }, [cols, rows, maxNotes, scanMode, scaleMode])

  const drawPreview = useCallback((source: HTMLImageElement | HTMLVideoElement, ch: Chord[], activeIdx: number) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dw = c.width, dh = c.height
    ctx.clearRect(0, 0, dw, dh)
    ctx.drawImage(source, 0, 0, dw, dh)
    const pw = dw / cols, ph = dh / rows
    ch.forEach((chord, i) => {
      const isLoop = loopRegions.has(`${chord.col},${chord.row}`)
      const isActive = i === activeIdx
      ctx.fillStyle = isActive ? 'rgba(0,184,96,0.45)' : isLoop ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.06)'
      ctx.strokeStyle = isActive ? '#00b860' : isLoop ? '#a78bfa' : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = isActive ? 2 : isLoop ? 1.5 : 0.5
      const x = chord.col * pw, y = chord.row * ph
      ctx.fillRect(x, y, pw, ph)
      ctx.strokeRect(x, y, pw, ph)
      ctx.fillStyle = isActive ? '#fff' : 'rgba(255,255,255,0.6)'
      ctx.font = `${Math.max(7, Math.min(11, pw / 4.5))}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(chord.notes[0] || '', x + pw / 2, y + ph / 2 + 3)
    })
  }, [cols, rows, loopRegions])

  useEffect(() => {
    const src = cameraActive && videoRef.current ? videoRef.current : imgRef.current
    if (src && chords.length) drawPreview(src, chords, currentIdx)
  }, [currentIdx, chords, drawPreview, cameraActive])

  const ensureReverb = useCallback(() => {
    if (!reverbRef.current) {
      reverbRef.current = new Tone.Freeverb({ roomSize: 0.8, dampening: 3000, wet: 0 }).toDestination()
    }
    return reverbRef.current
  }, [])

  const getInstrument = useCallback(async () => {
    await Tone.start()
    ensureSynTap()
    const reverb = ensureReverb()
    if (instMode === 'piano') {
      if (!samplerRef.current) {
        samplerRef.current = new Tone.Sampler({
          urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3' },
          release: 1,
          baseUrl: 'https://tonejs.github.io/audio/salamander/',
        }).connect(reverb)
        await Tone.loaded()
      }
      return samplerRef.current
    }
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
      }).connect(reverb)
    }
    return synthRef.current
  }, [instMode, ensureReverb])

  const play = useCallback(async () => {
    if (!chords.length) return
    const inst = await getInstrument()
    const reverb = ensureReverb()
    Tone.getTransport().bpm.value = bpm
    seqRef.current?.dispose()

    const loopChords = chords.filter(c => loopRegions.has(`${c.col},${c.row}`))
    const fullSeq = [...chords, ...loopChords, ...loopChords]

    let timeAcc = 0
    const events = fullSeq.map((c, i) => {
      const dur = Tone.Time(c.duration).toSeconds()
      const ev = { time: timeAcc, chord: c, idx: i < chords.length ? i : -1, dur: c.duration, vel: c.velocity, sat: c.saturation }
      timeAcc += dur
      return ev
    })

    const part = new Tone.Part((time, ev) => {
      reverb.wet.setValueAtTime(saturationToReverb(ev.sat), time)
      inst.triggerAttackRelease(ev.chord.notes, ev.dur, time, ev.vel)
      noteBus.publish({ source: panelId, notes: ev.chord.notes, velocity: ev.vel, durationMs: Tone.Time(ev.dur).toMilliseconds() })
      if (ev.idx >= 0) Tone.getDraw().schedule(() => setCurrentIdx(ev.idx), time)
    }, events)
    part.start(0)
    seqRef.current = part
    Tone.getTransport().start('+0.05')
    playingRef.current = true
    setPlaying(true)
    setTimeout(() => { if (playingRef.current) stop() }, timeAcc * 1000 + 500)
  }, [chords, bpm, getInstrument, ensureReverb, loopRegions])

  const stop = useCallback(() => {
    Tone.getTransport().stop()
    seqRef.current?.dispose()
    seqRef.current = null
    playingRef.current = false
    setPlaying(false)
    setCurrentIdx(-1)
  }, [])

  const handleCanvasMove = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (scanMode !== 'brush' || !imageDataRef.current) return
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    const scaleX = imageDataRef.current.width / rect.width
    const scaleY = imageDataRef.current.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    const chord = pixelToNote(imageDataRef.current, px, py, scaleMode)
    if (!chord) return
    const key = chord.notes[0]
    if (key === brushLastRef.current) return
    brushLastRef.current = key
    const inst = await getInstrument()
    const reverb = ensureReverb()
    reverb.wet.value = saturationToReverb(chord.saturation)
    inst.triggerAttackRelease(chord.notes, chord.duration, undefined, chord.velocity)
    noteBus.publish({ source: panelId, notes: chord.notes, velocity: chord.velocity, durationMs: Tone.Time(chord.duration).toMilliseconds() })
  }, [scanMode, scaleMode, getInstrument, ensureReverb])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!paintingLoop) return
    e.preventDefault()
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left) / rect.width * cols)
    const row = Math.floor((e.clientY - rect.top) / rect.height * rows)
    const key = `${col},${row}`
    setLoopRegions(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [paintingLoop, cols, rows])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      camStreamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      videoRef.current = video
      setCameraActive(true)
      setImageUrl('__camera__')
      const tick = () => {
        if (!camStreamRef.current) return
        const imgData = getImageData(video)
        const result = reprocess(imgData)
        drawPreview(video, result, -1)
        camRafRef.current = requestAnimationFrame(tick)
      }
      camRafRef.current = requestAnimationFrame(tick)
    } catch { /* user denied camera */ }
  }, [getImageData, reprocess, drawPreview])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(camRafRef.current)
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    videoRef.current = null
    setCameraActive(false)
  }, [])

  useEffect(() => () => {
    stop(); stopCamera()
    synthRef.current?.dispose(); samplerRef.current?.dispose(); reverbRef.current?.dispose()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) processImage(file)
  }, [processImage])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImage(file)
    e.target.value = ''
  }, [processImage])

  const [rendering, setRendering] = useState(false)
  const [rendered, setRendered] = useState(false)

  const renderAndSend = useCallback(async () => {
    if (!chords.length) return
    setRendering(true)
    try {
      const loopChords = chords.filter(c => loopRegions.has(`${c.col},${c.row}`))
      const fullSeq = [...chords, ...loopChords, ...loopChords]

      let totalDur = 0
      for (const c of fullSeq) totalDur += Tone.Time(c.duration).toSeconds()
      totalDur += 0.5

      const buffer = await Tone.Offline(({ transport }) => {
        transport.bpm.value = bpm
        const reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 3000, wet: 0 }).toDestination()
        const synth = instMode === 'piano'
          ? new Tone.Sampler({
              urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3' },
              release: 1, baseUrl: 'https://tonejs.github.io/audio/salamander/',
            }).connect(reverb)
          : new Tone.PolySynth(Tone.Synth, {
              oscillator: { type: 'triangle' },
              envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
            }).connect(reverb)

        let timeAcc = 0
        const events = fullSeq.map(c => {
          const dur = Tone.Time(c.duration).toSeconds()
          const ev = { time: timeAcc, chord: c, dur: c.duration, vel: c.velocity, sat: c.saturation }
          timeAcc += dur
          return ev
        })
        const part = new Tone.Part((time, ev) => {
          reverb.wet.setValueAtTime(saturationToReverb(ev.sat), time)
          synth.triggerAttackRelease(ev.chord.notes, ev.dur, time, ev.vel)
        }, events)
        part.start(0)
        transport.start(0.05)
      }, totalDur)

      const raw = buffer.get() as AudioBuffer
      const blob = encodeWav(raw)
      const url = URL.createObjectURL(blob)
      window.dispatchEvent(new CustomEvent('synth:load', { detail: { url, label: 'synesthizer-loop' } }))
      setRendered(true)
      setTimeout(() => setRendered(false), 3000)
    } catch (e) { console.error('Synesthizer render error', e) }
    setRendering(false)
  }, [chords, bpm, instMode, loopRegions])

  const accent = '#00b860'
  const hasImage = !!imageUrl

  return (
    <CaptureIdContext.Provider value={panelId}>
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || 500, height: 'auto' }}
      minWidth={440} maxWidth={700}
      enableResizing={{ right: true, left: true }}
      bounds={undefined}
      dragHandleClassName="synth-drag"
      className={`panel-drag${isDragging(panelId) ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront(panelId)}
      onDragStop={(_e, d) => { saveGeo(panelId, { x: d.x, y: d.y }); endDrag(panelId) }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo(panelId, { w: ref.offsetWidth, x: pos.x, y: pos.y })}
      style={{ zIndex: zOf(panelId, 15) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)', padding: '14px 18px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <PanelHeader title="// Synesthizer" onClose={onClose} className="synth-drag">
          <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setInstMode(v => v === 'synth' ? 'piano' : 'synth')}
              style={{
                ...miniBtn, padding: '3px 10px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: instMode === 'piano' ? 'rgba(167,139,250,0.7)' : 'var(--bg-hover)',
                color: instMode === 'piano' ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}>
              {instMode === 'piano' ? '♪ PIANO' : '∿ SYNTH'}
            </button>
            <button
              onClick={() => setPaintingLoop(v => !v)}
              title="Click grid cells to mark loop regions"
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: paintingLoop ? 'rgba(167,139,250,0.7)' : 'var(--bg-hover)',
                color: paintingLoop ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}>
              ◎ LOOP
            </button>
            <button
              onClick={() => cameraActive ? stopCamera() : startCamera()}
              title="Live camera input"
              style={{
                ...miniBtn, padding: '3px 9px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: cameraActive ? 'rgba(239,68,68,0.8)' : 'var(--bg-hover)',
                color: cameraActive ? '#fff' : 'var(--text-40)',
                letterSpacing: '0.15em',
              }}>
              {cameraActive ? '⏹ CAM' : '📷 CAM'}
            </button>
            <button onClick={playing ? stop : play} disabled={!chords.length}
              title={playing ? 'Stop' : 'Play chords'}
              style={{
                ...miniBtn, padding: '3px 12px', width: 'auto', fontSize: 'var(--fs-base)',
                background: playing ? accent : 'var(--border-subtle)',
                color: playing ? '#000' : 'var(--text-40)',
                opacity: chords.length ? 1 : 0.35, fontWeight: 900,
              }}>
              {playing ? '⏹ STOP' : '▶ PLAY'}
            </button>
            <button onClick={renderAndSend} disabled={!chords.length || rendering}
              title="Render chords to WAV and send to Synth panel as sample"
              style={{
                ...miniBtn, padding: '3px 10px', width: 'auto', fontSize: 'var(--fs-sm)',
                background: rendered ? 'rgba(0,184,96,0.25)' : rendering ? 'rgba(255,165,0,0.25)' : 'rgba(6,182,212,0.15)',
                color: rendered ? 'rgba(0,184,96,0.9)' : rendering ? 'rgba(255,165,0,0.9)' : 'rgba(6,182,212,0.7)',
                fontWeight: 900, letterSpacing: '0.1em',
                opacity: chords.length ? 1 : 0.35,
                cursor: rendering ? 'wait' : 'pointer',
              }}>
              {rendering ? '⏳ RENDER' : rendered ? '✓ SENT' : '→ SYNTH'}
            </button>
          </div>
        </PanelHeader>

        {/* Image preview / drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{
            position: 'relative', borderRadius: 10, overflow: 'hidden',
            background: 'linear-gradient(180deg,#0a0b0d,#06070a)',
            boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)',
            minHeight: hasImage ? 0 : 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {!hasImage ? (
            <label style={{ cursor: 'pointer', color: 'var(--text-20)', textAlign: 'center', padding: 20, fontSize: 'var(--fs-md)', fontWeight: 700, letterSpacing: '0.1em', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--fs-4xl)', opacity: 0.3 }}>🎨</span>
              DROP IMAGE OR CLICK
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>
          ) : (
            <canvas
              ref={canvasRef} width={480} height={300}
              style={{ width: '100%', display: 'block', cursor: scanMode === 'brush' ? 'crosshair' : paintingLoop ? 'cell' : 'default' }}
              onMouseMove={handleCanvasMove}
              onClick={handleCanvasClick}
              onContextMenu={e => e.preventDefault()}
            />
          )}
        </div>

        {/* Status strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', borderRadius: 7,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'var(--text-40)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: playing ? accent : cameraActive ? '#ef4444' : hasImage ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.4)',
            boxShadow: playing ? `0 0 8px ${accent}` : cameraActive ? '0 0 8px #ef4444' : 'none',
            animation: cameraActive && !playing ? 'sb-pulse 0.8s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: 'var(--text-20)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {cameraActive ? 'live' : hasImage ? 'image' : 'idle'}
          </span>
          <span style={{ flex: 1, color: 'var(--text-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {!hasImage ? 'drop an image to start' : `${chords.length} chords · ${cols}×${rows} · ${bpm} BPM${autoBpm ? ' (auto)' : ''}`}
          </span>
          {loopRegions.size > 0 && (
            <span style={{ color: '#a78bfa', fontWeight: 900, fontSize: 'var(--fs-xs)' }}>
              {loopRegions.size} loops
            </span>
          )}
          {scanMode === 'brush' && (
            <span style={{ color: accent, fontWeight: 900, fontSize: 'var(--fs-xs)' }}>BRUSH</span>
          )}
        </div>

        {/* Knobs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '6px 8px 2px' }}>
          <SynthKnob label="COLS" value={cols} min={2} max={24} accent={accent}
            fmt={v => String(Math.round(v))} onChange={v => setCols(Math.round(v))} />
          <SynthKnob label="ROWS" value={rows} min={2} max={18} accent={accent}
            fmt={v => String(Math.round(v))} onChange={v => setRows(Math.round(v))} />
          <SynthKnob label="BPM" value={bpm} min={30} max={300} accent="#f59e0b"
            fmt={v => String(Math.round(v))} onChange={v => { setBpm(Math.round(v)); setAutoBpm(false) }} />
          <SynthKnob label="NOTES" value={maxNotes} min={1} max={12} accent="#a78bfa"
            fmt={v => String(Math.round(v))} onChange={v => setMaxNotes(Math.round(v))} />
        </div>

        {/* Scan mode selector */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 5,
          padding: '7px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: 'var(--text-20)', flexShrink: 0 }}>SCAN</span>
            <div style={{ display: 'flex', gap: 3, flex: 1 }}>
              {SCAN_MODES.map(m => (
                <button key={m.id} onClick={() => setScanMode(m.id)}
                  style={{
                    ...miniBtn, padding: '2px 7px', width: 'auto', fontSize: 'var(--fs-2xs)',
                    background: scanMode === m.id ? accent : 'rgba(255,255,255,0.04)',
                    color: scanMode === m.id ? '#000' : 'var(--text-30)',
                    fontWeight: 900,
                  }}>{m.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: 'var(--text-20)', flexShrink: 0 }}>SCALE</span>
            <div style={{ display: 'flex', gap: 3, flex: 1 }}>
              {SCALE_MODES.map(m => (
                <button key={m.id} onClick={() => setScaleMode(m.id)}
                  style={{
                    ...miniBtn, padding: '2px 7px', width: 'auto', fontSize: 'var(--fs-2xs)',
                    background: scaleMode === m.id ? '#a78bfa' : 'rgba(255,255,255,0.04)',
                    color: scaleMode === m.id ? '#000' : 'var(--text-30)',
                    fontWeight: 900,
                  }}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Info footer */}
        {hasImage && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-20)',
          }}>
            <span>velocity: lightness</span>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
            <span>reverb: saturation</span>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
            <span>duration: chroma</span>
          </div>
        )}
      </div>
    </Rnd>
    <style>{`@keyframes sb-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </CaptureIdContext.Provider>
  )
}
