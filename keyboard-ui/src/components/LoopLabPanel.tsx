import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { encodeWav } from '../lib/audio-utils'

const PANEL_ID = 'looplab'
const DEF_GEO = { x: 460, y: 60, w: 520, h: 0 }

// ── Detect rising zero-crossing near end for clean loop ──────────────
function findLoopEnd(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0)
  const len = data.length
  for (let i = Math.floor(len * 0.95); i > Math.floor(len * 0.7); i--) {
    if (data[i] <= 0 && data[i + 1] > 0) return i / buffer.sampleRate
  }
  return buffer.duration
}

// ── Build N-repetition looped AudioBuffer with crossfade ─────────────
function buildLoopedBuffer(
  src: AudioBuffer,
  loopStart: number,
  loopEnd: number,
  repeats: number,
  xfadeSec: number,
): AudioBuffer {
  const sr = src.sampleRate
  const numCh = src.numberOfChannels
  const startSmp = Math.floor(loopStart * sr)
  const endSmp = Math.min(Math.floor(loopEnd * sr), src.length)
  const loopLen = endSmp - startSmp
  const xfadeLen = Math.min(Math.floor(xfadeSec * sr), Math.floor(loopLen / 4))
  const totalLen = loopLen * repeats

  const out = new AudioBuffer({ numberOfChannels: numCh, length: totalLen, sampleRate: sr })

  for (let ch = 0; ch < numCh; ch++) {
    const srcData = src.getChannelData(ch)
    const dstData = out.getChannelData(ch)
    for (let rep = 0; rep < repeats; rep++) {
      const base = rep * loopLen
      for (let i = 0; i < loopLen; i++) {
        let s = srcData[startSmp + i] ?? 0
        // Fade-in at every loop start (except very first sample of whole output)
        if (i < xfadeLen && xfadeLen > 0 && rep > 0) s *= i / xfadeLen
        // Fade-out at every loop end (except very last sample of whole output)
        if (i >= loopLen - xfadeLen && xfadeLen > 0 && rep < repeats - 1) s *= (loopLen - i) / xfadeLen
        dstData[base + i] = s
      }
    }
  }
  return out
}

// ── Download helper ──────────────────────────────────────────────────
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

// ────────────────────────────────────────────────────────────────────
export function LoopLabPanel({ onClose }: { onClose: () => void }) {
  const { scale, zOf, bringToFront, endDrag, isDragging } = usePanelCtx()
  const geo = loadGeo(PANEL_ID, DEF_GEO)

  // ── State ──────────────────────────────────────────────────────────
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [fileName, setFileName] = useState('')
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(0)
  const [xfadeSec, setXfadeSec] = useState(0.02)
  const [repeatCount, setRepeatCount] = useState(4)
  const [pitch, setPitch] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDrop, setIsDrop] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<false | 'wav' | 'render'>(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
const [_playProgress, setPlayProgress] = useState(0)
  const [loopIdx, setLoopIdx] = useState(0)

  // ── Refs ───────────────────────────────────────────────────────────
  const playerRef = useRef<Tone.Player | null>(null)
  const pitchRef = useRef<Tone.PitchShift | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number>(0)
  const playStartRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null) // offscreen cache

  // ── Draw static waveform to offscreen canvas ───────────────────────
  useEffect(() => {
    if (!audioBuffer) { staticCanvasRef.current = null; return }
    const w = 480, h = 64
    const off = document.createElement('canvas')
    off.width = w; off.height = h
    const ctx = off.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    const data = audioBuffer.getChannelData(0)
    const step = Math.ceil(data.length / w)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x < w; x++) {
      let mn = 1, mx = -1
      for (let j = 0; j < step; j++) { const s = data[x * step + j] ?? 0; if (s < mn) mn = s; if (s > mx) mx = s }
      ctx.moveTo(x, ((1 - mx) / 2) * h)
      ctx.lineTo(x, ((1 - mn) / 2) * h)
    }
    ctx.stroke()
    staticCanvasRef.current = off
  }, [audioBuffer])

  // ── Composite frame: static + loop region + playhead ──────────────
  const drawFrame = useCallback((progress: number, loopI: number) => {
    if (!audioBuffer || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // Loop region bg
    const lsPx = (loopStart / audioBuffer.duration) * w
    const lePx = (loopEnd / audioBuffer.duration) * w
    ctx.fillStyle = 'rgba(0,184,96,0.07)'
    ctx.fillRect(lsPx, 0, lePx - lsPx, h)

    // Static waveform
    if (staticCanvasRef.current) ctx.drawImage(staticCanvasRef.current, 0, 0)

    // Loop region waveform (green tint overlay)
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = 'rgba(0,184,96,0.15)'
    ctx.fillRect(lsPx, 0, lePx - lsPx, h)
    ctx.restore()

    // Markers
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(0,184,96,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(lsPx, 0); ctx.lineTo(lsPx, h)
    ctx.moveTo(lePx, 0); ctx.lineTo(lePx, h)
    ctx.stroke()
    ctx.setLineDash([])

    // Playhead
    if (progress > 0) {
      const phPx = lsPx + (lePx - lsPx) * progress
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(phPx, 0); ctx.lineTo(phPx, h)
      ctx.stroke()

      // Loop counter badge
      ctx.fillStyle = 'rgba(0,184,96,0.9)'
      ctx.font = 'bold 9px monospace'
      ctx.fillText(`${loopI + 1}/${repeatCount === 99 ? '∞' : repeatCount}`, lePx + 4, 14)
    }
  }, [audioBuffer, loopStart, loopEnd, repeatCount])

  // Initial draw (no playhead)
  useEffect(() => { drawFrame(0, 0) }, [drawFrame])

  // ── RAF loop for playhead animation ───────────────────────────────
  useEffect(() => {
    if (!isPlaying || !audioBuffer) return
    const loopDurSec = (loopEnd - loopStart) / speed
    function tick() {
      const elapsed = (performance.now() - playStartRef.current) / 1000
      const loopI = Math.min(Math.floor(elapsed / loopDurSec), repeatCount - 1)
      const t = (elapsed % loopDurSec) / loopDurSec
      setPlayProgress(t)
      setLoopIdx(loopI)
      drawFrame(t, loopI)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, audioBuffer, loopStart, loopEnd, speed, drawFrame, repeatCount])

  // ── Stop playback ──────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
    if (playerRef.current) { try { playerRef.current.stop(); playerRef.current.dispose() } catch{ /* noop */ } ; playerRef.current = null }
    if (pitchRef.current) { try { pitchRef.current.dispose() } catch{ /* noop */ } ; pitchRef.current = null }
    setIsPlaying(false)
    setPlayProgress(0)
    setLoopIdx(0)
  }, [])

  useEffect(() => () => stop(), [stop])

  // ── Start playback ─────────────────────────────────────────────────
  async function play() {
    if (!audioBuffer) return
    stop()
    await Tone.start()

    const pitchCompensation = pitch - 12 * Math.log2(speed)
    const ps = new Tone.PitchShift({ pitch: pitchCompensation, windowSize: 0.1 })
    ps.toDestination()
    pitchRef.current = ps

    const player = new Tone.Player(new Tone.ToneAudioBuffer(audioBuffer))
    player.loop = true
    player.loopStart = loopStart
    player.loopEnd = loopEnd
    player.playbackRate = speed
    player.connect(ps)
    playerRef.current = player

    player.start(Tone.now(), loopStart)
    playStartRef.current = performance.now()
    setIsPlaying(true)

    if (repeatCount < 99) {
      const loopDurMs = ((loopEnd - loopStart) / speed) * 1000
      stopTimerRef.current = setTimeout(stop, loopDurMs * repeatCount + 300)
    }
  }

  // ── Load audio file ────────────────────────────────────────────────
  async function loadFile(file: File) {
    stop()
    setLoading(true)
    try {
      const arr = await file.arrayBuffer()
      const ctx = new AudioContext()
      const buf = await ctx.decodeAudioData(arr)
      await ctx.close()
      setAudioBuffer(buf)
      setFileName(file.name)
      setLoopStart(0)
      setLoopEnd(findLoopEnd(buf))
    } catch (e) {
      console.error('LoopLab: failed to load', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Export: WAV (raw loop, lossless) ──────────────────────────────
  async function exportWav() {
    if (!audioBuffer) return
    setExporting('wav')
    try {
      const looped = buildLoopedBuffer(audioBuffer, loopStart, loopEnd, repeatCount, xfadeSec)
      const blob = encodeWav(looped)
      const base = fileName.replace(/\.[^.]+$/, '')
      download(blob, `${base}_loop${repeatCount}x.wav`)
    } finally {
      setExporting(false)
    }
  }

  // ── Export: Rendered (pitch + speed applied via Tone.Offline) ─────
  async function exportRendered() {
    if (!audioBuffer) return
    setExporting('render')
    try {
      const looped = buildLoopedBuffer(audioBuffer, loopStart, loopEnd, repeatCount, xfadeSec)
      const renderDur = looped.duration / speed + 0.6 // 0.6s PitchShift warmup
      const numCh = looped.numberOfChannels
      const sr = looped.sampleRate

      const pitchComp = pitch - 12 * Math.log2(speed)
      const rendered = await Tone.Offline(async () => {
        const ps = new Tone.PitchShift({ pitch: pitchComp, windowSize: 0.1 })
        ps.toDestination()
        const p = new Tone.Player(new Tone.ToneAudioBuffer(looped))
        p.playbackRate = speed
        p.connect(ps)
        p.start(0.1) // small offset so PitchShift warms up
      }, renderDur, numCh, sr)

      const rawBuf = rendered.get()
      if (!rawBuf) return

      // Trim the 0.1s warmup offset
      const trimSamples = Math.floor(0.1 * sr)
      const trimLen = rawBuf.length - trimSamples
      const trimmed = new AudioBuffer({ numberOfChannels: numCh, length: Math.max(trimLen, 1), sampleRate: sr })
      for (let ch = 0; ch < numCh; ch++) {
        const srcData = rawBuf.getChannelData(ch)
        const dstData = trimmed.getChannelData(ch)
        for (let i = 0; i < trimLen; i++) dstData[i] = srcData[trimSamples + i]
      }

      const blob = encodeWav(trimmed)
      const base = fileName.replace(/\.[^.]+$/, '')
      const pitchStr = pitch === 0 ? '' : `_p${pitch > 0 ? '+' : ''}${pitch.toFixed(0)}st`
      const speedStr = speed === 1 ? '' : `_${speed.toFixed(2)}x`
      download(blob, `${base}_loop${repeatCount}x${speedStr}${pitchStr}.wav`)
    } catch (e) {
      console.error('LoopLab: render failed', e)
    } finally {
      setExporting(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────
  const loopDur = loopEnd - loopStart
  const totalDur = (loopDur / speed) * (repeatCount === 99 ? 1 : repeatCount)
  const baseName = fileName.replace(/\.[^.]+$/, '')

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: 'auto' }}
      minWidth={440}
      maxWidth={700}
      enableResizing={{ left: true, right: true }}
      bounds={undefined}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging(PANEL_ID) ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront(PANEL_ID)}
      onDragStop={(_e, d) => { saveGeo(PANEL_ID, { x: d.x, y: d.y }); endDrag(PANEL_ID) }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo(PANEL_ID, { x: pos.x, y: pos.y, w: ref.offsetWidth })}
      style={{ zIndex: zOf(PANEL_ID, 10) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)',
        background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <PanelHeader title="Loop Lab" onClose={onClose} className="drag-handle">
          {audioBuffer && (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-40)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {loopDur.toFixed(2)}s × {repeatCount === 99 ? '∞' : repeatCount} = {totalDur.toFixed(1)}s
            </span>
          )}
        </PanelHeader>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Drop zone ── */}
          {!audioBuffer ? (
            <div
              onDragOver={e => { e.preventDefault(); setIsDrop(true) }}
              onDragLeave={() => setIsDrop(false)}
              onDrop={e => {
                e.preventDefault(); setIsDrop(false)
                const f = e.dataTransfer.files[0]; if (f) loadFile(f)
              }}
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'audio/*'
                inp.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadFile(f) }
                inp.click()
              }}
              style={{
                border: `2px dashed ${isDrop ? '#00b860' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 'var(--radius-sm)', padding: '36px 20px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
                background: isDrop ? 'rgba(0,184,96,0.05)' : 'transparent',
              }}
            >
              {loading
                ? <span style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-40)' }}>Decoding audio…</span>
                : <>
                  <div style={{ fontSize: 'var(--fs-7xl)', marginBottom: 8 }}>🎵</div>
                  <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-40)', fontWeight: 600 }}>Drop audio file or click to browse</div>
                  <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-20)', marginTop: 4 }}>MP3 · WAV · OGG · FLAC · M4A</div>
                </>
              }
            </div>
          ) : (
            <>
              {/* File row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-40)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                  🎵 {baseName}
                </span>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
                  {audioBuffer.duration.toFixed(2)}s · {(audioBuffer.sampleRate / 1000).toFixed(0)}kHz · {audioBuffer.numberOfChannels}ch
                </span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { stop(); setAudioBuffer(null); setFileName('') }}
                  style={{ fontSize: 'var(--fs-sm)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-40)', cursor: 'pointer', flexShrink: 0 }}
                >Replace</button>
              </div>

              {/* Waveform canvas */}
              <div style={{ position: 'relative' }}>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={64}
                  style={{ width: '100%', height: 64, borderRadius: 6, background: 'rgba(0,0,0,0.45)', display: 'block', cursor: 'default' }}
                />
                {isPlaying && (
                  <div style={{ position: 'absolute', top: 5, left: 8, fontSize: 'var(--fs-sm)', color: '#00b860', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                    ◉ PLAYING
                  </div>
                )}
              </div>

              {/* Loop point sliders */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <CtrlSlider
                  label="Loop Start" value={loopStart} min={0} max={audioBuffer.duration} step={0.001}
                  format={v => v.toFixed(3) + 's'} accent="#60a5fa"
                  onChange={v => setLoopStart(Math.min(v, loopEnd - 0.05))}
                />
                <CtrlSlider
                  label="Loop End" value={loopEnd} min={0} max={audioBuffer.duration} step={0.001}
                  format={v => v.toFixed(3) + 's'} accent="#60a5fa"
                  onChange={v => setLoopEnd(Math.max(v, loopStart + 0.05))}
                />
              </div>

              {/* Auto-detect */}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => { setLoopStart(0); setLoopEnd(findLoopEnd(audioBuffer)) }}
                style={{
                  padding: '6px 0', borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0,184,96,0.25)', background: 'rgba(0,184,96,0.05)',
                  color: '#00b860', fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.12em',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >⊙ Auto-Detect Loop Points</button>

              {/* Controls grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <CtrlSlider label="Pitch" value={pitch} min={-12} max={12} step={0.1}
                  format={v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' st'} accent="#3b82f6"
                  onChange={setPitch} />
                <CtrlSlider label="Speed" value={speed} min={0.25} max={4} step={0.01}
                  format={v => v.toFixed(2) + 'x'} accent="#f59e0b"
                  onChange={setSpeed} />
                <CtrlSlider label="Crossfade" value={xfadeSec} min={0} max={0.5} step={0.005}
                  format={v => (v * 1000).toFixed(0) + ' ms'} accent="#8b5cf6"
                  onChange={setXfadeSec} />
                <CtrlSlider label="Repeats" value={repeatCount} min={1} max={99} step={1}
                  format={v => v === 99 ? '∞' : `×${v}`} accent="#ec4899"
                  onChange={v => setRepeatCount(Math.round(v))} />
              </div>

              {/* Play / Stop */}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={isPlaying ? stop : play}
                style={{
                  padding: '11px 0', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                  background: isPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(0,184,96,0.12)',
                  color: isPlaying ? '#ef4444' : '#00b860',
                  fontWeight: 800, fontSize: 'var(--fs-lg)', letterSpacing: '0.2em', textTransform: 'uppercase',
                  transition: 'background 0.15s',
                }}
              >{isPlaying ? `■  Stop  (${loopIdx + 1}/${repeatCount === 99 ? '∞' : repeatCount})` : '▶  Play'}</button>

              {/* Export */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 10 }}>Export</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ExportBtn
                    label="WAV  Raw"
                    sub="original pitch · lossless"
                    color="#60a5fa"
                    loading={exporting === 'wav'}
                    disabled={!!exporting}
                    onClick={exportWav}
                  />
                  <ExportBtn
                    label="WAV  Render"
                    sub="pitch + speed applied"
                    color="#a78bfa"
                    loading={exporting === 'render'}
                    disabled={!!exporting}
                    onClick={exportRendered}
                  />
                </div>
                {exporting === 'render' && (
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-40)', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
                    Rendering offline… this may take a moment
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Rnd>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function CtrlSlider({ label, value, min, max, step, format, onChange, accent = '#00b860' }: {
  label: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void; accent?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-40)' }}>{label}</span>
        <span style={{ fontSize: 'var(--fs-base)', fontFamily: 'monospace', color: 'var(--text-70)', fontWeight: 700 }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        onMouseDown={e => e.stopPropagation()}
        style={{ width: '100%', accentColor: accent, cursor: 'pointer', height: 4 }}
      />
    </div>
  )
}

function ExportBtn({ label, sub, color, onClick, disabled, loading }: {
  label: string; sub: string; color: string; onClick: () => void; disabled: boolean; loading: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={e => e.stopPropagation()}
      style={{
        flex: 1, padding: '9px 10px', borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}35`, background: loading ? `${color}1a` : `${color}0d`,
        color, fontWeight: 800, fontSize: 'var(--fs-base)', letterSpacing: '0.15em',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && !loading ? 0.4 : 1,
        textTransform: 'uppercase', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        transition: 'all 0.15s',
      }}
    >
      <span>{loading ? '…' : label}</span>
      <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.6, fontWeight: 400, letterSpacing: '0.05em', textTransform: 'none' }}>{sub}</span>
    </button>
  )
}
