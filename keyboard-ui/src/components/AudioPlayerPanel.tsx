import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { resolveUrl, audioSrc } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

/* ── Types ──────────────────────────────────────────────────────── */

type AssetEntry = { name: string; path: string; folder: string; modified: string; size: number }
type Tab = 'all' | 'synth' | 'drone' | 'ps_' | 'session_' | 'drum'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'synth', label: 'Synth' },
  { key: 'drone', label: 'Drone' },
  { key: 'ps_', label: 'Paulstretch' },
  { key: 'session_', label: 'Session' },
  { key: 'drum', label: 'Drum' },
]

const FOLDERS: Tab[] = ['synth', 'drone', 'ps_', 'session_', 'drum']
const AUDIO_EXTS = /\.(wav|mp3|ogg|webm|m4a|mp4|flac)$/i
const CARD_H = 72
const OVERSCAN = 4

/* ── Server-side peaks with concurrency limiter ────────────────── */

const peaksCache = new Map<string, number[]>()
const MAX_CONCURRENT = 3
let inFlight = 0
const queue: Array<() => void> = []

function runNext() {
  while (inFlight < MAX_CONCURRENT && queue.length) {
    inFlight++
    queue.shift()!()
  }
}

async function fetchPeaks(filePath: string, signal: AbortSignal): Promise<number[]> {
  const cached = peaksCache.get(filePath)
  if (cached) return cached

  await new Promise<void>(resolve => {
    if (inFlight < MAX_CONCURRENT) { inFlight++; resolve() }
    else queue.push(resolve)
  })

  if (signal.aborted) { inFlight--; runNext(); throw new DOMException('Aborted', 'AbortError') }

  try {
    const url = resolveUrl(`/api/audio/peaks?path=${encodeURIComponent(filePath)}&buckets=80`)
    const resp = await fetch(url, { signal })
    if (!resp.ok) throw new Error('peaks fetch failed')
    const peaks: number[] = await resp.json()
    peaksCache.set(filePath, peaks)
    return peaks
  } finally {
    inFlight--
    runNext()
  }
}

/* ── Waveform drawing ───────────────────────────────────────────── */

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], progress: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth * dpr
  const h = canvas.clientHeight * dpr
  canvas.width = w
  canvas.height = h
  ctx.clearRect(0, 0, w, h)
  const barW = 2 * dpr, gap = 1 * dpr, count = Math.floor(w / (barW + gap))
  const step = Math.max(1, Math.floor(peaks.length / count))
  const mid = h / 2
  for (let i = 0; i < count; i++) {
    const val = peaks[i * step] ?? 0
    const barH = Math.max(2 * dpr, val * h * 0.9)
    const x = i * (barW + gap)
    ctx.fillStyle = i / count <= progress ? '#00b860' : 'rgba(255,255,255,0.3)'
    ctx.fillRect(x, mid - barH / 2, barW, barH)
  }
}

/* ── stop Rnd from eating clicks ────────────────────────────────── */

const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation()

/* ── AudioCard (lazy waveform) ─────────────────────────────────── */

const AudioCard = React.memo(function AudioCard({ entry, onNormalize, normalizing }: {
  entry: AssetEntry
  onNormalize: (path: string) => void
  normalizing: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const rafRef = useRef(0)

  // decode waveform only when visible
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ac = new AbortController()
    let decoded = false

    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || decoded) return
      decoded = true
      obs.disconnect()
      fetchPeaks(entry.path, ac.signal)
        .then(setPeaks)
        .catch(() => {
          if (!ac.signal.aborted) setPeaks(Array.from({ length: 80 }, () => 0.15 + Math.random() * 0.7))
        })
    }, { rootMargin: '200px' })

    obs.observe(el)
    return () => { obs.disconnect(); ac.abort() }
  }, [entry.path])

  useEffect(() => {
    if (canvasRef.current && peaks) drawWaveform(canvasRef.current, peaks, progress)
  }, [peaks, progress])

  const tick = useCallback(() => {
    const a = audioRef.current
    if (!a || a.paused) return
    setProgress(a.duration ? a.currentTime / a.duration : 0)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      cancelAnimationFrame(rafRef.current)
      setPlaying(false)
    } else {
      if (!a.src || a.src === '') a.src = audioSrc(entry.path)
      a.play().catch(() => {})
      setPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  function seek(e: React.MouseEvent<HTMLCanvasElement>) {
    e.stopPropagation()
    const a = audioRef.current; const c = canvasRef.current
    if (!a || !c || !a.duration) return
    const rect = c.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = pct * a.duration
    setProgress(pct)
  }

  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00'
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const dateStr = entry.modified
    ? new Date(entry.modified).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : ''

  return (
    <div
      ref={rootRef}
      onMouseDown={stop} onPointerDown={stop}
      style={{
        background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
        padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
        position: 'relative', opacity: normalizing ? 0.6 : 1,
        transition: 'opacity 0.3s', height: CARD_H, boxSizing: 'border-box',
      }}
    >
      {/* audio element only created when user interacts */}
      <audio
        ref={audioRef}
        preload="none"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0); cancelAnimationFrame(rafRef.current) }}
      />

      <button onClick={toggle} onMouseDown={stop} aria-label={playing ? "Pause" : "Play"} style={{
        width: 32, height: 32, minWidth: 32, borderRadius: '50%', border: '1.5px solid var(--text-70)',
        background: 'transparent', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: 'var(--text-pure)', fontSize: 14,
      }}>
        {playing ? '❚❚' : '▶'}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <canvas
            ref={canvasRef}
            style={{ cursor: 'pointer', borderRadius: 'var(--radius-xs)', flex: 1, height: 28 }}
            onClick={seek} onMouseDown={stop}
          />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-40)', whiteSpace: 'nowrap' }}>
            {fmtTime(duration)}
          </span>
          <button
            title="Normalize / Balance"
            aria-label="Normalize audio"
            onClick={(e) => { e.stopPropagation(); onNormalize(entry.path) }}
            onMouseDown={stop}
            disabled={normalizing}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--text-40)', padding: '0 2px',
            }}
          >⚖</button>
        </div>
        <span style={{
          fontSize: 'var(--fs-xs)', color: 'var(--text-70)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{entry.name}</span>
        {dateStr && (
          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-40)' }}>{dateStr}</span>
        )}
      </div>

      {normalizing && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 'var(--fs-xs)', color: 'var(--status-ok)',
          animation: 'pulse 1.2s infinite',
        }}>Balanceando...</div>
      )}
    </div>
  )
})

/* ── Virtualized list ──────────────────────────────────────────── */

function VirtualList({ items, normJobs, onNormalize }: {
  items: AssetEntry[]
  normJobs: Record<string, string>
  onNormalize: (path: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(500)
  const gap = 6
  const rowH = CARD_H + gap

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setViewH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const totalH = items.length * rowH
  const startIdx = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN)
  const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewH) / rowH) + OVERSCAN)
  const visible = items.slice(startIdx, endIdx)

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      onMouseDown={stop} onPointerDown={stop}
      style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}
    >
      <div style={{ height: totalH, position: 'relative' }}>
        {visible.map((a, i) => (
          <div
            key={a.path}
            style={{
              position: 'absolute',
              top: (startIdx + i) * rowH,
              left: 0, right: 0,
            }}
          >
            <AudioCard
              entry={a}
              onNormalize={onNormalize}
              normalizing={!!normJobs[a.path]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main Panel ─────────────────────────────────────────────────── */

export function AudioPlayerPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('audioplayer', { x: 500, y: 100, w: 320, h: 500 })

  const [tab, setTab] = useState<Tab>('all')
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [normJobs, setNormJobs] = useState<Record<string, string>>({})

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const folders = tab === 'all' ? FOLDERS : [tab]
      const results = await Promise.all(
        folders.map(f =>
          fetch(resolveUrl(`/api/assets/list?folder=${f}`))
            .then(r => r.json())
            .catch(() => [])
        )
      )
      const raw: AssetEntry[] = results.flat()
      const seen = new Set<string>()
      const all: AssetEntry[] = []
      for (const entry of raw) {
        const key = entry.path
        if (seen.has(key)) continue
        if (!AUDIO_EXTS.test(entry.name)) continue
        seen.add(key)
        if (!entry.modified) entry.modified = ''
        if (!entry.folder) entry.folder = ''
        all.push(entry)
      }
      all.sort((a, b) => {
        if (a.modified && b.modified) return new Date(b.modified).getTime() - new Date(a.modified).getTime()
        return a.name.localeCompare(b.name)
      })
      setAssets(all)
    } catch { setAssets([]) }
    setLoading(false)
  }, [tab])

  useEffect(() => { fetchAssets() }, [fetchAssets])

  const handleNormalize = useCallback(async (path: string) => {
    try {
      const r = await fetch(resolveUrl('/api/audio/normalize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, target_lufs: -14 }),
      })
      const { job_id } = await r.json()
      setNormJobs(prev => ({ ...prev, [path]: job_id }))
      const iv = setInterval(async () => {
        try {
          const sr = await fetch(resolveUrl(`/api/audio/normalize/status/${job_id}`))
          const job = await sr.json()
          if (job.status === 'done' || job.status === 'error') {
            clearInterval(iv)
            setNormJobs(prev => { const n = { ...prev }; delete n[path]; return n })
            if (job.status === 'done') fetchAssets()
          }
        } catch { /* retry */ }
      }, 800)
    } catch { /* noop */ }
  }, [fetchAssets])

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w ?? 320, height: geo.h ?? 500 }}
      minWidth={280} minHeight={300}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('audioplayer') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('audioplayer')}
      onDragStop={(_, d) => { saveGeo('audioplayer', { x: d.x, y: d.y }); endDrag('audioplayer') }}
      onResizeStop={(_, __, el, ___, pos) => {
        saveGeo('audioplayer', { x: pos.x, y: pos.y, w: el.offsetWidth, h: el.offsetHeight })
      }}
      style={{ zIndex: zOf('audioplayer', 100) }}
    >
      <div style={{
        background: 'var(--bg-chassis)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-panel)', boxShadow: 'var(--shadow-chassis)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <PanelHeader title="// Audio Library" onClose={onClose} className="drag-handle" />

        {/* Tabs */}
        <div
          onMouseDown={stop} onPointerDown={stop}
          style={{
            display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto', flexShrink: 0,
          }}
        >
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} onMouseDown={stop} style={{
              flex: 1, padding: '6px 4px', border: 'none', cursor: 'pointer',
              fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.05em',
              background: tab === t.key ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: tab === t.key ? 'var(--text-pure)' : 'var(--text-40)',
              borderBottom: tab === t.key ? '2px solid var(--status-ok)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
                height: CARD_H, animation: 'pulse 1.2s infinite',
              }} />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div style={{
            flex: 1, textAlign: 'center', padding: 32,
            color: 'var(--text-20)', fontSize: 'var(--fs-xs)',
          }}>Nenhum áudio encontrado</div>
        ) : (
          <VirtualList items={assets} normJobs={normJobs} onNormalize={handleNormalize} />
        )}
      </div>
    </Rnd>
  )
}
