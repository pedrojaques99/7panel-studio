import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import { API } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { ParamSlider } from '../lib/ParamSlider'

// Module-level capture context — persists across re-renders, one instance per app
let _psAudioCtx: AudioContext | null = null
let _psCaptureDest: MediaStreamAudioDestinationNode | null = null
let _psCurrentSource: MediaElementAudioSourceNode | null = null

function ensurePsCapture() {
  if (_psCaptureDest) return
  _psAudioCtx = new AudioContext()
  _psCaptureDest = _psAudioCtx.createMediaStreamDestination()
}

function getPsStream(): MediaStream | null {
  return _psCaptureDest?.stream ?? null
}

type JobStatus = 'idle' | 'uploading' | 'stretching' | 'done' | 'err'

type Job = {
  id: string
  srcLabel: string
  factor: number
  windowSec: number
  status: JobStatus
  errMsg: string
  resultUrl: string | null
  resultPath: string | null
}

function makeJob(srcLabel: string, factor: number, windowSec: number): Job {
  return { id: crypto.randomUUID(), srcLabel, factor, windowSec, status: 'idle', errMsg: '', resultUrl: null, resultPath: null }
}

/* resolve server path from various URL forms */
function extractPath(url: string): string | null {
  const m = url.match(/[?&]path=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}


export function PaulstretchPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('paulstretch', { x: 540, y: 200, w: 360, h: 0 })

  const [factor, setFactor] = useState(12)
  const [windowSec, setWindowSec] = useState(0.25)
  const [urlInput, setUrlInput] = useState('')
  const [trimStart, setTrimStart] = useState('')
  const [trimEnd, setTrimEnd] = useState('')
  const [inputDuration, setInputDuration] = useState<number | null>(null)
  const [durationLoading, setDurationLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const ytUrlRef = useRef<HTMLInputElement>(null)
  const [ytUrl, setYtUrl] = useState('')
  const [ytStart, setYtStart] = useState('')
  const [ytEnd, setYtEnd] = useState('')
  const [ytState, setYtState] = useState<'idle' | 'loading'>('idle')
  const [showYt, setShowYt] = useState(false)

  function updateJob(id: string, patch: Partial<Job>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  // parse "m:ss" or "ss" → seconds
  function parseSecs(s: string): number {
    if (!s.trim()) return 0
    const parts = s.trim().split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0]
  }

  // fetch duration when urlInput changes (debounced)
  useEffect(() => {
    const serverPath = extractPath(urlInput.trim()) ?? urlInput.trim()
    if (!serverPath) { setInputDuration(null); return }
    const timer = setTimeout(async () => {
      setDurationLoading(true)
      try {
        const r = await fetch(`${API}/api/duration?path=${encodeURIComponent(serverPath)}`)
        const d = await r.json()
        setInputDuration(d.duration ?? null)
      } catch { setInputDuration(null) }
      setDurationLoading(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [urlInput])

  // effective input seconds after trim
  const effectiveSecs = (() => {
    if (!inputDuration) return null
    const start = parseSecs(trimStart)
    const end = parseSecs(trimEnd)
    const realEnd = end > 0 ? Math.min(end, inputDuration) : inputDuration
    return Math.max(0, realEnd - start)
  })()

  // estimated output
  const estOutSecs = effectiveSecs != null ? effectiveSecs * factor : null
  // WAV 44100Hz stereo int16 = 44100 * 2ch * 2bytes = 176400 B/s
  const estOutMB = estOutSecs != null ? (estOutSecs * 176400) / (1024 * 1024) : null

  async function runStretch(serverPath: string, srcLabel: string) {
    const job = makeJob(srcLabel, factor, windowSec)
    setJobs(prev => [job, ...prev])
    updateJob(job.id, { status: 'stretching' })
    try {
      const params = new URLSearchParams({
        path: serverPath,
        factor: String(factor),
        window: String(windowSec),
      })
      if (trimStart.trim()) params.set('trim_start', trimStart.trim())
      if (trimEnd.trim()) params.set('trim_end', trimEnd.trim())
      const res = await fetch(`${API}/api/stretch?${params}`)
      const data = await res.json()
      if (data.error) { updateJob(job.id, { status: 'err', errMsg: data.error }); return }
      updateJob(job.id, {
        status: 'done',
        resultPath: data.path,
        resultUrl: `${API}/api/preview?path=${encodeURIComponent(data.path)}`,
      })
    } catch (e) {
      updateJob(job.id, { status: 'err', errMsg: String(e) })
    }
  }

  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'success') {
        setUrlInput(data.path)
        setInputDuration(null) // will re-fetch via useEffect
      }
    } catch (e) { console.error('upload failed', e) }
    setUploading(false)
  }

  async function handleUrlStretch() {
    const raw = urlInput.trim(); if (!raw) return
    const serverPath = extractPath(raw) ?? raw
    const label = raw.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'sample'
    await runStretch(serverPath, label)
  }

  async function handleYtDownload() {
    const url = ytUrl.trim(); if (!url) return
    setYtState('loading')
    try {
      const params = new URLSearchParams({ url })
      if (ytStart.trim()) params.set('start', ytStart.trim())
      if (ytEnd.trim()) params.set('end', ytEnd.trim())
      const res = await fetch(`${API}/api/yt-download?${params}`)
      const data = await res.json()
      if (data.error) { alert(data.error); setYtState('idle'); return }
      setYtState('idle')
      setShowYt(false)
      setUrlInput(data.path)
      setInputDuration(null)
    } catch (e) {
      alert(String(e)); setYtState('idle')
    }
  }

  function sendToDrone(job: Job) {
    if (!job.resultUrl) return
    window.dispatchEvent(new CustomEvent('ps:load', {
      detail: { url: job.resultUrl, label: `${job.srcLabel}_${job.factor}x` }
    }))
  }

  function sendToSynth(job: Job) {
    if (!job.resultUrl) return
    window.dispatchEvent(new CustomEvent('synth:load', {
      detail: { url: job.resultUrl, label: `${job.srcLabel}_${job.factor}x` }
    }))
  }

  function copyPath(job: Job) {
    if (job.resultPath) navigator.clipboard.writeText(job.resultPath)
  }

  const busyCount = jobs.filter(j => j.status === 'uploading' || j.status === 'stretching').length

  function fmtTime(s: number) {
    if (!isFinite(s) || s < 0) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [playPos, setPlayPos] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 })

  // Register in capture bus on mount
  useEffect(() => {
    ensurePsCapture()
    captureRegistry.register({ id: 'paulstretch', label: 'Paulstretch', getStream: getPsStream })
    return () => captureRegistry.unregister('paulstretch')
  }, [])

  const togglePlay = useCallback((job: Job) => {
    if (!job.resultUrl) return
    if (playingId === job.id) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingId(null)
      setPlayPos({ current: 0, duration: 0 })
      return
    }
    audioRef.current?.pause()

    ensurePsCapture()
    const a = new Audio(job.resultUrl)
    a.crossOrigin = 'anonymous'

    // Route through capture AudioContext so ExporterPanel can record it
    if (_psAudioCtx && _psCaptureDest) {
      try {
        _psCurrentSource?.disconnect()
        const src = _psAudioCtx.createMediaElementSource(a)
        src.connect(_psCaptureDest)
        src.connect(_psAudioCtx.destination) // keep audible
        _psCurrentSource = src
        if (_psAudioCtx.state === 'suspended') _psAudioCtx.resume()
      } catch {
        // fallback: element already has a source node (can only be created once per element)
      }
    }

    a.onloadedmetadata = () => setPlayPos(p => ({ ...p, duration: a.duration }))
    a.ontimeupdate = () => setPlayPos({ current: a.currentTime, duration: a.duration })
    a.onended = () => { setPlayingId(null); setPlayPos({ current: 0, duration: 0 }) }
    a.play()
    audioRef.current = a
    setPlayingId(job.id)
  }, [playingId])

  return (
    <CaptureIdContext.Provider value="paulstretch">
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || 360, height: 'auto' }}
      minWidth={300} maxWidth={560}
      enableResizing={{ right: true, left: true }}
      bounds={undefined}
      dragHandleClassName="ps-drag"
      className={`panel-drag${isDragging('paulstretch') ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront('paulstretch')}
      onDragStop={(_e, d) => { saveGeo('paulstretch', { x: d.x, y: d.y }); endDrag('paulstretch') }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo('paulstretch', { w: ref.offsetWidth, x: pos.x, y: pos.y })}
      style={{ zIndex: zOf('paulstretch', 14) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)', padding: '16px 20px 18px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <PanelHeader title="// Paulstretch" onClose={onClose} className="ps-drag">
          {busyCount > 0 && (
            <span style={{ fontSize: 'var(--fs-sm)', color: '#a78bfa', fontFamily: 'monospace' }}>
              ⏳ {busyCount} job{busyCount > 1 ? 's' : ''}…
            </span>
          )}
        </PanelHeader>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ParamSlider label="Stretch Factor" value={factor} min={2} max={200} step={1}
            fmt={v => `${v}×`} onChange={setFactor} accent='#8b5cf6' defaultValue={12} />
          <ParamSlider label="Window Size" value={windowSec} min={0.05} max={1.0} step={0.05}
            fmt={v => `${v.toFixed(2)}s`} accent='#a78bfa' onChange={setWindowSec} defaultValue={0.25} />
          <div style={{ display: 'flex', gap: 6, padding: '4px 8px', borderRadius: 6,
            background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)', fontStyle: 'italic' }}>
              larger window = dreamier | smaller = grainier
            </span>
            <span style={{ fontSize: 'var(--fs-xs)', color: '#a78bfa', fontFamily: 'monospace', flexShrink: 0 }}>
              ~{factor}min/min
            </span>
          </div>

          {/* Trim controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-20)' }}>Trim Input</span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input value={trimStart} onChange={e => setTrimStart(e.target.value)}
                placeholder="start  0:30"
                style={{ ...inp, flex: 1, fontSize: 'var(--fs-base)' }} />
              <span style={{ color: 'var(--text-20)', fontSize: 'var(--fs-base)', flexShrink: 0 }}>→</span>
              <input value={trimEnd} onChange={e => setTrimEnd(e.target.value)}
                placeholder="end  1:00"
                style={{ ...inp, flex: 1, fontSize: 'var(--fs-base)' }} />
              {(trimStart || trimEnd) && (
                <button onClick={() => { setTrimStart(''); setTrimEnd('') }}
                  style={{ ...actionBtn, width: 24, fontSize: 'var(--fs-md)', color: 'rgba(255,80,80,0.6)' }}>×</button>
              )}
            </div>
          </div>

          {/* Estimativa */}
          <div style={{
            padding: '7px 10px', borderRadius: 7,
            background: estOutMB != null && estOutMB > 500
              ? 'rgba(239,68,68,0.07)' : 'rgba(139,92,246,0.06)',
            border: `1px solid ${estOutMB != null && estOutMB > 500 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.12)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            {durationLoading ? (
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace' }}>detecting duration…</span>
            ) : inputDuration != null ? (
              <>
                <div style={{ display: 'flex', flex: 1, gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
                    in <span style={{ color: '#a78bfa' }}>{fmtTime(effectiveSecs ?? inputDuration)}</span>
                    {effectiveSecs != null && effectiveSecs !== inputDuration && (
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}> / {fmtTime(inputDuration)} total</span>
                    )}
                  </span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
                    out <span style={{ color: estOutMB != null && estOutMB > 500 ? '#ef4444' : '#a78bfa', fontWeight: 700 }}>
                      {fmtTime(estOutSecs ?? 0)}
                    </span>
                  </span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
                    <span style={{ color: estOutMB != null && estOutMB > 500 ? '#ef4444' : '#a78bfa', fontWeight: 700 }}>
                      {estOutMB != null ? estOutMB >= 1024 ? `${(estOutMB / 1024).toFixed(1)} GB` : `${Math.round(estOutMB)} MB` : '—'}
                    </span>
                  </span>
                </div>
                {estOutMB != null && estOutMB > 500 && (
                  <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444', fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0 }}>⚠ trim it</span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 'var(--fs-sm)', color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace' }}>
                enter a path to see estimate
              </span>
            )}
          </div>
        </div>

        {/* Source row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlStretch()}
              placeholder="server path or /api/preview?path=…"
              style={inp} />
            <button onClick={handleUrlStretch} disabled={!urlInput.trim()}
              style={actionBtn}>∿</button>
            <button onClick={() => !uploading && fileRef.current?.click()} style={{ ...actionBtn, opacity: uploading ? 0.5 : 1 }} title="Pick file">{uploading ? '⏳' : '📁'}</button>
            <button onClick={() => setShowYt(v => !v)}
              style={{ ...actionBtn, color: showYt ? '#ef4444' : 'rgba(255,80,80,0.6)' }}
              title="YouTube">YT</button>
            <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.aif,.aiff"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          </div>

          {/* YT sub-form */}
          {showYt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,0,0,0.04)', border: '1px solid rgba(255,80,80,0.14)' }}>
              <input ref={ytUrlRef} value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=…" style={{ ...inp, fontSize: 'var(--fs-base)' }} />
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input value={ytStart} onChange={e => setYtStart(e.target.value)}
                  placeholder="start  1:30" style={{ ...inp, flex: 1, fontSize: 'var(--fs-sm)' }} />
                <span style={{ color: 'var(--text-20)', fontSize: 'var(--fs-sm)' }}>→</span>
                <input value={ytEnd} onChange={e => setYtEnd(e.target.value)}
                  placeholder="end  3:00" style={{ ...inp, flex: 1, fontSize: 'var(--fs-sm)' }} />
                <button onClick={handleYtDownload} disabled={!ytUrl.trim() || ytState === 'loading'}
                  style={{ ...actionBtn, background: ytState === 'loading' ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.7)',
                    color: ytState === 'loading' ? 'var(--text-20)' : '#fff' }}>
                  {ytState === 'loading' ? '⏳' : '↓ + ∿'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Job list */}
        {jobs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-20)' }}>
                Output
              </span>
              <button onClick={() => setJobs(j => j.filter(x => x.status !== 'done' && x.status !== 'err'))}
                style={{ fontSize: 'var(--fs-xs)', background: 'none', border: 'none', color: 'var(--text-20)', cursor: 'pointer' }}>
                clear done
              </button>
            </div>
            {jobs.map(job => (
              <div key={job.id} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: `7px 10px ${playingId === job.id && playPos.duration > 0 ? '22px' : '7px'}`,
                borderRadius: 8, position: 'relative',
                background: job.status === 'done' ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${job.status === 'done' ? 'rgba(139,92,246,0.25)' : job.status === 'err' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                transition: 'padding 0.15s',
              }}>
                {/* Status dot */}
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: job.status === 'done' ? '#8b5cf6'
                    : job.status === 'err' ? '#ef4444'
                    : '#f59e0b',
                  animation: (job.status === 'uploading' || job.status === 'stretching') ? 'ps-pulse 1.2s ease-in-out infinite' : 'none',
                }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-70)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.srcLabel}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
                    {job.status === 'uploading' && 'uploading…'}
                    {job.status === 'stretching' && `stretching ${job.factor}× / win ${job.windowSec}s…`}
                    {job.status === 'done' && `${job.factor}× · ${job.windowSec}s`}
                    {job.status === 'err' && <span style={{ color: '#ef4444' }} title={job.errMsg}>{job.errMsg.slice(0, 50)}</span>}
                  </div>
                </div>

                {/* Playback progress (playing only) */}
                {job.status === 'done' && playingId === job.id && playPos.duration > 0 && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-20)' }}>{fmtTime(playPos.current)}</span>
                      <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-20)' }}>{fmtTime(playPos.duration)}</span>
                    </div>
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', cursor: 'pointer' }}
                      onClick={e => {
                        if (!audioRef.current) return
                        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                        audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * playPos.duration
                      }}>
                      <div style={{ height: '100%', width: `${(playPos.current / playPos.duration) * 100}%`, background: '#8b5cf6', borderRadius: 99, transition: 'width 0.25s linear' }} />
                    </div>
                  </div>
                )}

                {/* Actions (done only) */}
                {job.status === 'done' && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => togglePlay(job)}
                      title={playingId === job.id ? 'Parar' : 'Tocar'}
                      style={{ ...miniBtn, width: 28, padding: 0,
                        background: playingId === job.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.07)',
                        color: playingId === job.id ? '#fff' : 'var(--text-40)', fontSize: 'var(--fs-md)' }}>
                      {playingId === job.id ? '⏸' : '▶'}
                    </button>
                    <button onClick={() => sendToDrone(job)}
                      title="Load into focused Drone layer"
                      style={{ ...miniBtn, background: 'rgba(139,92,246,0.7)', color: '#fff' }}>
                      → Drone
                    </button>
                    <button onClick={() => sendToSynth(job)}
                      title="Load into Synth (panel must be open)"
                      style={{ ...miniBtn, background: 'rgba(0,184,96,0.7)', color: '#000' }}>
                      → Synth
                    </button>
                    <button onClick={() => copyPath(job)} title="Copy path to clipboard"
                      style={miniBtn}>
                      📋
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ps-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </Rnd>
    </CaptureIdContext.Provider>
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
  fontSize: 'var(--fs-lg)', fontWeight: 800, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const miniBtn: React.CSSProperties = {
  padding: '3px 8px', border: 'none', borderRadius: 5, cursor: 'pointer',
  background: 'rgba(255,255,255,0.07)', color: 'var(--text-40)',
  fontSize: 'var(--fs-sm)', fontWeight: 800,
}
