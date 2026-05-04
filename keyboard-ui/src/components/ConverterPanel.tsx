import React, { useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

type Status = 'idle' | 'uploading' | 'converting' | 'ok' | 'err'

const inp: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid rgba(255,255,255,0.07)',
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

export function ConverterPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('converter', { x: 300, y: 80, w: 340, h: 0 })

  const uploadRef = useRef<HTMLInputElement>(null)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const [inputPath, setInputPath]   = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [bitrate, setBitrate]       = useState('192k')
  const [status, setStatus]         = useState<Status>('idle')
  const [errorMsg, setErrorMsg]     = useState('')
  const [resultPath, setResultPath] = useState('')
  const [progress, setProgress]     = useState(0)
  const [elapsed, setElapsed]       = useState(0)
  const startTimeRef                = useRef(0)

  // elapsed ticker during conversion
  useEffect(() => {
    if (status !== 'converting') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [status])

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleUpload(file: File) {
    setStatus('uploading')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r   = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
      const res = await r.json()
      if (res.status === 'success') {
        setInputPath(res.path)
        setOutputPath(res.path.replace(/\.[^.]+$/, '.mp3'))
      }
    } catch { /* noop */ }
    setStatus('idle')
  }

  async function convert() {
    if (!inputPath) return
    setStatus('converting')
    setProgress(0)
    setElapsed(0)
    setErrorMsg('')
    setResultPath('')
    startTimeRef.current = Date.now()

    try {
      const r   = await fetch(`${API}/api/convert/wav-to-mp3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: inputPath, bitrate, output: outputPath || undefined }),
      })
      const res = await r.json()
      if (!r.ok || res.error) { setStatus('err'); setErrorMsg(res.error || 'Error'); return }

      const jobId = res.job_id
      pollRef.current = setInterval(async () => {
        try {
          const sr  = await fetch(`${API}/api/convert/status/${jobId}`)
          const job = await sr.json()
          setProgress(job.progress ?? 0)
          if (job.status === 'done') {
            stopPoll()
            setStatus('ok')
            setProgress(100)
            setResultPath(job.path)
            setOutputPath(job.path)
          } else if (job.status === 'error') {
            stopPoll()
            setStatus('err')
            setErrorMsg(job.error || 'Conversion failed')
          }
        } catch { /* noop */ }
      }, 400)
    } catch (e: unknown) {
      setStatus('err')
      setErrorMsg(String(e))
    }
  }

  function reset() {
    stopPoll()
    setInputPath('')
    setOutputPath('')
    setStatus('idle')
    setErrorMsg('')
    setResultPath('')
    setProgress(0)
    setElapsed(0)
  }

  const isWav     = inputPath.toLowerCase().match(/\.(wav|flac|ogg|m4a|mp3)$/)
  const canConvert = !!inputPath && !!isWav && status !== 'converting' && status !== 'uploading'
  const fmtTime   = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: 340, height: 'auto' }}
      minWidth={280}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('converter') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('converter')}
      onDragStop={(_, d) => { saveGeo('converter', { x: d.x, y: d.y }); endDrag('converter') }}
      style={{ zIndex: zOf('converter', 100) }}
      enableResizing={false}
    >
      <div style={{ background: 'var(--bg-chassis)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-chassis)', overflow: 'hidden' }}>
        <PanelHeader title="Converter" onClose={onClose} className="drag-handle" />

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Drop zone */}
          <div
            onClick={() => uploadRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
            style={{
              border: `2px dashed ${inputPath ? 'rgba(0,184,96,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer',
              background: inputPath ? 'rgba(0,184,96,0.04)' : 'transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = inputPath ? 'rgba(0,184,96,0.5)' : 'rgba(255,255,255,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = inputPath ? 'rgba(0,184,96,0.3)' : 'rgba(255,255,255,0.1)')}
          >
            <div style={{ fontSize: 'var(--fs-5xl)', marginBottom: 4 }}>{status === 'uploading' ? '⏳' : inputPath ? '✓' : '📂'}</div>
            <div style={{ fontSize: 'var(--fs-md)', color: inputPath ? '#00b860' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              {status === 'uploading'
                ? 'Uploading...'
                : inputPath
                  ? inputPath.split(/[\\/]/).pop()
                  : 'Click or drop audio file here'}
            </div>
            <input ref={uploadRef} type="file" accept=".wav,.mp3,.ogg,.flac,.m4a" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          </div>

          {/* Input */}
          <div>
            <div style={lbl}>Input Path</div>
            <input style={inp} value={inputPath} onChange={e => setInputPath(e.target.value)}
              placeholder="C:\path\to\file.wav" onMouseDown={e => e.stopPropagation()} />
          </div>

          {/* Output */}
          <div>
            <div style={lbl}>Output Path</div>
            <input style={inp} value={outputPath} onChange={e => setOutputPath(e.target.value)}
              placeholder="Auto (.mp3, same folder)" onMouseDown={e => e.stopPropagation()} />
          </div>

          {/* Bitrate */}
          <div>
            <div style={lbl}>Bitrate</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['128k', '192k', '320k'] as const).map(b => (
                <button key={b} onClick={() => setBitrate(b)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                  fontSize: 'var(--fs-md)', fontWeight: bitrate === b ? 700 : 400,
                  border: `1px solid ${bitrate === b ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)'}`,
                  background: bitrate === b ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                  color: bitrate === b ? 'var(--text-pure)' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.12s',
                }}>{b}</button>
              ))}
            </div>
          </div>

          {/* Progress bar (visible during conversion) */}
          {status === 'converting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Converting</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)}</span>
                  <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: '#00b860', fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg, #00b860, #00d470)',
                  width: `${progress}%`, transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* Convert button */}
          <button
            onClick={status === 'ok' ? reset : convert}
            disabled={!canConvert && status !== 'ok'}
            style={{
              width: '100%', padding: '12px 0', border: 'none', borderRadius: 10,
              cursor: (!canConvert && status !== 'ok') ? 'not-allowed' : 'pointer',
              fontWeight: 800, fontSize: 'var(--fs-lg)', letterSpacing: '0.2em', textTransform: 'uppercase',
              background: status === 'ok' ? 'var(--status-ok)' : status === 'err' ? 'rgba(239,68,68,0.2)' : 'var(--bg-btn-silver)',
              color: status === 'ok' ? '#000' : status === 'err' ? '#ef4444' : '#000',
              opacity: (!canConvert && status !== 'ok') ? 0.35 : 1,
              transition: 'all 0.15s', boxShadow: 'var(--shadow-btn)',
            }}
          >
            {status === 'converting' ? `// ${progress}% — ${fmtTime(elapsed)}`
              : status === 'ok'       ? '✓ Done — Convert Another'
              : status === 'err'      ? '✕ Failed — Retry'
              : '⇄ Convert to MP3'}
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
              <div style={{ fontSize: 'var(--fs-base)', color: '#00b860', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Saved</div>
              <div style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>{resultPath}</div>
              <button
                onClick={() => fetch(`${API}/api/open-explorer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: resultPath }) })}
                style={{ alignSelf: 'flex-start', padding: '5px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontSize: 'var(--fs-md)', fontWeight: 600, cursor: 'pointer' }}
              >📂 Abrir no Explorer</button>
            </div>
          )}
        </div>
      </div>
    </Rnd>
  )
}
