import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry, type CaptureSource } from '../lib/capture-bus'

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function ExporterPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('exporter', { x: 500, y: 200, w: 300, h: 'auto' as unknown as number })

  const [sources, setSources] = useState<CaptureSource[]>(() => captureRegistry.list())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [lastFile, setLastFile] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mergeCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)

  // Sync sources list from registry
  useEffect(() => {
    const unsub = captureRegistry.subscribe(() => {
      const list = captureRegistry.list()
      setSources(list)
      setSelected(prev => {
        const next = new Set(prev)
        // remove stale selections
        for (const id of next) if (!list.find(s => s.id === id)) next.delete(id)
        return next
      })
    })
    // seed initial selection with all available
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSources(captureRegistry.list())
    setSelected(new Set(captureRegistry.list().map(s => s.id)))
    return unsub
  }, [])

  const toggleSource = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Broadcast recording state to all panels (for visual indicators + monitor mute)
  useEffect(() => {
    captureRegistry.setRecordingState(recording, selected)
    sources.forEach(s => {
      captureRegistry.setMonitor(s.id, !recording || selected.has(s.id))
    })
  }, [recording, selected, sources])

  const startRecording = useCallback(() => {
    const active = sources.filter(s => selected.has(s.id))
    if (active.length === 0) return

    const streams = active.map(s => s.getStream()).filter(Boolean) as MediaStream[]
    if (streams.length === 0) return

    const mergeCtx = new AudioContext()
    mergeCtxRef.current = mergeCtx
    const mergeDest = mergeCtx.createMediaStreamDestination()

    streams.forEach(stream => {
      try {
        mergeCtx.createMediaStreamSource(stream).connect(mergeDest)
      } catch (e) {
        console.warn('ExporterPanel: could not connect stream', e)
      }
    })

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(mergeDest.stream, { mimeType })
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.href = url
      a.download = `capture-${ts}.webm`
      a.click()
      URL.revokeObjectURL(url)
      setLastFile(`capture-${ts}.webm`)
      mergeCtxRef.current?.close()
      mergeCtxRef.current = null
    }

    recorder.start(100)
    setRecording(true)
    setElapsed(0)
    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 500)
  }, [sources, selected])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => {
    if (recorderRef.current) recorderRef.current.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    mergeCtxRef.current?.close()
  }, [])

  const smBtn: React.CSSProperties = {
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-base)',
    fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    padding: '5px 10px', transition: 'all 0.1s',
  }

  const canRecord = selected.size > 0 && sources.some(s => selected.has(s.id))

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || 300, height: 'auto' }}
      enableResizing={false}
      bounds={undefined}
      dragHandleClassName="exp-drag"
      className={`panel-drag${isDragging('exporter') ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront('exporter')}
      onDragStop={(_e, d) => { saveGeo('exporter', { x: d.x, y: d.y }); endDrag('exporter') }}
      style={{ zIndex: zOf('exporter', 15) }}
    >
      <div
        style={{
          borderRadius: 'var(--radius-panel)',
          background: 'var(--bg-chassis)',
          boxShadow: 'var(--shadow-chassis)',
          padding: '18px 20px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
          minWidth: 280,
        }}
      >
        <PanelHeader title="// Exporter" onClose={onClose} className="exp-drag" />

        {/* Source checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-20)' }}>
            Capture Sources
          </span>
          {sources.length === 0 ? (
            <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
              No panels open
            </span>
          ) : (
            sources.map(src => {
              const isOn = selected.has(src.id)
              const hasStream = src.getStream() !== null
              return (
                <label key={src.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '7px 10px', borderRadius: 8,
                  background: isOn ? 'rgba(0,184,96,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isOn ? 'rgba(0,184,96,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.12s',
                }}>
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggleSource(src.id)}
                    style={{ accentColor: 'var(--status-ok)', width: 13, height: 13 }}
                  />
                  <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: isOn ? 'var(--text-70)' : 'var(--text-20)', flex: 1 }}>
                    {src.label}
                  </span>
                  <span style={{
                    fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.15em',
                    color: hasStream ? 'var(--status-ok)' : 'rgba(255,255,255,0.15)',
                  }}>
                    {hasStream ? 'READY' : 'IDLE'}
                  </span>
                </label>
              )
            })
          )}
        </div>

        {/* Timer */}
        {recording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.8)', animation: 'pulse 1s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-5xl)', fontWeight: 900, color: 'var(--text-pure)', letterSpacing: '0.05em' }}>
              {fmt(elapsed)}
            </span>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!recording ? (
            <button
              onClick={startRecording}
              disabled={!canRecord}
              style={{
                ...smBtn, flex: 1, padding: '10px 0', fontSize: 'var(--fs-md)',
                background: canRecord ? '#ef4444' : 'rgba(255,255,255,0.06)',
                color: canRecord ? '#fff' : 'var(--text-20)',
              }}
            >
              ⏺ REC
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                ...smBtn, flex: 1, padding: '10px 0', fontSize: 'var(--fs-md)',
                background: 'var(--bg-btn-silver)', color: '#000',
              }}
            >
              ⏹ STOP
            </button>
          )}
        </div>

        {lastFile && !recording && (
          <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-40)' }}>
            ↓ {lastFile}
          </span>
        )}

        <span style={{ fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,0.1)', fontFamily: 'monospace', lineHeight: 1.4 }}>
          Records only selected panels — not system audio
        </span>
      </div>
    </Rnd>
  )
}
