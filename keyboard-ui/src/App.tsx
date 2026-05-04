import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Rnd } from 'react-rnd'
import { AppKnob } from './components/AppKnob'
import { AudioMixer, type DeckPublicState } from './components/AudioMixer'
import { SoundboardPanel, type SbChannel } from './components/SoundboardPanel'
import { OBSControlPanel } from './components/OBSControlPanel'
import { BriefingPanel } from './components/BriefingPanel'
import { YouTubeChatPanel } from './components/YouTubeChatPanel'
import { TimerPanel } from './components/TimerPanel'
import { DronePanel } from './components/DronePanel'
import { PaulstretchPanel } from './components/PaulstretchPanel'
import { SynthPanel } from './components/SynthPanel'
import { ExporterPanel } from './components/ExporterPanel'
import { ConverterPanel } from './components/ConverterPanel'
import { LoopLabPanel } from './components/LoopLabPanel'
import { SessionPanel } from './components/SessionPanel'
import { ConfigPanel } from './components/ConfigPanel'
import { CommandPalette, type PanelDef, type PanelId } from './components/CommandPalette'
import { ShieldAlert } from './components/ShieldAlert'
import { API } from './lib/api'
import { loadGeo, saveGeo } from './lib/geo'
import { closeBtnStyle } from './lib/styles'
import { PanelProvider, usePanelCtx } from './lib/panel-context'
import { KeyTile } from './lib/KeyTile'
import { PresetFloating } from './components/PresetFloating'
import { applyPositions, type Preset } from './lib/presets'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import './index.css'

const KEYS = [
  'key_f13','key_f14','key_f15',
  'key_f16','key_f17','key_f18',
  'key_f19','key_f20','key_f21',
  'key_f22','key_f23','key_f24',
]

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ICON: Record<string, string> = {
  play_audio: '🔈',
  open_app:   '🚀',
  run_script: '📜',
}

type Action = { type?: string; path?: string; args?: string; label?: string }
type Config = { buttons?: Record<string, Action> }

export default function App() {
  return <PanelProvider><AppInner /></PanelProvider>
}

function AppInner() {
  const { scale, setScale, zOf, bringToFront, endDrag, isDragging } = usePanelCtx()
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [config, setConfig] = useState<Config>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [online, setOnline] = useState(false)
  const [showKeys, setShowKeys] = useState(() => localStorage.getItem('panel-keys') !== 'false')
  const [showMixer, setShowMixer] = useState(() => localStorage.getItem('panel-mixer') !== 'false')
  const [showSoundboard, setShowSoundboard] = useState(() => localStorage.getItem('panel-soundboard') !== 'false')
  const [showOBS, setShowOBS] = useState(() => localStorage.getItem('panel-obs') === 'true')
  const [showBriefing, setShowBriefing] = useState(() => localStorage.getItem('panel-briefing') === 'true')
  const [showYTChat, setShowYTChat] = useState(() => localStorage.getItem('panel-ytchat') === 'true')
  const [showTimer, setShowTimer] = useState(() => localStorage.getItem('panel-timer') === 'true')
  const [showDrone, setShowDrone] = useState(() => localStorage.getItem('panel-drone') === 'true')
  const [showPaul, setShowPaul] = useState(() => localStorage.getItem('panel-paul') === 'true')
  const [synthIds, setSynthIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('panel-synth-ids')
    if (saved) try { const arr = JSON.parse(saved); if (Array.isArray(arr) && arr.length) return arr } catch {}
    return localStorage.getItem('panel-synth') === 'true' ? ['synth-0'] : []
  })
  const showSynth = synthIds.length > 0
  const setShowSynth = (v: boolean | ((prev: boolean) => boolean)) => {
    setSynthIds(prev => {
      const wasOpen = prev.length > 0
      const val = typeof v === 'function' ? v(wasOpen) : v
      if (!val) return []
      // Toggle on or add another instance
      return [...prev, `synth-${Date.now()}`]
    })
  }
  const [showExporter, setShowExporter] = useState(() => localStorage.getItem('panel-exporter') === 'true')
  const [showConverter, setShowConverter] = useState(() => localStorage.getItem('panel-converter') === 'true')
  const [showLoopLab, setShowLoopLab] = useState(() => localStorage.getItem('panel-looplab') === 'true')
  const [showSession, setShowSession] = useState(() => localStorage.getItem('panel-session') === 'true')
  const deckTogglersRef = useRef<Record<string, () => void>>({})
  const deckSyncersRef = useRef<Record<string, (forcePlaying?: boolean) => void>>({})
  const deckVolumersRef = useRef<Record<string, (v: number) => void>>({})
  const [playingKeys, setPlayingKeys] = useState<Set<string>>(new Set())
  const [deckStates, setDeckStates] = useState<Record<string, DeckPublicState>>({})

  // Coalesce updates de timeupdate em buckets de animation-frame —
  // múltiplos decks tocando juntos = 1 setState por frame, não N.
  const pendingDeckStates = useRef<Record<string, DeckPublicState>>({})
  const deckFlushScheduled = useRef(false)
  const handleDeckStateChange = useCallback((keyId: string, s: DeckPublicState) => {
    pendingDeckStates.current[keyId] = s
    if (deckFlushScheduled.current) return
    deckFlushScheduled.current = true
    requestAnimationFrame(() => {
      deckFlushScheduled.current = false
      const patch = pendingDeckStates.current
      pendingDeckStates.current = {}
      setDeckStates(prev => ({ ...prev, ...patch }))
    })
  }, [])
  const [sbChannels, setSbChannels] = useState<SbChannel[]>([])
  const [showPalette, setShowPalette] = useState(false)
  const [sidebarConfig, setSidebarConfig] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-config') || '{}') } catch { return {} }
  })
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null)
  const [ctxSrc, setCtxSrc] = useState('')
  const [ctxSaving, setCtxSaving] = useState(false)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/api/config`)
      .then(r => r.json())
      .then(d => { setConfig(d); setOnline(true) })
      .catch(() => setOnline(false))
  }, [])

  // Persist visibilidade — 1 useEffect por chave evita 11 setItem por toggle.
  useEffect(() => { localStorage.setItem('panel-keys', String(showKeys)) }, [showKeys])
  useEffect(() => { localStorage.setItem('panel-mixer', String(showMixer)) }, [showMixer])
  useEffect(() => { localStorage.setItem('panel-soundboard', String(showSoundboard)) }, [showSoundboard])
  useEffect(() => { localStorage.setItem('panel-obs', String(showOBS)) }, [showOBS])
  useEffect(() => { localStorage.setItem('panel-briefing', String(showBriefing)) }, [showBriefing])
  useEffect(() => { localStorage.setItem('panel-ytchat', String(showYTChat)) }, [showYTChat])
  useEffect(() => { localStorage.setItem('panel-timer', String(showTimer)) }, [showTimer])
  useEffect(() => { localStorage.setItem('panel-drone', String(showDrone)) }, [showDrone])
  useEffect(() => { localStorage.setItem('panel-paul', String(showPaul)) }, [showPaul])
  useEffect(() => { localStorage.setItem('panel-synth', String(showSynth)); localStorage.setItem('panel-synth-ids', JSON.stringify(synthIds)) }, [synthIds])
  useEffect(() => { localStorage.setItem('panel-exporter', String(showExporter)) }, [showExporter])
  useEffect(() => { localStorage.setItem('panel-converter', String(showConverter)) }, [showConverter])
  useEffect(() => { localStorage.setItem('panel-looplab', String(showLoopLab)) }, [showLoopLab])
  useEffect(() => { localStorage.setItem('panel-session', String(showSession)) }, [showSession])

  /* ── Physical keyboard bridge: long-poll Flask, pausa em background ── */
  useEffect(() => {
    let active = true
    let wakeup: (() => void) | null = null
    function waitVisible(): Promise<void> {
      if (!document.hidden) return Promise.resolve()
      return new Promise(res => { wakeup = res })
    }
    function onVis() {
      if (!document.hidden && wakeup) { const fn = wakeup; wakeup = null; fn() }
    }
    document.addEventListener('visibilitychange', onVis)

    async function poll() {
      let backoff = 500
      while (active) {
        await waitVisible()
        if (!active) break
        try {
          const r = await fetch(`${API}/api/key-event/poll?timeout=2`, { signal: AbortSignal.timeout(3500) })
          const ev = await r.json()
          backoff = 500
          if (ev.key) {
            const syncer = deckSyncersRef.current[ev.key]
            const toggler = deckTogglersRef.current[ev.key]
            ;(syncer ?? toggler)?.()
          }
        } catch {
          if (active) await new Promise(res => setTimeout(res, backoff))
          backoff = Math.min(backoff * 2, 10_000)
          continue
        }
        if (active) await new Promise(res => setTimeout(res, 50))
      }
    }
    poll()
    return () => { active = false; document.removeEventListener('visibilitychange', onVis); wakeup?.() }
  }, [])

  /* ── Ctrl+K palette ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(v => !v) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function isSidebarVisible(id: string, defaultVal: boolean) {
    return sidebarConfig[id] !== undefined ? sidebarConfig[id] : defaultVal
  }

  function handleChangeSidebar(id: PanelId, val: boolean) {
    const next = { ...sidebarConfig, [id]: val }
    setSidebarConfig(next)
    localStorage.setItem('sidebar-config', JSON.stringify(next))
  }

  function handleTogglePanel(id: PanelId) {
    const setters: Record<PanelId, React.Dispatch<React.SetStateAction<boolean>>> = {
      keys: setShowKeys, mixer: setShowMixer, soundboard: setShowSoundboard,
      obs: setShowOBS, briefing: setShowBriefing, ytchat: setShowYTChat,
      timer: setShowTimer, drone: setShowDrone, paul: setShowPaul, synth: setShowSynth,
      exporter: setShowExporter, converter: setShowConverter, looplab: setShowLoopLab, session: setShowSession,
    }
    setters[id]?.(v => !v)
  }

  /* close ctx menu on outside click */
  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  async function saveCtxSrc() {
    if (!ctxMenu) return
    setCtxSaving(true)
    const key = ctxMenu.key
    const existing = config.buttons?.[key] || {}
    const next = { ...config, buttons: { ...config.buttons, [key]: { ...existing, path: ctxSrc } } }
    try {
      await fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      setConfig(next)
    } catch { /* ignore save errors */ }
    setCtxSaving(false)
    setCtxMenu(null)
  }

  async function handleDrop(key: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
      const res = await r.json()
      if (res.status === 'success') {
        let type = 'open_app'
        if (file.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) type = 'play_audio'
        if (file.name.endsWith('.ps1')) type = 'run_script'
        const next = {
          ...config,
          buttons: { ...config.buttons, [key]: { type, path: res.path, args: '', label: file.name } },
        }
        await fetch(`${API}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        })
        setConfig(next)
      }
    } catch (e) { console.error('drop failed', e) }
  }

  function loadPreset(preset: Preset) {
    const v = preset.visibility
    setShowKeys(v.keys)
    setShowMixer(v.mixer)
    setShowSoundboard(v.soundboard)
    setShowOBS(v.obs)
    setShowBriefing(v.briefing)
    setShowYTChat(v.ytchat)
    setShowTimer(v.timer)
    setShowDrone(v.drone)
    setShowPaul(v.paul)
    setShowSynth(v.synth)
    setShowExporter(v.exporter ?? false)
    setShowConverter(v.converter ?? false)
    setShowLoopLab(v.looplab ?? false)
    setShowSession(v.session ?? false)
    applyPositions(preset.positions)
    if (preset.scale && transformRef.current) {
      transformRef.current.setTransform(0, 0, preset.scale)
      setScale(preset.scale)
    }
  }

  const kbGeo  = loadGeo('keyboard',   { x: 20,  y: 20,  w: 420, h: 480 })
  const mxGeo  = loadGeo('mixer',      { x: 840, y: 20,  w: 320, h: 480 })

  const panelDefs: PanelDef[] = useMemo(() => [
    { id: 'keys',       label: 'Keyboard',       icon: '⌨️', sidebar: isSidebarVisible('keys', true),        visible: showKeys },
    { id: 'mixer',      label: 'Audio Mixer',    icon: '🎚️', sidebar: isSidebarVisible('mixer', true),       visible: showMixer },
    { id: 'soundboard', label: 'Soundboard',     icon: '🎹', sidebar: isSidebarVisible('soundboard', true),  visible: showSoundboard },
    { id: 'obs',        label: 'OBS Control',    icon: '🎬', sidebar: isSidebarVisible('obs', true),         visible: showOBS },
    { id: 'ytchat',     label: 'YouTube Chat',   icon: '💬', sidebar: isSidebarVisible('ytchat', true),      visible: showYTChat },
    { id: 'timer',      label: 'Timer',          icon: '⏱',  sidebar: isSidebarVisible('timer', true),       visible: showTimer },
    { id: 'briefing',   label: 'Briefing',       icon: '📋', sidebar: isSidebarVisible('briefing', false),   visible: showBriefing },
    { id: 'session',    label: 'Session',        icon: '📼', sidebar: isSidebarVisible('session', true),     visible: showSession },
    { id: 'drone',      label: 'Drone',          icon: '🌊', sidebar: isSidebarVisible('drone', false),      visible: showDrone },
    { id: 'paul',       label: 'Paulstretch',    icon: '∿',  sidebar: isSidebarVisible('paul', false),       visible: showPaul },
    { id: 'synth',      label: 'Synth',          icon: '🎛️', sidebar: isSidebarVisible('synth', true),       visible: showSynth },
    { id: 'looplab',    label: 'Loop Lab',       icon: '🔁', sidebar: isSidebarVisible('looplab', false),    visible: showLoopLab },
    { id: 'converter',  label: 'Converter',      icon: '⇄',  sidebar: isSidebarVisible('converter', false),  visible: showConverter },
    { id: 'exporter',   label: 'Exporter',       icon: '⏺',  sidebar: isSidebarVisible('exporter', false),   visible: showExporter },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [showKeys, showMixer, showSoundboard, showOBS, showBriefing, showYTChat, showTimer, showDrone, showPaul, showSynth, showExporter, showConverter, showLoopLab, showSession, sidebarConfig])

  /* ── Figma-like cursors ── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        setIsSpacePressed(true)
      }
    }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setIsSpacePressed(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  /* ── Figma-style wheel: scroll=pan Y, shift+scroll=pan X, ctrl+scroll=zoom ── */
  const canvasRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    const handleCanvasWheel = (e: WheelEvent) => {
      if (!transformRef.current) return
      const { setTransform, zoomIn, zoomOut, state } = transformRef.current

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (e.deltaY < 0) zoomIn(0.15)
        else zoomOut(0.15)
        return
      }

      e.preventDefault()
      const PAN_SPEED = 1.2
      let dx = 0
      let dy = 0

      if (e.shiftKey) {
        dx = -e.deltaY * PAN_SPEED
      } else {
        dx = -e.deltaX * PAN_SPEED
        dy = -e.deltaY * PAN_SPEED
      }

      setTransform(
        state.positionX + dx,
        state.positionY + dy,
        state.scale,
      )
    }

    el.addEventListener('wheel', handleCanvasWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleCanvasWheel)
  }, [])

  return (
    <div
      className="flex h-screen overflow-hidden font-['Outfit',sans-serif] text-[var(--text-pure)]"
      style={{ background: 'var(--bg-surface)', cursor: isSpacePressed ? 'grab' : 'default' }}
    >
      <ShieldAlert />
      {/* Background Glow */}
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{ background: 'radial-gradient(circle at 50% -20%, rgba(60,65,80,0.15) 0%, transparent 80%)' }}
      />

      {/* Sidebar */}
      <aside
        className="w-[72px] border-r border-white/5 flex flex-col items-center justify-center gap-2 shrink-0 sticky top-0 z-20 overflow-y-auto"
        style={{ background: 'linear-gradient(180deg,rgba(22,23,25,0.9) 0%,rgba(12,13,15,0.95) 100%)', backdropFilter: 'blur(20px)', height: '100vh' }}
      >
        {/* Ctrl+K button */}
        <button
          onClick={() => setShowPalette(v => !v)}
          title="Command Palette (Ctrl+K)"
          className={`sidebar-cmd${showPalette ? ' active' : ''}`}
        >⌘</button>

        <div className="w-8 h-px bg-white/[0.07]" />

        {/* Dynamic sidebar buttons — only panels with sidebar=true */}
        {panelDefs.filter(p => p.sidebar).map(p => (
          <NavBtn key={p.id} active={p.visible} onClick={() => handleTogglePanel(p.id)} title={p.label}>
            {p.icon}
          </NavBtn>
        ))}

        {/* Stop all audio — always visible */}
        <button
          onClick={async () => {
            await fetch(`${API}/api/audio/stop-all`, { method: 'POST' })
            Object.values(deckSyncersRef.current).forEach(fn => fn(false))
          }}
          title="Force Stop All (keyboard audio)"
          className="sidebar-stop"
        >■</button>

        {/* Online status */}
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: online ? 'var(--status-ok)' : 'var(--status-err)',
            boxShadow: online ? '0 0 8px rgba(0,184,96,0.5)' : '0 0 8px rgba(239,68,68,0.5)',
          }}
        />
      </aside>

      {/* Free-canvas */}
      <main ref={canvasRef} className="flex-1 relative z-10 overflow-hidden" style={{ minHeight: '100vh' }}>
        <TransformWrapper
          ref={transformRef}
          initialScale={scale}
          minScale={0.05}
          maxScale={5}
          smooth={false}
          centerOnInit={false}
          limitToBounds={false}
          disabled={showPalette}
          onTransform={(ref) => setScale(ref.state.scale)}
          doubleClick={{ disabled: true }}
          panning={{
            activationKeys: [' '],
            disabled: false,
            allowLeftClickPan: true,
            velocityDisabled: false
          }}
          wheel={{ disabled: true }}
          pinch={{ disabled: false }}
        >
          {({ zoomIn, zoomOut, resetTransform, state }) => (
            <>
              {/* Background instructions hint — fades out after 3s */}
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-0 pointer-events-none flex gap-8 text-[10px] font-black uppercase tracking-[0.3em] canvas-hint">
                <span>[Scroll] Pan</span>
                <span>[Shift+Scroll] Pan H</span>
                <span>[Ctrl+Scroll] Zoom</span>
                <span>[Space] Drag</span>
              </div>

              {/* Floating UI controls for Zoom/Pan */}
              <div className="fixed bottom-6 left-[96px] z-[100] flex items-center gap-3 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl">
                <button onClick={() => zoomOut(0.15)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all text-lg">−</button>
                <div 
                  className="px-3 py-1 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors flex flex-col items-center"
                  onClick={() => resetTransform()}
                  title="Click to reset view"
                >
                  <span className="text-[8px] font-black tracking-[0.2em] text-white/30 uppercase mb-0.5">Canvas</span>
                  <div className="text-xs font-bold text-white/80 leading-none">{Math.round(state.scale * 100)}%</div>
                </div>
                <button onClick={() => zoomIn(0.15)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all text-lg">＋</button>
              </div>

              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100vh' }}
                contentStyle={{ width: '8000px', height: '6000px' }}
              >
                <div 
                  className="canvas-grid"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    position: 'relative',
                  }}
                >

        {/* Keyboard panel */}
        {showKeys && (
          <Rnd
            default={{ x: kbGeo.x, y: kbGeo.y, width: 'auto', height: 'auto' }}
            enableResizing={false}
            bounds={undefined}
            dragHandleClassName="drag-handle"
            className={`panel-drag${isDragging('keyboard') ? ' dragging' : ''}`}
            scale={state.scale}
            onDragStart={() => bringToFront('keyboard')}
            onDragStop={(_e, d) => { saveGeo('keyboard', { x: d.x, y: d.y }); endDrag('keyboard') }}
            style={{ zIndex: zOf('keyboard', 10) }}
          >
            <div
              className="drag-handle"
              style={{
                borderRadius: 'var(--radius-panel)',
                background: 'var(--bg-chassis)',
                boxShadow: 'var(--shadow-chassis)',
                padding: '24px',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {/* Knobs row */}
              <div className="flex items-center justify-between mb-6 px-2">
                <AppKnob label="MASTER GAIN" size={96} />
                <div className="flex flex-col gap-2 pt-2 items-center">
                  <div className="w-2 h-2 rounded-full bg-[var(--status-err)] border border-white/5" />
                  <div className="w-2 h-2 rounded-full bg-[#1a1c1e]" />
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setShowKeys(false)}
                    style={closeBtnStyle}
                  >×</button>
                </div>
                <AppKnob label="SYSTEM SCRL" size={96} />
              </div>

              {/* 3×4 key grid */}
              <div className="grid grid-cols-3" style={{ gap: 'var(--gap-standard)' }}>
                {KEYS.map(key => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const action = config.buttons?.[key] || {} as any
                  const name = key.replace('key_', '').toUpperCase()
                  const isAudio = action.type === 'play_audio'
                  const isPlaying = playingKeys.has(key)
                  const emoji = action.emoji || ''
                  const displayLabel = action.label || (action.path ? action.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') : '') || 'Vazio'
                  const showEmojiOnly = emoji && !action.label && !action.path
                  const showEmoji = !!emoji
                  const isActive = selected === key
                  const isDrag = dragOver === key

                  return (
                    <KeyTile
                      key={key}
                      selected={isActive}
                      playing={isPlaying}
                      dragging={isDrag}
                      pressDepth={6}
                      ledPosition="tr"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => setSelected(key)}
                      onContextMenu={e => {
                        e.preventDefault()
                        setCtxMenu({ key, x: e.clientX, y: e.clientY })
                        setCtxSrc(config.buttons?.[key]?.path || '')
                      }}
                      className="aspect-square cursor-pointer select-none group"
                      style={{ width: 'var(--key-size)', padding: 8 }}
                      // @ts-expect-error drag handlers
                      onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(key) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault()
                        setDragOver(null)
                        const f = e.dataTransfer.files[0]
                        if (f) handleDrop(key, f)
                      }}
                    >
                      {isAudio && (() => {
                        const ds = deckStates[key]
                        return (
                          <div
                            className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150 z-10"
                            style={{ borderRadius: 'var(--radius-key)', background: 'rgba(0,0,0,0.62)', gap: 4, padding: '8px 6px' }}
                          >
                            <button
                              onClick={e => { e.stopPropagation(); deckTogglersRef.current[key]?.() }}
                              style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isPlaying ? 'var(--status-ok)' : 'var(--bg-btn-silver)', color: isPlaying ? '#000' : 'rgba(255,255,255,0.85)', fontSize: 'var(--fs-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >{isPlaying ? '⏸' : '▶'}</button>
                            {ds && ds.duration > 0 && (
                              <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>
                                {fmtTime(ds.currentTime)} / {fmtTime(ds.duration)}
                              </span>
                            )}
                            {ds && (
                              <div
                                onClick={e => e.stopPropagation()}
                                onMouseDown={e => {
                                  e.stopPropagation()
                                  const r = e.currentTarget.getBoundingClientRect()
                                  const v = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)
                                  deckVolumersRef.current[key]?.(v)
                                }}
                                onMouseMove={e => {
                                  if (e.buttons !== 1) return
                                  e.stopPropagation()
                                  const r = e.currentTarget.getBoundingClientRect()
                                  const v = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)
                                  deckVolumersRef.current[key]?.(v)
                                }}
                                style={{ width: '80%', height: 18, cursor: 'ew-resize', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                              >
                                <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${ds.volume}%`, background: 'var(--status-ok)', borderRadius: 2, transition: 'width 60ms' }} />
                                </div>
                                <span style={{ fontSize: 'var(--fs-sm)', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>{ds.volume}%</span>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {showEmoji && <span style={{ fontSize: showEmojiOnly ? 28 : 18, lineHeight: 1, marginBottom: showEmojiOnly ? 0 : 2 }}>{emoji}</span>}
                      {!showEmojiOnly && <span className="text-[10px] text-[var(--text-20)] uppercase tracking-wider">{name}</span>}
                      {!showEmojiOnly && <span className="text-[12px] font-bold text-center leading-tight w-full px-1 truncate" style={{ color: isPlaying ? 'rgba(0,184,96,0.9)' : 'var(--text-70)' }}>{displayLabel}</span>}
                      {isDrag && <span className="absolute bottom-2 text-[9px] text-[var(--text-40)] font-black uppercase">RELEASE</span>}
                    </KeyTile>
                  )
                })}
              </div>
            </div>
          </Rnd>
        )}

        {/* Config panel */}
        {selected && (
          <ConfigPanel
            key={selected}
            selected={selected}
            config={config}
            onClose={() => setSelected(null)}
            onSaved={setConfig}
          />
        )}

        {/* Mixer panel */}
        {showMixer && (
          <Rnd
            default={{ x: mxGeo.x, y: mxGeo.y, width: mxGeo.w || 340, height: 'auto' }}
            enableResizing={{ left: true, right: true }}
            minWidth={300}
            maxWidth={900}
            bounds={undefined}
            dragHandleClassName="drag-handle"
            className={`panel-drag${isDragging('mixer') ? ' dragging' : ''}`}
            scale={state.scale}
            onDragStart={() => bringToFront('mixer')}
            onDragStop={(_e, d) => { saveGeo('mixer', { x: d.x, y: d.y }); endDrag('mixer') }}
            onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo('mixer', { x: pos.x, y: pos.y, w: ref.offsetWidth })}
            style={{ zIndex: zOf('mixer', 10) }}
          >
            <AudioMixer
              dragHandleClass="drag-handle"
              onClose={() => setShowMixer(false)}
              config={config}
              sbChannels={sbChannels}
              onRenameKey={async (keyId, label) => {
                const next = { ...config, buttons: { ...config.buttons, [keyId]: { ...config.buttons?.[keyId], label } } }
                await fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
                setConfig(next)
              }}
              onRegisterToggler={(keyId, fn) => { deckTogglersRef.current[keyId] = fn }}
              onRegisterSyncer={(keyId, fn) => { deckSyncersRef.current[keyId] = fn }}
              onDeckStateChange={handleDeckStateChange}
              onRegisterVolumer={(keyId, fn) => { deckVolumersRef.current[keyId] = fn }}
              onPlayStateChange={(keyId, playing) => setPlayingKeys(prev => {
                const next = new Set(prev)
                if (playing) { next.add(keyId) } else { next.delete(keyId) }
                return next
              })}
            />
          </Rnd>
        )}

        {/* Soundboard panel */}
        {showSoundboard && <SoundboardPanel onClose={() => setShowSoundboard(false)} onChannelChange={setSbChannels} />}

        {/* Live panels */}
        {showOBS && <OBSControlPanel onClose={() => setShowOBS(false)} />}
        {showBriefing && <BriefingPanel onClose={() => setShowBriefing(false)} />}
        {showYTChat && <YouTubeChatPanel onClose={() => setShowYTChat(false)} />}
        {showTimer && <TimerPanel onClose={() => setShowTimer(false)} />}
        {showDrone && <DronePanel onClose={() => setShowDrone(false)} />}
        {showPaul && <PaulstretchPanel onClose={() => setShowPaul(false)} />}
        {synthIds.map(id => <SynthPanel key={id} instanceId={id} onClose={() => setSynthIds(prev => prev.filter(x => x !== id))} />)}
        {showExporter && <ExporterPanel onClose={() => setShowExporter(false)} />}
        {showConverter && <ConverterPanel onClose={() => setShowConverter(false)} />}
        {showLoopLab && <LoopLabPanel onClose={() => setShowLoopLab(false)} />}
        {showSession && <SessionPanel onClose={() => setShowSession(false)} />}

                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>

        {/* Floating preset button — fixed bottom-right, outside canvas scale */}
        <PresetFloating
          visibility={{ keys: showKeys, mixer: showMixer, soundboard: showSoundboard, obs: showOBS, briefing: showBriefing, ytchat: showYTChat, timer: showTimer, drone: showDrone, paul: showPaul, synth: showSynth, exporter: showExporter, converter: showConverter, looplab: showLoopLab, session: showSession }}
          scale={scale}
          onLoad={loadPreset}
        />

        {showPalette && (
          <CommandPalette
            panels={panelDefs}
            onTogglePanel={handleTogglePanel}
            onChangeSidebar={handleChangeSidebar}
            onClose={() => setShowPalette(false)}
          />
        )}

        {/* Quick source edit popup (right-click on keyboard key) */}
        {ctxMenu && (
          <div
            ref={ctxRef}
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
              borderRadius: 'var(--radius-sm)', padding: 12, width: 280,
              background: 'var(--bg-popup)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.07)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <span style={{ fontSize: 'var(--fs-base)', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-40)' }}>
              Edit Source — {ctxMenu.key.replace('key_', '').toUpperCase()}
            </span>
            <input
              autoFocus
              value={ctxSrc}
              onChange={e => setCtxSrc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCtxSrc(); if (e.key === 'Escape') setCtxMenu(null) }}
              placeholder="Path or URL (.mp3, .wav, ...)"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
                color: 'var(--text-pure)', fontSize: 'var(--fs-lg)', outline: 'none',
                boxShadow: 'var(--shadow-input)',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={saveCtxSrc}
                disabled={ctxSaving}
                style={{
                  flex: 1, padding: '7px 0', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'var(--bg-btn-silver)', color: '#000',
                  fontWeight: 800, fontSize: 'var(--fs-md)', letterSpacing: '0.2em', textTransform: 'uppercase',
                  opacity: ctxSaving ? 0.5 : 1,
                }}
              >{ctxSaving ? '...' : 'Save'}</button>
              <button
                onClick={() => setCtxMenu(null)}
                style={{
                  padding: '7px 12px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', color: 'var(--text-40)',
                  fontWeight: 700, fontSize: 'var(--fs-md)',
                }}
              >Cancel</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function NavBtn({ active, onClick, title, children }: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-12 h-12 flex items-center justify-center cursor-pointer border-none transition-all active:translate-y-0.5 hover:brightness-125"
      style={{
        borderRadius: '14px',
        background: active ? 'var(--bg-key-on)' : 'transparent',
        boxShadow: active ? 'var(--shadow-key-on)' : 'none',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span className="text-lg" style={{ opacity: active ? 1 : 0.4 }}>{children}</span>
    </button>
  )
}
