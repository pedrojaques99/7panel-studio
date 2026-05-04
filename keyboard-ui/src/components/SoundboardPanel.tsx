import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { audioSrc, API } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import type { SbChannel } from '../lib/types'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'
import { KeyTile } from '../lib/KeyTile'
import { captureRegistry } from '../lib/capture-bus'
import { CaptureIdContext } from '../lib/PanelHeader'
import { getSharedAudioContext, createCaptureDestination } from '../lib/audio-context'

export type { SbChannel }
export type SoundKey = { id: string; label: string; emoji: string; src: string; color?: string }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PlayMode = 'toggle'

export type SbMix = {
  id: string
  name: string
  keys: SoundKey[]
  volumes: Record<string, number>
  createdAt: number
}

function isYouTube(s: string) { return /youtube\.com|youtu\.be/.test(s) }

/* ── Soundboard capture context (shares global AudioContext) ────── */
let sbCaptureDest: MediaStreamAudioDestinationNode | null = null
const sbSourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()

function getSbCaptureStream(): MediaStream | null {
  return sbCaptureDest?.stream ?? null
}

function disconnectFromCapture(a: HTMLAudioElement) {
  const src = sbSourceMap.get(a)
  if (!src) return
  try { src.disconnect() } catch{ /* noop */ }
  sbSourceMap.delete(a)
}

function connectToCapture(a: HTMLAudioElement) {
  if (sbSourceMap.has(a)) return
  const ctx = getSharedAudioContext()
  if (!sbCaptureDest) sbCaptureDest = createCaptureDestination()
  const src = ctx.createMediaElementSource(a)
  src.connect(ctx.destination)
  src.connect(sbCaptureDest)
  sbSourceMap.set(a, src)
}

/* ── Mix persistence ─────────────────────────────────────────────── */
function loadMixes(): SbMix[] {
  try { const r = localStorage.getItem('soundboard-mixes'); if (r) return JSON.parse(r) } catch{ /* noop */ }
  return []
}
function saveMixes(mixes: SbMix[]) {
  localStorage.setItem('soundboard-mixes', JSON.stringify(mixes))
}

const COLORS = ['#00b860','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316','#84cc16']
const KEY_SIZE = 96
const GAP = 10
const PAD = 18

function makeKey(): SoundKey {
  return { id: crypto.randomUUID(), label: 'New Key', emoji: '🔊', src: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] }
}

function loadKeys(): SoundKey[] {
  try { const r = localStorage.getItem('soundboard-keys'); if (r) return JSON.parse(r) } catch{ /* noop */ }
  return [
    { id: crypto.randomUUID(), label: 'Sound 1', emoji: '🔈', src: '', color: '#00b860' },
    { id: crypto.randomUUID(), label: 'Sound 2', emoji: '🎵', src: '', color: '#3b82f6' },
    { id: crypto.randomUUID(), label: 'Sound 3', emoji: '💥', src: '', color: '#f59e0b' },
    { id: crypto.randomUUID(), label: 'Sound 4', emoji: '🎤', src: '', color: '#ec4899' },
  ]
}

/* ── Edit popup ── */
function EditPopup({
  keyItem, anchorRef, onSave, onClose,
}: {
  keyItem: SoundKey
  anchorRef: React.RefObject<HTMLDivElement | null>
  onSave: (patch: Partial<SoundKey>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ label: keyItem.label, emoji: keyItem.emoji, src: keyItem.src, color: keyItem.color || COLORS[0] })
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const popH = 210
    if (spaceBelow >= popH + 8) {
      setPos({ top: r.bottom + 6, left: r.left })
    } else {
      setPos({ bottom: window.innerHeight - r.top + 6, left: r.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div
      ref={popRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9999, width: 240,
        ...pos,
        borderRadius: 'var(--radius-sm)', padding: 12,
        background: 'var(--bg-popup)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={form.emoji}
          onChange={e => setForm(f => ({ ...f, emoji: e.target.value.slice(-2) || e.target.value }))}
          placeholder="🔊"
          maxLength={2}
          style={{ ...inp, width: 42, textAlign: 'center', fontSize: 'var(--fs-3xl)' }}
        />
        <input
          value={form.label}
          onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          placeholder="Label"
          style={{ ...inp, flex: 1 }}
          autoFocus
        />
      </div>
      <input
        value={form.src}
        onChange={e => setForm(f => ({ ...f, src: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') onSave(form); if (e.key === 'Escape') onClose() }}
        placeholder="URL or file path (.mp3, .wav…)"
        style={inp}
      />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {COLORS.map(c => (
          <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
            width: 18, height: 18, borderRadius: 4, background: c, cursor: 'pointer',
            outline: form.color === c ? '2px solid #fff' : '2px solid transparent', outlineOffset: 1,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSave(form)} style={{
          flex: 1, padding: '7px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: 'linear-gradient(180deg,#e5e7eb,#9ca3af)', color: '#000',
          fontWeight: 800, fontSize: 'var(--fs-md)', letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>Save</button>
        <button onClick={onClose} style={{
          padding: '7px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)',
          fontWeight: 700, fontSize: 'var(--fs-md)',
        }}>✕</button>
      </div>
    </div>
  )
}

/* ── Mixes menu ── */
function MixesMenu({
  mixes, anchorRef, hasActiveMix, onSave, onLoad, onDelete, onExport, onImport, onClose,
}: {
  mixes: SbMix[]
  anchorRef: React.RefObject<HTMLButtonElement | null>
  hasActiveMix: boolean
  onSave: (name: string) => void
  onLoad: (mix: SbMix) => void
  onDelete: (id: string) => void
  onExport: () => void
  onImport: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const popH = 260
    if (spaceBelow >= popH + 8) {
      setPos({ top: r.bottom + 4, left: r.left })
    } else {
      setPos({ bottom: window.innerHeight - r.top + 4, left: r.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div
      ref={popRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 9999, width: 220,
        ...pos,
        borderRadius: 'var(--radius-sm)', padding: 10,
        background: 'var(--bg-popup)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {/* Save current */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); setName('') } }}
          placeholder="Mix name…"
          autoFocus
          style={{ ...inp, flex: 1 }}
        />
        <button
          onClick={() => { if (name.trim()) { onSave(name.trim()); setName('') } }}
          style={{
            padding: '0 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: 'linear-gradient(180deg,#e5e7eb,#9ca3af)', color: '#000',
            fontWeight: 800, fontSize: 'var(--fs-md)',
          }}
        >+</button>
      </div>

      {/* Saved mixes list */}
      {mixes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
          {mixes.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', borderRadius: 7,
              background: pendingId === m.id ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
              transition: 'background 0.15s',
            }}>
              {pendingId === m.id ? (
                /* confirm row */
                <>
                  <span style={{ flex: 1, fontSize: 'var(--fs-base)', fontWeight: 700, color: 'rgba(255,180,100,0.9)' }}>
                    Replace current mix?
                  </span>
                  <button
                    onClick={() => { onLoad(m); onClose() }}
                    style={{
                      padding: '3px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: '#ef4444', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 800,
                    }}
                  >Yes</button>
                  <button
                    onClick={() => setPendingId(null)}
                    style={{
                      padding: '3px 6px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
                      fontSize: 'var(--fs-base)', fontWeight: 700,
                    }}
                  >No</button>
                </>
              ) : (
                /* normal row */
                <>
                  <button
                    onClick={() => hasActiveMix ? setPendingId(m.id) : (onLoad(m), onClose())}
                    style={{
                      flex: 1, textAlign: 'left', border: 'none', background: 'none',
                      color: '#fff', fontSize: 'var(--fs-md)', fontWeight: 700, cursor: 'pointer',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    title={`Load "${m.name}"`}
                  >▶ {m.name}</button>
                  <button
                    onClick={() => onDelete(m.id)}
                    style={{
                      border: 'none', background: 'none', color: 'rgba(239,68,68,0.6)',
                      fontSize: 'var(--fs-base)', fontWeight: 900, cursor: 'pointer', flexShrink: 0, padding: 2,
                    }}
                    title="Delete mix"
                  >✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0 -2px' }} />

      {/* Export / Import */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onExport} style={{ ...mixActionBtn }}>Export JSON</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { onImport(); onClose() }}
          style={{ ...mixActionBtn }}
        >Import JSON</button>
      </div>
    </div>
  )
}

const mixActionBtn: React.CSSProperties = {
  flex: 1, padding: '6px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
  fontWeight: 700, fontSize: 'var(--fs-base)', letterSpacing: '0.05em',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.8)',
  background: '#0b0c0e', color: '#fff', fontSize: 'var(--fs-lg)', outline: 'none',
  boxShadow: 'inset 0 6px 15px rgba(0,0,0,.8)',
}

type KeyState = { volume: number; currentTime: number; duration: number }

/* ── Main component ── */
export function SoundboardPanel({ onClose, onChannelChange }: {
  onClose: () => void
  onChannelChange?: (channels: SbChannel[]) => void
}) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('soundboard', { x: 460, y: 520, w: 480, h: 260 })

  const [keys, setKeys] = useState<SoundKey[]>(loadKeys)
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set())
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [keyStates, setKeyStates] = useState<Map<string, KeyState>>(new Map())
  const [editKey, setEditKey] = useState<SoundKey | null>(null)
  const [mixes, setMixes] = useState<SbMix[]>(loadMixes)
  const [showMixes, setShowMixes] = useState(false)

  const audioMap = useRef<Map<string, HTMLAudioElement>>(new Map())
  const innerRef = useRef<HTMLDivElement>(null)
  const keyRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const mixBtnRef = useRef<HTMLButtonElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem('soundboard-keys', JSON.stringify(keys)) }, [keys])
  useEffect(() => { saveMixes(mixes) }, [mixes])
  useEffect(() => () => { audioMap.current.forEach(a => { a.pause(); a.src = '' }) }, [])

  useEffect(() => {
    captureRegistry.register({ id: 'soundboard', label: 'Soundboard', getStream: getSbCaptureStream })
    return () => captureRegistry.unregister('soundboard')
  }, [])

  const keysRef = useRef(keys)
  // eslint-disable-next-line react-hooks/refs
  keysRef.current = keys
  useEffect(() => {
    if (!onChannelChange) return
    const playing = keysRef.current.filter(k => playingIds.has(k.id))
    const channels: SbChannel[] = playing.map(k => {
      const st = keyStates.get(k.id) ?? { volume: 80, currentTime: 0, duration: 0 }
      return {
        id: k.id, label: k.label, emoji: k.emoji,
        playing: true, ...st,
        setVolume: (v: number) => {
          setKeyStates(prev => { const m = new Map(prev); m.set(k.id, { ...(m.get(k.id) ?? { volume: 80, currentTime: 0, duration: 0 }), volume: v }); return m })
          const a = audioMap.current.get(k.id); if (a) a.volume = v / 100
        },
        seek: (t: number) => {
          const a = audioMap.current.get(k.id); if (a) { a.currentTime = t; setKeyStates(prev => { const m = new Map(prev); m.set(k.id, { ...(m.get(k.id) ?? { volume: 80, currentTime: 0, duration: 0 }), currentTime: t }); return m }) }
        },
        stop: () => stopKey(k.id),
      }
    })
    onChannelChange(channels)
  }, [playingIds, keyStates])

  const setPlaying = (id: string, on: boolean) =>
    setPlayingIds(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  const setPaused = (id: string, on: boolean) =>
    setPausedIds(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  const pauseKey = useCallback((id: string) => {
    const a = audioMap.current.get(id)
    if (a) a.pause()
    setPlaying(id, false)
    setPaused(id, true)
  }, [])

  const resumeKey = useCallback((id: string) => {
    const a = audioMap.current.get(id); if (!a) return
    setLoading(id, true)
    a.play()
      .then(() => { setLoading(id, false); setPlaying(id, true); setPaused(id, false) })
      .catch(() => setLoading(id, false))
  }, [])

  const stopKey = useCallback((id: string) => {
    const a = audioMap.current.get(id)
    if (a) { a.pause(); a.currentTime = 0 }
    setPlaying(id, false)
    setPaused(id, false)
  }, [])

  const stopAll = useCallback(() => {
    audioMap.current.forEach(a => { a.pause(); a.currentTime = 0 })
    setPlayingIds(new Set())
    setPausedIds(new Set())
    setLoadingIds(new Set())
  }, [])

  const setLoading = (id: string, on: boolean) =>
    setLoadingIds(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  const playKey = useCallback(async (key: SoundKey, volume?: number) => {
    if (!key.src) return
    let src: string
    if (isYouTube(key.src)) {
      src = `${API}/api/yt-stream?url=${encodeURIComponent(key.src)}`
    } else {
      src = audioSrc(key.src)
    }
    const vol = volume ?? (keyStates.get(key.id)?.volume ?? 80)
    const initSt = { volume: vol, currentTime: 0, duration: 0 }
    let a = audioMap.current.get(key.id)
    if (!a) {
      a = new Audio(src)
      a.crossOrigin = 'anonymous'
      a.loop = true
      a.volume = initSt.volume / 100
      let lastTu = 0
      a.addEventListener('timeupdate', () => {
        const now = performance.now()
        if (now - lastTu < 200) return
        lastTu = now
        setKeyStates(prev => { const m = new Map(prev); const s = m.get(key.id) ?? initSt; m.set(key.id, { ...s, currentTime: a!.currentTime }); return m })
      })
      a.addEventListener('loadedmetadata', () => setKeyStates(prev => { const m = new Map(prev); const s = m.get(key.id) ?? initSt; m.set(key.id, { ...s, duration: a!.duration }); return m }))
      a.addEventListener('waiting', () => setLoading(key.id, true))
      a.addEventListener('stalled', () => setLoading(key.id, true))
      a.addEventListener('canplay', () => setLoading(key.id, false))
      a.onended = () => setPlaying(key.id, false)
      audioMap.current.set(key.id, a)
      connectToCapture(a)
    } else {
      a.src = src
      a.volume = vol / 100
    }
    a.currentTime = 0
    setLoading(key.id, true)
    a.play()
      .then(() => { setLoading(key.id, false); setPlaying(key.id, true); setPaused(key.id, false) })
      .catch(() => { setLoading(key.id, false) })
  }, [keyStates])

  const handleClick = (key: SoundKey) => {
    if (playingIds.has(key.id)) pauseKey(key.id)
    else if (pausedIds.has(key.id)) resumeKey(key.id)
    else playKey(key)
  }

  const commitEdit = (id: string, patch: Partial<SoundKey>) => {
    setKeys(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k))
    const a = audioMap.current.get(id)
    if (a && patch.src) {
      a.pause(); a.src = audioSrc(patch.src); a.currentTime = 0
      setPlaying(id, false); setPaused(id, false)
    }
    setEditKey(null)
  }

  const removeKey = (id: string) => {
    stopKey(id)
    const a = audioMap.current.get(id)
    if (a) { disconnectFromCapture(a); a.src = '' }
    audioMap.current.delete(id)
    setKeys(prev => prev.filter(k => k.id !== id))
    if (editKey?.id === id) setEditKey(null)
  }

  /* ── Mix actions ── */
  const saveMix = (name: string) => {
    const volumes: Record<string, number> = {}
    keys.forEach(k => { volumes[k.id] = keyStates.get(k.id)?.volume ?? 80 })
    const mix: SbMix = { id: crypto.randomUUID(), name, keys: [...keys], volumes, createdAt: Date.now() }
    setMixes(prev => [...prev, mix])
  }

  const loadMix = useCallback((mix: SbMix) => {
    stopAll()
    // remap keys with fresh IDs to avoid collisions
    const remapped = mix.keys.map(k => ({ ...k, id: crypto.randomUUID() }))
    const volMap = new Map<string, number>()
    mix.keys.forEach((orig, i) => {
      volMap.set(remapped[i].id, mix.volumes[orig.id] ?? 80)
    })
    // clear old audio (disconnect sources to free MediaElementAudioSourceNode)
    audioMap.current.forEach(a => { a.pause(); disconnectFromCapture(a); a.src = '' })
    audioMap.current.clear()
    keyRefs.current.clear()

    setKeys(remapped)
    const newStates = new Map<string, KeyState>()
    remapped.forEach(k => { newStates.set(k.id, { volume: volMap.get(k.id) ?? 80, currentTime: 0, duration: 0 }) })
    setKeyStates(newStates)

    // auto-play all keys that have a src
    setTimeout(() => {
      remapped.forEach(k => {
        if (k.src) playKey(k, volMap.get(k.id) ?? 80)
      })
    }, 50)
  }, [stopAll, playKey])

  const deleteMix = (id: string) => setMixes(prev => prev.filter(m => m.id !== id))

  const exportMixes = () => {
    const volumes: Record<string, number> = {}
    keys.forEach(k => { volumes[k.id] = keyStates.get(k.id)?.volume ?? 80 })
    const currentMix: SbMix = {
      id: crypto.randomUUID(),
      name: 'Exported Mix',
      keys: [...keys],
      volumes,
      createdAt: Date.now(),
    }
    const payload = mixes.length > 0 ? [...mixes, currentMix] : [currentMix]
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'soundboard-mixes.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importMixes = () => importInputRef.current?.click()

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string) as SbMix[]
        if (Array.isArray(data)) setMixes(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const fresh = data.filter(m => !existingIds.has(m.id))
          return [...prev, ...fresh]
        })
      } catch{ /* noop */ }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <CaptureIdContext.Provider value="soundboard">
      <Rnd
        default={{ x: geo.x, y: geo.y, width: geo.w, height: 'auto' }}
        minWidth={KEY_SIZE + PAD * 2}
        enableResizing={{ right: true, left: true }}
        bounds={undefined}
        dragHandleClassName="sb-drag"
        className={`panel-drag${isDragging('soundboard') ? ' dragging' : ''}`}
        scale={scale}
        onDragStart={() => bringToFront('soundboard')}
        onDragStop={(_e, d) => { saveGeo('soundboard', { x: d.x, y: d.y }); endDrag('soundboard') }}
        onResizeStop={(_e, _d, ref, _delta, pos) => {
          saveGeo('soundboard', { w: ref.offsetWidth, x: pos.x, y: pos.y })
        }}
        style={{ zIndex: zOf('soundboard', 12) }}
      >
        <div
          ref={innerRef}
          style={{
            width: '100%', borderRadius: 'var(--radius-panel)',
            background: 'var(--bg-chassis)', boxShadow: 'var(--shadow-chassis)',
            padding: PAD, userSelect: 'none',
          }}
        >
          {/* Header */}
          <PanelHeader title="Soundboard" onClose={onClose} className="sb-drag">
            {/* Mixes button */}
            <button
              ref={mixBtnRef}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setShowMixes(v => !v)}
              className="sb-header-mixes"
              title="Mixes"
              style={{
                height: 22, padding: '0 8px', borderRadius: 'var(--radius-xs)', border: 'none', cursor: 'pointer',
                background: showMixes ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                color: showMixes ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                fontSize: 'var(--fs-base)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 4,
                flexShrink: 0, transition: 'background 0.15s, color 0.15s',
              }}
            >
              {mixes.length > 0 && (
                <span style={{
                  background: '#3b82f6', color: '#fff', borderRadius: 99,
                  fontSize: 'var(--fs-sm)', fontWeight: 900, minWidth: 14, height: 14,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>{mixes.length}</span>
              )}
              Mixes
            </button>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setKeys(prev => [...prev, makeKey()])}
              className="sb-header-add"
              title="Add sound key"
              style={{
                width: 22, height: 22, borderRadius: 'var(--radius-xs)', border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)',
                fontSize: 'var(--fs-2xl)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.15s',
              }}
            >+</button>
          </PanelHeader>

          {/* Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${KEY_SIZE}px, 1fr))`,
            gap: GAP,
          }}>
            {keys.map(key => {
              const isPlaying = playingIds.has(key.id)
              const isPaused = pausedIds.has(key.id)
              const isLoading = loadingIds.has(key.id)
              const isActive = isPlaying || isPaused || isLoading
              const accent = key.color || '#00b860'

              return (
                <KeyTile
                  key={key.id}
                  ref={el => { if (el) keyRefs.current.set(key.id, el as HTMLDivElement); else keyRefs.current.delete(key.id) }}
                  active={isActive}
                  playing={isPlaying}
                  loading={isLoading}
                  accent={accent}
                  dim={!key.src}
                  className="sb-key-wrap"
                  onClick={() => handleClick(key)}
                  onContextMenu={e => { e.preventDefault(); setEditKey(key) }}
                  style={{ width: '100%', height: KEY_SIZE, cursor: key.src ? 'pointer' : 'default' }}
                >
                  {isPaused && (
                    <span style={{
                      position: 'absolute', top: 5, left: 6, zIndex: 2,
                      fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.1em',
                      color: accent, opacity: 0.85, fontFamily: 'monospace',
                    }}>▌▌</span>
                  )}
                  <span style={{ fontSize: 'var(--fs-6xl)', lineHeight: 1 }}>{key.emoji}</span>
                  <span style={{
                    fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text-70)',
                    textAlign: 'center', padding: '0 5px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '92%',
                  }}>{key.label}</span>

                  {key.src && (
                    <div
                      className="sb-vol-bar"
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => {
                        e.stopPropagation()
                        const r = e.currentTarget.getBoundingClientRect()
                        const v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
                        setKeyStates(prev => { const m = new Map(prev); m.set(key.id, { ...(m.get(key.id) ?? { volume: 80, currentTime: 0, duration: 0 }), volume: v }); return m })
                        const a = audioMap.current.get(key.id); if (a) a.volume = v / 100
                      }}
                      onMouseMove={e => {
                        if (e.buttons !== 1) return
                        const r = e.currentTarget.getBoundingClientRect()
                        const v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
                        setKeyStates(prev => { const m = new Map(prev); m.set(key.id, { ...(m.get(key.id) ?? { volume: 80, currentTime: 0, duration: 0 }), volume: v }); return m })
                        const a = audioMap.current.get(key.id); if (a) a.volume = v / 100
                      }}
                      style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: 18, cursor: 'ew-resize',
                        display: 'flex', alignItems: 'flex-end',
                        padding: '0 8px 5px',
                        opacity: 0, transition: 'opacity 0.15s',
                      }}
                    >
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${keyStates.get(key.id)?.volume ?? 80}%`,
                          background: accent,
                          transition: 'width 0.05s',
                        }} />
                      </div>
                    </div>
                  )}

                  <button
                    className="sb-key-remove"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeKey(key.id) }}
                    style={{
                      position: 'absolute', top: 5, right: 5, zIndex: 2,
                      width: 16, height: 16, border: 'none', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.7)', color: '#fff',
                      fontSize: 'var(--fs-sm)', fontWeight: 900, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                  >✕</button>
                </KeyTile>
              )
            })}
          </div>
        </div>
      </Rnd>

      {/* Edit popup */}
      {editKey && (
        <EditPopup
          keyItem={editKey}
          anchorRef={{ current: keyRefs.current.get(editKey.id) ?? null } as React.RefObject<HTMLDivElement | null>}
          onSave={patch => commitEdit(editKey.id, patch)}
          onClose={() => setEditKey(null)}
        />
      )}

      {/* Mixes popup */}
      {showMixes && (
        <MixesMenu
          mixes={mixes}
          anchorRef={mixBtnRef}
          hasActiveMix={keys.some(k => k.src)}
          onSave={saveMix}
          onLoad={loadMix}
          onDelete={deleteMix}
          onExport={exportMixes}
          onImport={importMixes}
          onClose={() => setShowMixes(false)}
        />
      )}

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      <style>{`
        .sb-drag:active { cursor:grabbing !important; }
        .sb-key-wrap:hover .sb-key-remove { opacity:1 !important; }
        .sb-key-wrap:hover .sb-vol-bar { opacity:1 !important; }
        .sb-header-add:hover { background:rgba(255,255,255,0.12) !important; color:rgba(255,255,255,0.7) !important; }
        .sb-header-mixes:hover { background:rgba(255,255,255,0.12) !important; color:rgba(255,255,255,0.7) !important; }
      `}</style>
    </CaptureIdContext.Provider>
  )
}
