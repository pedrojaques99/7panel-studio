import React, { useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API, resolveUrl } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

type Status = 'idle' | 'downloading' | 'ok' | 'err'
type Format = 'mp3' | 'mp4'

const inp: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-pure)',
  fontSize: 'var(--fs-lg)',
  padding: '8px 12px',
  outline: 'none',
  width: '100%',
}

const lbl: React.CSSProperties = {
  fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.15em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4,
}

export function YTDownloadPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('ytdl', { x: 340, y: 120, w: 360, h: 0 })

  const [url, setUrl]           = useState('')
  const [format, setFormat]     = useState<Format>('mp3')
  const [filename, setFilename] = useState('')
  const [start, setStart]       = useState('')
  const [end, setEnd]           = useState('')
  const [status, setStatus]     = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase]       = useState<'downloading' | 'processing' | 'done'>('downloading')
  const [elapsed, setElapsed]   = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [resultPath, setResultPath] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)

  useEffect(() => {
    if (status !== 'downloading') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [status])

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function download() {
    if (!url.trim()) return
    setStatus('downloading')
    setProgress(0)
    setPhase('downloading')
    setElapsed(0)
    setErrorMsg('')
    setResultPath('')
    startTimeRef.current = Date.now()

    try {
      const body: Record<string, string> = { url: url.trim(), format }
      if (filename.trim()) body.filename = filename.trim()
      if (start.trim()) body.start = start.trim()
      if (end.trim()) body.end = end.trim()
      const r = await fetch(resolveUrl('/api/yt-download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const res = await r.json()

      if (res.status === 'done') {
        setStatus('ok')
        setProgress(100)
        setResultPath(res.path)
        return
      }

      if (!r.ok || res.error) {
        setStatus('err')
        setErrorMsg(res.error || 'Falha no download')
        return
      }

      const jobId = res.job_id
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(resolveUrl(`/api/yt-download/status/${jobId}`))
          const job = await sr.json()
          setProgress(Math.round(job.progress ?? 0))
          if (job.phase) setPhase(job.phase)
          if (job.status === 'done') {
            stopPoll()
            setStatus('ok')
            setProgress(100)
            setResultPath(job.path)
          } else if (job.status === 'error') {
            stopPoll()
            setStatus('err')
            setErrorMsg(job.error || 'Falha no download')
          }
        } catch { /* noop */ }
      }, 500)
    } catch (e: unknown) {
      setStatus('err')
      setErrorMsg(String(e))
    }
  }

  function reset() {
    stopPoll()
    setUrl('')
    setFilename('')
    setStart('')
    setEnd('')
    setStatus('idle')
    setProgress(0)
    setElapsed(0)
    setErrorMsg('')
    setResultPath('')
  }

  const canDownload = !!url.trim() && status !== 'downloading'
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: 360, height: 'auto' }}
      minWidth={300}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('ytdl') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('ytdl')}
      onDragStop={(_, d) => { saveGeo('ytdl', { x: d.x, y: d.y }); endDrag('ytdl') }}
      style={{ zIndex: zOf('ytdl', 100) }}
      enableResizing={false}
    >
      <div style={{ background: 'var(--bg-chassis)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-chassis)', overflow: 'hidden' }}>
        <PanelHeader title="YT Download" onClose={onClose} className="drag-handle" />

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* URL */}
          <div>
            <div style={lbl}>YouTube URL</div>
            <input style={inp} value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..." onMouseDown={e => e.stopPropagation()} />
          </div>

          {/* Format toggle */}
          <div>
            <div style={lbl}>Format</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['mp3', 'mp4'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                  fontSize: 'var(--fs-md)', fontWeight: format === f ? 700 : 400,
                  border: `1px solid ${format === f ? 'rgba(255,255,255,0.25)' : 'var(--border-subtle)'}`,
                  background: format === f ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                  color: format === f ? 'var(--text-pure)' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.12s',
                }}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* Filename */}
          <div>
            <div style={lbl}>Filename</div>
            <input style={inp} value={filename} onChange={e => setFilename(e.target.value)}
              placeholder={`Auto (yt_...${format})`} onMouseDown={e => e.stopPropagation()} />
          </div>

          {/* Trim */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={lbl}>Start</div>
              <input style={inp} value={start} onChange={e => setStart(e.target.value)}
                placeholder="0:00" onMouseDown={e => e.stopPropagation()} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={lbl}>End</div>
              <input style={inp} value={end} onChange={e => setEnd(e.target.value)}
                placeholder="end" onMouseDown={e => e.stopPropagation()} />
            </div>
          </div>

          {/* Progress bar */}
          {status === 'downloading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {phase === 'processing' ? 'Processando' : 'Baixando'}
                </span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)}</span>
                  <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: '#00b860', fontVariantNumeric: 'tabular-nums' }}>
                    {phase === 'processing' ? '⚙️' : `${progress}%`}
                  </span>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: phase === 'processing'
                    ? 'linear-gradient(90deg, transparent, #00b860, transparent)'
                    : 'linear-gradient(90deg, #00b860, #00d470)',
                  width: phase === 'processing' ? '100%' : `${progress}%`,
                  transition: 'width 0.3s ease',
                  animation: phase === 'processing' ? 'ytdl-pulse 1.5s ease-in-out infinite' : 'none',
                }} />
              </div>
            </div>
          )}

          {/* Download button */}
          <button
            onClick={status === 'ok' ? reset : download}
            disabled={!canDownload && status !== 'ok'}
            style={{
              width: '100%', padding: '12px 0', border: 'none', borderRadius: 10,
              cursor: (!canDownload && status !== 'ok') ? 'not-allowed' : 'pointer',
              fontWeight: 800, fontSize: 'var(--fs-lg)', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: status === 'ok' ? 'var(--status-ok)' : status === 'err' ? 'rgba(239,68,68,0.2)' : status === 'downloading' ? 'rgba(255,255,255,0.05)' : 'var(--bg-btn-silver)',
              color: status === 'ok' ? '#000' : status === 'err' ? '#ef4444' : status === 'downloading' ? 'rgba(255,255,255,0.4)' : '#000',
              opacity: (!canDownload && status !== 'ok') ? 0.35 : 1,
              transition: 'all 0.15s', boxShadow: 'var(--shadow-btn)',
            }}
          >
            {status === 'downloading' ? (phase === 'processing' ? `⚙️ Processando — ${fmtTime(elapsed)}` : `⏳ ${progress}% — ${fmtTime(elapsed)}`)

              : status === 'ok'       ? '✓ Pronto — Baixar Outro'
              : status === 'err'      ? '✕ Falhou — Tentar Novamente'
              : `⬇ Baixar ${format.toUpperCase()}`}
          </button>

          {/* Error */}
          {status === 'err' && errorMsg && (
            <div style={{ fontSize: 'var(--fs-base)', color: '#ef4444', background: 'rgba(239,68,68,0.07)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5, wordBreak: 'break-all' }}>
              {errorMsg}
            </div>
          )}

          {/* Result */}
          {status === 'ok' && resultPath && (
            <div style={{ background: 'rgba(0,184,96,0.07)', border: '1px solid rgba(0,184,96,0.2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 'var(--fs-base)', color: '#00b860', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Salvo</div>
              <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-50)', wordBreak: 'break-all' }}>{resultPath}</div>
              <button
                onClick={() => fetch(`${API}/api/open-explorer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: resultPath }) })}
                style={{ alignSelf: 'flex-start', padding: '5px 12px', border: '1px solid var(--border-light)', borderRadius: 7, background: 'var(--bg-hover)', color: 'var(--text-60)', fontSize: 'var(--fs-md)', fontWeight: 600, cursor: 'pointer' }}
              >📂 Abrir no Explorer</button>
            </div>
          )}
        </div>
      </div>
    </Rnd>
  )
}
