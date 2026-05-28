import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { captureRegistry, type CaptureSource } from '../lib/capture-bus'
import { getSharedAudioContext } from '../lib/audio-context'
import { encodeWav } from '../lib/audio-utils'

type ExportFormat = 'webm' | 'wav'

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ExporterPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('exporter', { x: 500, y: 200, w: 300, h: 'auto' as unknown as number })

  const [sources, setSources] = useState<CaptureSource[]>(() => captureRegistry.list())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [format, setFormat] = useState<ExportFormat>('wav')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [history, setHistory] = useState<{ name: string; size: number; url: string }[]>([])
  const [vuLevel, setVuLevel] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mergeNodesRef = useRef<MediaStreamAudioSourceNode[]>([])
  const mergeDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)
  const pausedAtRef = useRef<number>(0)
  const vuAnalyserRef = useRef<AnalyserNode | null>(null)
  const vuRafRef = useRef<number>(0)

  useEffect(() => {
    const unsub = captureRegistry.subscribe(() => {
      const list = captureRegistry.list()
      setSources(list)
      setSelected(prev => {
        const next = new Set(prev)
        for (const id of next) if (!list.find(s => s.id === id)) next.delete(id)
        return next
      })
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSources(captureRegistry.list())
    setSelected(new Set(['__master__']))
    return unsub
  }, [])

  const masterOn = selected.has('__master__')

  const toggleSource = (id: string) => {
    if (recording) return
    setSelected(prev => {
      const next = new Set(prev)
      if (id === '__master__') {
        if (next.has('__master__')) next.delete('__master__')
        else { next.clear(); next.add('__master__') }
      } else {
        next.delete('__master__')
        if (next.has(id)) next.delete(id); else next.add(id)
      }
      return next
    })
  }

  useEffect(() => {
    captureRegistry.setRecordingState(recording, selected)
    sources.forEach(s => {
      captureRegistry.setMonitor(s.id, !recording || selected.has(s.id))
    })
  }, [recording, selected, sources])

  // VU meter animation loop
  const startVu = useCallback((analyser: AnalyserNode) => {
    vuAnalyserRef.current = analyser
    const buf = new Float32Array(analyser.fftSize)
    const tick = () => {
      if (!vuAnalyserRef.current) return
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i])
        if (v > peak) peak = v
      }
      setVuLevel(peak)
      vuRafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stopVu = useCallback(() => {
    vuAnalyserRef.current = null
    cancelAnimationFrame(vuRafRef.current)
    setVuLevel(0)
  }, [])

  const cleanupMergeNodes = useCallback(() => {
    mergeNodesRef.current.forEach(n => { try { n.disconnect() } catch { /* */ } })
    mergeNodesRef.current = []
    mergeDestRef.current = null
  }, [])

  const startRecording = useCallback(() => {
    const active = sources.filter(s => selected.has(s.id))
    if (active.length === 0) return

    const streams = active.map(s => s.getStream()).filter(Boolean) as MediaStream[]
    if (streams.length === 0) return

    const ctx = getSharedAudioContext()
    const mergeDest = ctx.createMediaStreamDestination()
    mergeDestRef.current = mergeDest
    const nodes: MediaStreamAudioSourceNode[] = []

    streams.forEach(stream => {
      try {
        const node = ctx.createMediaStreamSource(stream)
        node.connect(mergeDest)
        nodes.push(node)
      } catch (e) {
        console.warn('ExporterPanel: could not connect stream', e)
      }
    })
    mergeNodesRef.current = nodes

    // VU analyser
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    nodes.forEach(n => n.connect(analyser))
    startVu(analyser)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(mergeDest.stream, { mimeType })
    recorderRef.current = recorder
    chunksRef.current = []
    setFileSize(0)

    recorder.ondataavailable = e => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
        setFileSize(prev => prev + e.data.size)
      }
    }

    recorder.onstop = async () => {
      stopVu()
      cleanupMergeNodes()

      const webmBlob = new Blob(chunksRef.current, { type: mimeType })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const baseName = fileName.trim() || `capture-${ts}`

      let finalBlob: Blob
      let ext: string

      if (format === 'wav') {
        try {
          const arrayBuf = await webmBlob.arrayBuffer()
          const audioBuf = await ctx.decodeAudioData(arrayBuf)
          finalBlob = encodeWav(audioBuf)
          ext = 'wav'
        } catch {
          finalBlob = webmBlob
          ext = 'webm'
        }
      } else {
        finalBlob = webmBlob
        ext = 'webm'
      }

      const url = URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      const fullName = `${baseName}.${ext}`
      a.href = url
      a.download = fullName
      a.click()

      setHistory(prev => [{ name: fullName, size: finalBlob.size, url }, ...prev].slice(0, 10))
    }

    recorder.start(250)
    setRecording(true)
    setPaused(false)
    setElapsed(0)
    startRef.current = Date.now()
    pausedAtRef.current = 0
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current - pausedAtRef.current) / 1000))
    }, 250)
  }, [sources, selected, format, fileName, startVu, stopVu, cleanupMergeNodes])

  const pauseRecording = useCallback(() => {
    const r = recorderRef.current
    if (!r) return
    if (r.state === 'recording') {
      r.pause()
      setPaused(true)
      pausedAtRef.current = Date.now()
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    } else if (r.state === 'paused') {
      const delta = Date.now() - pausedAtRef.current
      startRef.current += delta
      pausedAtRef.current = 0
      r.resume()
      setPaused(false)
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
      }, 250)
    }
  }, [])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
    setPaused(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => {
    if (recorderRef.current) recorderRef.current.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    stopVu()
    cleanupMergeNodes()
  }, [stopVu, cleanupMergeNodes])

  const smBtn: React.CSSProperties = {
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-base)',
    fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    padding: '5px 10px', transition: 'all 0.1s',
  }

  const canRecord = selected.size > 0 && sources.some(s => selected.has(s.id))

  // VU bar segments
  const VU_SEGS = 16
  const vuActive = Math.min(VU_SEGS, Math.ceil(Math.sqrt(vuLevel) * 1.6 * VU_SEGS))

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
          display: 'flex', flexDirection: 'column', gap: 12,
          minWidth: 300,
        }}
      >
        <PanelHeader title="// Exporter" onClose={onClose} className="exp-drag" />

        {/* Source checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-20)' }}>
            Fontes de Captura
          </span>
          {sources.length === 0 ? (
            <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-20)', fontFamily: 'monospace' }}>
              Nenhum painel aberto
            </span>
          ) : (
            sources.map(src => {
              const isMaster = src.id === '__master__'
              const isOn = selected.has(src.id)
              const disabled = recording || (!isMaster && masterOn)
              const hasStream = src.getStream() !== null
              return (
                <label key={src.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: disabled ? 'default' : 'pointer',
                  padding: '6px 10px', borderRadius: 8,
                  opacity: disabled && !recording ? 0.35 : disabled && recording ? 0.6 : 1,
                  background: isMaster && isOn
                    ? 'rgba(239,68,68,0.10)'
                    : isOn ? 'rgba(0,184,96,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isMaster && isOn
                    ? 'rgba(239,68,68,0.35)'
                    : isOn ? 'rgba(0,184,96,0.25)' : 'var(--bg-hover)'}`,
                  transition: 'all 0.12s',
                  ...(isMaster ? { marginBottom: 3 } : {}),
                }}>
                  <input
                    type="checkbox"
                    checked={isOn}
                    disabled={disabled}
                    onChange={() => toggleSource(src.id)}
                    style={{ accentColor: isMaster ? '#ef4444' : 'var(--status-ok)', width: 13, height: 13 }}
                  />
                  <span style={{ fontSize: 'var(--fs-md)', fontWeight: isMaster ? 900 : 700, color: isOn ? 'var(--text-70)' : 'var(--text-20)', flex: 1 }}>
                    {src.label}
                  </span>
                  {!isMaster && (
                    <span style={{
                      fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.15em',
                      color: hasStream ? 'var(--status-ok)' : 'rgba(255,255,255,0.15)',
                    }}>
                      {hasStream ? 'READY' : 'IDLE'}
                    </span>
                  )}
                </label>
              )
            })
          )}
        </div>

        {/* Format + Filename */}
        {!recording && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['wav', 'webm'] as ExportFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  style={{
                    ...smBtn, flex: 1, padding: '5px 0',
                    background: format === f ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                    color: format === f ? 'var(--text-pure)' : 'var(--text-20)',
                    border: `1px solid ${format === f ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="filename (auto)"
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--bg-hover)',
                borderRadius: 6, padding: '6px 10px', color: 'var(--text-70)',
                fontSize: 'var(--fs-sm)', fontFamily: 'monospace', outline: 'none',
              }}
            />
          </div>
        )}

        {/* VU Meter + Timer */}
        {recording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 28 }}>
              {Array.from({ length: VU_SEGS }, (_, i) => {
                const active = i < vuActive
                const ratio = i / VU_SEGS
                const color = ratio > 0.85 ? '#ef4444' : ratio > 0.65 ? '#f59e0b' : '#22c55e'
                return (
                  <div key={i} style={{
                    width: 4, height: 6 + (i / VU_SEGS) * 22, borderRadius: 1,
                    background: active ? color : 'rgba(255,255,255,0.06)',
                    transition: 'background 0.06s',
                  }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: paused ? '#f59e0b' : '#ef4444',
                boxShadow: paused ? '0 0 8px rgba(245,158,11,0.8)' : '0 0 8px rgba(239,68,68,0.8)',
                animation: paused ? 'none' : 'pulse 1s ease-in-out infinite',
              }} />
              <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-5xl)', fontWeight: 900, color: 'var(--text-pure)', letterSpacing: '0.05em' }}>
                {fmt(elapsed)}
              </span>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-xs)', color: 'var(--text-20)' }}>
              {fmtSize(fileSize)}
            </span>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          {!recording ? (
            <button
              onClick={startRecording}
              disabled={!canRecord}
              style={{
                ...smBtn, flex: 1, padding: '10px 0', fontSize: 'var(--fs-md)',
                background: canRecord ? '#ef4444' : 'var(--bg-hover)',
                color: canRecord ? '#fff' : 'var(--text-20)',
              }}
            >
              REC
            </button>
          ) : (
            <>
              <button
                onClick={pauseRecording}
                style={{
                  ...smBtn, flex: 1, padding: '10px 0', fontSize: 'var(--fs-md)',
                  background: paused ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                  color: paused ? '#000' : 'var(--text-70)',
                }}
              >
                {paused ? 'RESUME' : 'PAUSE'}
              </button>
              <button
                onClick={stopRecording}
                style={{
                  ...smBtn, flex: 1, padding: '10px 0', fontSize: 'var(--fs-md)',
                  background: 'var(--bg-btn-silver)', color: '#000',
                }}
              >
                STOP
              </button>
            </>
          )}
        </div>

        {/* History */}
        {history.length > 0 && !recording && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 80, overflowY: 'auto' }}>
            {history.map((h, i) => (
              <a
                key={i}
                href={h.url}
                download={h.name}
                style={{
                  fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-40)',
                  textDecoration: 'none', display: 'flex', justifyContent: 'space-between',
                  padding: '2px 4px', borderRadius: 4,
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  ↓ {h.name}
                </span>
                <span style={{ color: 'var(--text-20)', marginLeft: 8, flexShrink: 0 }}>
                  {fmtSize(h.size)}
                </span>
              </a>
            ))}
          </div>
        )}

        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-10)', fontFamily: 'monospace', lineHeight: 1.4 }}>
          {masterOn ? 'Captures all app audio — not system/Discord' : 'Records only selected panels — not system audio'}
        </span>
      </div>
    </Rnd>
  )
}
