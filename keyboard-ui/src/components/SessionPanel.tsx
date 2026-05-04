import React, { useState, useRef, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { API } from '../lib/api'

const PANEL_ID = 'session'
const DEF_GEO = { x: 500, y: 60, w: 520, h: 0 }

type Track = { id: string; file: File; name: string; dur: number }
type Visual = { file: File; name: string; kind: 'image' | 'video' }
type Status = 'idle' | 'uploading' | 'building' | 'done' | 'error'

function fmtDur(s: number) {
  if (!s || !isFinite(s)) return '--:--'
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

async function getFileDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(a.duration) ? a.duration : 0) }
    a.onerror = () => { URL.revokeObjectURL(url); resolve(0) }
    a.src = url
  })
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
  const res = await r.json()
  if (res.status !== 'success') throw new Error(res.error || 'Upload failed')
  return res.path as string
}

export function SessionPanel({ onClose }: { onClose: () => void }) {
  const { scale, zOf, bringToFront, endDrag, isDragging } = usePanelCtx()
  const geo = loadGeo(PANEL_ID, DEF_GEO)

  const [tracks, setTracks] = useState<Track[]>([])
  const [visual, setVisual] = useState<Visual | null>(null)
  const [xfadeSec, setXfadeSec] = useState(2.0)
  const [psEnabled, setPsEnabled] = useState(false)
  const [psFactor, setPsFactor] = useState(8)
  const [psWindow, setPsWindow] = useState(0.25)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg] = useState('')
  const [resultPath, setResultPath] = useState('')
  const [trackDrop, setTrackDrop] = useState(false)
  const [visualDrop, setVisualDrop] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }
  useEffect(() => () => stopPoll(), [])

  async function addFiles(files: File[]) {
    const arr = files.filter(f => /\.(mp3|wav|webm|ogg|m4a|flac|aac)$/i.test(f.name))
    if (!arr.length) return
    const newTracks = await Promise.all(
      arr.map(async f => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        name: f.name,
        dur: await getFileDuration(f),
      }))
    )
    setTracks(prev => [...prev, ...newTracks])
  }

  function removeTrack(id: string) {
    setTracks(prev => prev.filter(t => t.id !== id))
  }

  function moveTrack(id: string, dir: -1 | 1) {
    setTracks(prev => {
      const idx = prev.findIndex(t => t.id === id)
      if (idx < 0) return prev
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }

  function setVisualFile(file: File) {
    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(file.name)
    setVisual({ file, name: file.name, kind: isVideo ? 'video' : 'image' })
  }

  const xfadeCapped = Math.min(xfadeSec, tracks.length < 2 ? 0 : Math.min(...tracks.map(t => t.dur)) * 0.9)
  const totalDur = Math.max(0, tracks.reduce((s, t) => s + t.dur, 0) - Math.max(0, tracks.length - 1) * xfadeCapped)

  async function build() {
    if (!tracks.length || !visual) return
    setStatus('uploading')
    setProgress(0)
    setErrMsg('')
    setResultPath('')
    stopPoll()

    try {
      const [audioPaths, visualPath] = await Promise.all([
        Promise.all(tracks.map(t => uploadFile(t.file))),
        uploadFile(visual.file),
      ])

      setStatus('building')
      setProgress(5)

      const outputName = tracks[0].name.replace(/\.[^.]+$/, '') + '_session'
      const r = await fetch(`${API}/api/session/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_paths: audioPaths,
          visual_path: visualPath,
          visual_type: visual.kind,
          xfade_sec: xfadeCapped,
          output_name: outputName,
          ps_factor: psEnabled ? psFactor : 1.0,
          ps_window: psWindow,
        }),
      })
      const res = await r.json()
      if (!r.ok || res.error) { setStatus('error'); setErrMsg(res.error || 'Build failed'); return }

      const jobId = res.job_id as string
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${API}/api/convert/status/${jobId}`)
          const job = await sr.json()
          setProgress(job.progress ?? 0)
          if (job.status === 'done') {
            stopPoll(); setStatus('done'); setProgress(100); setResultPath(job.path)
          } else if (job.status === 'error') {
            stopPoll(); setStatus('error'); setErrMsg(job.error || 'Build failed')
          }
        } catch{ /* noop */ }
      }, 700)
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(String(e))
    }
  }

  function reset() {
    stopPoll()
    setTracks([])
    setVisual(null)
    setStatus('idle')
    setProgress(0)
    setErrMsg('')
    setResultPath('')
  }

  const busy = status === 'uploading' || status === 'building'
  const canBuild = tracks.length >= 1 && !!visual && !busy

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
        <PanelHeader title="Session" onClose={onClose} className="drag-handle">
          {tracks.length > 0 && (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-40)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              {tracks.length} tracks · {fmtDur(totalDur)}
            </span>
          )}
        </PanelHeader>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Audio tracks ── */}
          <div>
            <SecLabel>Audio Tracks</SecLabel>
            {tracks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {tracks.map((t, idx) => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', fontFamily: 'monospace', minWidth: 20, flexShrink: 0 }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 'var(--fs-md)', color: 'var(--text-70)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace',
                    }}>
                      {t.name.replace(/\.[^.]+$/, '')}
                    </span>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-40)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtDur(t.dur)}
                    </span>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <MiniBtn onClick={() => moveTrack(t.id, -1)} disabled={idx === 0}>↑</MiniBtn>
                      <MiniBtn onClick={() => moveTrack(t.id, 1)} disabled={idx === tracks.length - 1}>↓</MiniBtn>
                      <MiniBtn onClick={() => removeTrack(t.id)} danger>×</MiniBtn>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DropZone
              label={tracks.length > 0 ? '+ Add more tracks' : 'Drop audio files here or click to browse'}
              hint="MP3 · WAV · WEBM · OGG · M4A · FLAC"
              icon="🎵"
              active={trackDrop}
              compact={tracks.length > 0}
              onDragOver={() => setTrackDrop(true)}
              onDragLeave={() => setTrackDrop(false)}
              onDrop={files => { setTrackDrop(false); void addFiles(files) }}
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true
                inp.onchange = e => {
                  const fs = (e.target as HTMLInputElement).files
                  if (fs) void addFiles(Array.from(fs))
                }
                inp.click()
              }}
            />
          </div>

          {/* ── Crossfade (only with 2+ tracks) ── */}
          {tracks.length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-40)' }}>Crossfade</span>
                <span style={{ fontSize: 'var(--fs-base)', fontFamily: 'monospace', color: 'var(--text-70)', fontWeight: 700 }}>{xfadeSec.toFixed(1)}s</span>
              </div>
              <input
                type="range" min={0} max={10} step={0.1} value={xfadeSec}
                onChange={e => setXfadeSec(parseFloat(e.target.value))}
                onMouseDown={e => e.stopPropagation()}
                style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer', height: 4 }}
              />
              {xfadeCapped < xfadeSec && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'rgba(251,191,36,0.7)', fontStyle: 'italic' }}>
                  Capped to {xfadeCapped.toFixed(1)}s (track too short)
                </span>
              )}
            </div>
          )}

          {/* ── PS Effect ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setPsEnabled(v => !v)}
            >
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: psEnabled ? '#a78bfa' : 'var(--text-20)' }}>
                PS Effect
              </span>
              <div style={{
                width: 36, height: 18, borderRadius: 99, position: 'relative',
                background: psEnabled ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${psEnabled ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.15s', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: psEnabled ? 18 : 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: psEnabled ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                  transition: 'left 0.15s',
                }} />
              </div>
            </div>
            {psEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-20)' }}>Stretch Factor</span>
                    <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: '#a78bfa' }}>{psFactor}×</span>
                  </div>
                  <input type="range" min={2} max={200} step={1} value={psFactor}
                    onChange={e => setPsFactor(Number(e.target.value))}
                    onMouseDown={e => e.stopPropagation()}
                    style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer', height: 4 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-20)' }}>Window Size</span>
                    <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: '#a78bfa' }}>{psWindow.toFixed(2)}s</span>
                  </div>
                  <input type="range" min={0.05} max={1.0} step={0.05} value={psWindow}
                    onChange={e => setPsWindow(Number(e.target.value))}
                    onMouseDown={e => e.stopPropagation()}
                    style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer', height: 4 }} />
                </div>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'rgba(167,139,250,0.5)', fontStyle: 'italic' }}>
                  larger window = dreamier · smaller = grainier
                </span>
                {totalDur > 0 && (
                  <div style={{ display: 'flex', gap: 10, padding: '6px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', fontFamily: 'monospace' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)' }}>
                      in <span style={{ color: '#a78bfa' }}>{fmtDur(totalDur)}</span>
                    </span>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)' }}>→</span>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)' }}>
                      out <span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmtDur(totalDur * psFactor)}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Visual drop zone ── */}
          <div>
            <SecLabel>Visual</SecLabel>
            {visual ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(139,92,246,0.06)',
                border: '1px solid rgba(139,92,246,0.25)',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{visual.kind === 'video' ? '🎬' : '🖼️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {visual.name}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-20)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>
                    {visual.kind === 'video' ? 'Video loop (sem áudio)' : 'Imagem estática'}
                  </div>
                </div>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setVisual(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-40)', cursor: 'pointer', fontSize: 18, padding: '2px 6px', lineHeight: 1 }}
                >×</button>
              </div>
            ) : (
              <DropZone
                label="Drop image or video here"
                hint="JPG · PNG · MP4 · WEBM (video loops without audio)"
                icon="🖼️"
                active={visualDrop}
                onDragOver={() => setVisualDrop(true)}
                onDragLeave={() => setVisualDrop(false)}
                onDrop={files => { setVisualDrop(false); if (files[0]) setVisualFile(files[0]) }}
                onClick={() => {
                  const inp = document.createElement('input')
                  inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm,video/quicktime'
                  inp.onchange = e => {
                    const f = (e.target as HTMLInputElement).files?.[0]
                    if (f) setVisualFile(f)
                  }
                  inp.click()
                }}
              />
            )}
          </div>

          {/* ── Progress ── */}
          {busy && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-40)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {status === 'uploading' ? 'Uploading files' : 'Building MP4'}
                </span>
                <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: '#8b5cf6', fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
                  width: `${progress}%`, transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {status === 'error' && errMsg && (
            <div style={{ fontSize: 'var(--fs-base)', color: '#ef4444', background: 'rgba(239,68,68,0.07)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5, wordBreak: 'break-all' }}>
              {errMsg}
            </div>
          )}

          {/* ── Build button ── */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={status === 'done' ? reset : (status === 'error' ? reset : build)}
            disabled={!canBuild && status !== 'done' && status !== 'error'}
            style={{
              padding: '12px 0', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontWeight: 800, fontSize: 'var(--fs-lg)', letterSpacing: '0.2em', textTransform: 'uppercase',
              background:
                status === 'done' ? 'rgba(0,184,96,0.12)' :
                status === 'error' ? 'rgba(239,68,68,0.12)' :
                'rgba(139,92,246,0.12)',
              color:
                status === 'done' ? '#00b860' :
                status === 'error' ? '#ef4444' :
                '#8b5cf6',
              opacity: (!canBuild && !busy && status !== 'done' && status !== 'error') ? 0.35 : 1,
              transition: 'all 0.15s',
            }}
          >
            {status === 'done' ? '✓ Done — Build Another' :
             status === 'error' ? '✕ Error — Try Again' :
             busy ? `⟳ ${status === 'uploading' ? 'Uploading…' : `Building… ${progress}%`}` :
             '▶ Build Session MP4'}
          </button>

          {/* ── Result ── */}
          {status === 'done' && resultPath && (
            <div style={{ background: 'rgba(0,184,96,0.07)', border: '1px solid rgba(0,184,96,0.2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 'var(--fs-base)', color: '#00b860', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Saved</div>
              <div style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all', fontFamily: 'monospace' }}>{resultPath}</div>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => fetch(`${API}/api/open-explorer`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ path: resultPath }),
                })}
                style={{ alignSelf: 'flex-start', padding: '5px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontSize: 'var(--fs-md)', fontWeight: 600, cursor: 'pointer' }}
              >📂 Open in Explorer</button>
            </div>
          )}
        </div>
      </div>
    </Rnd>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-20)', marginBottom: 6 }}>
      {children}
    </div>
  )
}

interface DropZoneProps {
  label: string; hint: string; icon: string; active: boolean; compact?: boolean
  onDragOver: () => void; onDragLeave: () => void
  onDrop: (files: File[]) => void; onClick: () => void
}

function DropZone({ label, hint, icon, active, compact, onDragOver, onDragLeave, onDrop, onClick }: DropZoneProps) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(Array.from(e.dataTransfer.files)) }}
      onClick={onClick}
      style={{
        border: `2px dashed ${active ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: compact ? '10px 16px' : '24px 16px',
        textAlign: 'center', cursor: 'pointer',
        transition: 'all 0.15s',
        background: active ? 'rgba(139,92,246,0.05)' : 'transparent',
      }}
    >
      {!compact && <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontSize: compact ? 'var(--fs-base)' : 'var(--fs-md)', color: 'var(--text-40)', fontWeight: 600 }}>{label}</div>
      {!compact && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-20)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function MiniBtn({ onClick, disabled, danger, children }: {
  onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={e => e.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22, height: 22,
        border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.03)',
        color: danger ? 'rgba(239,68,68,0.75)' : 'var(--text-40)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.25 : 1,
        transition: 'all 0.1s',
        padding: 0,
      }}
    >{children}</button>
  )
}
