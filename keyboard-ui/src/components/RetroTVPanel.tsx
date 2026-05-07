import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import { loadGeo, saveGeo } from '../lib/geo'
import { usePanelCtx } from '../lib/panel-context'
import { getSharedAudioContext } from '../lib/audio-context'
import { getOrCreateSource, createAnalyserWhenReady, createStreamAnalyser, readBands, detectBeats, smoothBands, ZERO_BANDS } from '../lib/visualizer-engine'
import type { AudioBands, AnalyserPipeline, StreamAnalyserPipeline } from '../lib/visualizer-engine'
import { useCaptureSourceList, useCaptureStream } from '../lib/capture-bus'
import { ParticleEngine, type ParticleParams } from '../lib/visualizers/particles'
import { VIS_MODES, KNOB_REGISTRY, type VisMode, type VisEngine } from '../lib/visualizers/types'
import { AUDIOMOTION_PRESETS, CRT_GRADIENTS } from '../lib/visualizers/audiomotion-config'
import { ShaderEngine, type ShaderParams, DEFAULT_SHADER_PARAMS } from '../lib/visualizers/shader-engine'
import { SHADER_PLASMA, SHADER_VORONOI, SHADER_WARP, SHADER_FRACTAL, SHADER_NEON } from '../lib/visualizers/shaders'
import { ScopeEngine } from '../lib/visualizers/scope'
import { SmokeEngine } from '../lib/visualizers/smoke'
import { RingsEngine } from '../lib/visualizers/rings'
import { GridEngine } from '../lib/visualizers/grid-vis'
import { LettersEngine } from '../lib/visualizers/letters'

const SHADER_MAP: Record<string, string> = {
  plasma: SHADER_PLASMA, voronoi: SHADER_VORONOI, warp: SHADER_WARP,
  fractal: SHADER_FRACTAL, neon: SHADER_NEON,
}

function createCustomEngine(mode: VisMode): VisEngine | null {
  switch (mode) {
    case 'particles': return new ParticleEngine()
    case 'scope': return new ScopeEngine()
    case 'smoke': return new SmokeEngine()
    case 'rings': return new RingsEngine()
    case 'grid': return new GridEngine()
    case 'letters': return new LettersEngine()
    default: return null
  }
}
import {
  RETRO, retroDialStyle, retroDialInnerStyle, retroPowerBtnStyle,
  retroLedStyle, retroConsoleBarStyle, retroScreenStyle,
  retroScanlineOverlay, retroVignetteOverlay, retroTimecodeStyle, retroFootStyle,
} from '../lib/retro-tokens'
import { AppKnob } from './AppKnob'

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void }
}

type MediaSource = { type: 'youtube'; videoId: string } | { type: 'file'; url: string; mime: string } | { type: 'panel'; panelId: string }

function extractYouTubeId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = input.match(p)
    if (m) return m[1]
  }
  return null
}

function detectFileType(name: string): 'video' | 'audio' {
  return /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(name) ? 'audio' : 'video'
}

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${sec}`
  return `${m}:${sec}`
}

type SavedItem = { url: string; type: string; title: string; savedAt: string; thumb?: string }

function ytThumb(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

function captureVideoThumb(video: HTMLVideoElement): string | null {
  try {
    const c = document.createElement('canvas')
    c.width = 80
    c.height = 45
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, 80, 45)
    return c.toDataURL('image/jpeg', 0.4)
  } catch { return null }
}

function mediaToUrl(media: MediaSource): string {
  if (media.type === 'youtube') return `https://www.youtube.com/watch?v=${media.videoId}`
  if (media.type === 'panel') return `panel:${media.panelId}`
  return media.url
}

let ytApiLoaded = false
let ytApiReady = false
const ytReadyCallbacks: (() => void)[] = []

function ensureYTApi(cb: () => void) {
  if (ytApiReady) { cb(); return }
  ytReadyCallbacks.push(cb)
  if (ytApiLoaded) return
  ytApiLoaded = true
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    prev?.()
    ytApiReady = true
    ytReadyCallbacks.forEach(fn => fn())
    ytReadyCallbacks.length = 0
  }
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
}

export interface VisParams {
  sensitivity: number
  waveformMix: number
  hueShift: number
  smoothing: number
  barSpace: number
  spinSpeed: number
  lineWidth: number
  fillAlpha: number
  gradient: 'green' | 'warm'
  particle: Partial<ParticleParams>
  shader: Partial<ShaderParams>
  custom: Record<string, number>
}

export const DEFAULT_VIS_PARAMS: VisParams = {
  sensitivity: 1, waveformMix: 1, hueShift: 0, smoothing: 0.7, barSpace: 0.2, spinSpeed: 1, lineWidth: 2, fillAlpha: 0.3,
  gradient: 'green', particle: {}, shader: {}, custom: {},
}

// ── Preset system ──

export interface VisPreset {
  name: string
  mode: VisMode
  params: VisParams
  builtIn?: boolean
}

const BUILTIN_PRESETS: VisPreset[] = [
  { name: 'CRT Classic', mode: 'bars', builtIn: true, params: { ...DEFAULT_VIS_PARAMS } },
  { name: 'LED Matrix', mode: 'led', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, smoothing: 0.8, barSpace: 0.1 } },
  { name: 'Vortex', mode: 'radial', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, spinSpeed: 2.5, smoothing: 0.6 } },
  { name: 'Waveform', mode: 'line', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, lineWidth: 1.5, fillAlpha: 0.15, smoothing: 0.5 } },
  { name: 'Mirror Hall', mode: 'mirror', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, barSpace: 0.15, smoothing: 0.75 } },
  { name: 'Mycelium', mode: 'particles', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, particle: { speed: 1.2, branching: 0.5, complexity: 1.8, tension: 0.08, lifespan: 400, trailLen: 24, fade: 0.03, maxParticles: 800 } } },
  { name: 'Fireflies', mode: 'particles', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, sensitivity: 1.5, particle: { speed: 2.5, branching: 0.1, complexity: 0.6, tension: 0.04, lifespan: 150, trailLen: 8, fade: 0.08, maxParticles: 400 } } },
  { name: 'Neural Web', mode: 'particles', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, particle: { speed: 0.8, branching: 0.7, complexity: 2.5, tension: 0.15, lifespan: 600, trailLen: 32, fade: 0.02, maxParticles: 1200 } } },
  // Canvas engines
  { name: 'Phosphor', mode: 'scope', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, sensitivity: 1.2, custom: { freq: 2, glow: 8, trail: 0.15, history: 8, lineWidth: 1.5, phaseSpeed: 0.02 } } },
  // { name: 'Fog Machine', mode: 'smoke', ... },
  { name: 'Sonar', mode: 'rings', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, sensitivity: 1.4, custom: { ringSpeed: 2, beatThresh: 0.5, glow: 6, maxRings: 40, arcSpeed: 0.5 } } },
  { name: 'Barcode', mode: 'grid', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, custom: { cols: 32, rows: 14, scanSpeed: 80, glowThresh: 0.5 } } },
  // { name: 'Kanji Rain', mode: 'letters', ... },
  // Shader engines
  { name: 'Plasma', mode: 'plasma', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, shader: { speed: 1, zoom: 1, reactivity: 1.2 } } },
  { name: 'Cells', mode: 'voronoi', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, shader: { speed: 0.8, zoom: 1, complexity: 1.2 } } },
  { name: 'Tunnel', mode: 'warp', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, sensitivity: 1.3, shader: { speed: 1.3, zoom: 1, distortion: 1.2, glow: 1.3 } } },
  { name: 'Julia Set', mode: 'fractal', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, shader: { speed: 0.6, zoom: 1, complexity: 1.5 } } },
  { name: 'Neon Wave', mode: 'neon', builtIn: true, params: { ...DEFAULT_VIS_PARAMS, sensitivity: 1.2, shader: { speed: 1.2, glow: 1.3, distortion: 1.2 } } },
]

const PRESETS_KEY = 'retrotv-vis-presets'

function loadUserPresets(): VisPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') } catch { return [] }
}

function saveUserPresets(presets: VisPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

function getAllPresets(): VisPreset[] {
  return [...BUILTIN_PRESETS, ...loadUserPresets()]
}

function exportPresetsJSON(presets: VisPreset[]): string {
  return JSON.stringify(presets, null, 2)
}

function importPresetsJSON(json: string): VisPreset[] | null {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((p: any) => p.name && p.mode && p.params)
  } catch { return null }
}

function scaleBands(bands: AudioBands, sens: number, wfMix = 1): AudioBands {
  return {
    subBass: Math.min(1, bands.subBass * sens), bass: Math.min(1, bands.bass * sens),
    lowMid: Math.min(1, bands.lowMid * sens), mid: Math.min(1, bands.mid * sens),
    highMid: Math.min(1, bands.highMid * sens), high: Math.min(1, bands.high * sens),
    volume: Math.min(1, bands.volume * sens),
    waveform: wfMix > 0 ? bands.waveform : null,
    waveformMix: wfMix,
    beatKick: bands.beatKick, beatSnare: bands.beatSnare, beatHat: bands.beatHat,
    energy: bands.energy, energyDelta: bands.energyDelta,
  }
}

function CrtVisualizer({ audioEl, audioStream, mode, visParams, onBeat, activeCanvasRef }: { audioEl?: HTMLMediaElement | null; audioStream?: MediaStream | null; mode: VisMode; visParams?: VisParams; onBeat?: (type: 'kick' | 'snare' | 'hat') => void; activeCanvasRef?: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const scanlineRef = useRef<HTMLDivElement>(null)
  const amRef = useRef<AudioMotionAnalyzer | null>(null)
  const engineRef = useRef<VisEngine | null>(null)
  const shaderRef = useRef<ShaderEngine | null>(null)
  const smoothRef = useRef<AudioBands>({ ...ZERO_BANDS })
  const rafRef = useRef<number>(0)
  const visParamsRef = useRef(visParams)
  visParamsRef.current = visParams
  const onBeatRef = useRef(onBeat)
  onBeatRef.current = onBeat
  const modeEntry = VIS_MODES.find(m => m.id === mode)!
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    setOpacity(0)
    const t = setTimeout(() => setOpacity(1), 30)
    return () => clearTimeout(t)
  }, [mode])

  useEffect(() => {
    if (!activeCanvasRef) return
    if (modeEntry.engine === 'shader') activeCanvasRef.current = glCanvasRef.current
    else if (modeEntry.engine === 'custom') activeCanvasRef.current = canvasRef.current
    else if (modeEntry.engine === 'audiomotion') {
      const c = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null
      activeCanvasRef.current = c
    }
  }, [mode, modeEntry.engine, activeCanvasRef])

  useEffect(() => {
    if (!audioEl && !audioStream) return
    let pipeline: AnalyserPipeline | StreamAnalyserPipeline | null = null
    let am: AudioMotionAnalyzer | null = null
    let smooth: AudioBands = { ...smoothRef.current }
    let cancelWait: (() => void) | null = null
    let shader: ShaderEngine | null = null
    let engine: VisEngine | null = null

    const getStreamPipeline = (fftSize: number): StreamAnalyserPipeline | null => {
      if (!audioStream) return null
      return createStreamAnalyser(audioStream, fftSize)
    }

    if (modeEntry.engine === 'audiomotion') {
      const container = containerRef.current
      if (!container) return
      const ctx = getSharedAudioContext()
      const preset = AUDIOMOTION_PRESETS[mode] || {}
      const vp = visParamsRef.current || DEFAULT_VIS_PARAMS
      try {
        am = new AudioMotionAnalyzer(container, {
          audioCtx: ctx, connectSpeakers: false, bgAlpha: 0, overlay: true,
          ...preset, smoothing: vp.smoothing, barSpace: vp.barSpace,
        })
        am.registerGradient(CRT_GRADIENTS.green[0], CRT_GRADIENTS.green[1])
        am.registerGradient(CRT_GRADIENTS.warm[0], CRT_GRADIENTS.warm[1])
        am.gradient = vp.gradient === 'warm' ? 'crt-warm' : 'crt-green'
        if (audioStream) {
          const streamSource = ctx.createMediaStreamSource(audioStream)
          am.connectInput(streamSource)
        } else if (audioEl) {
          const source = getOrCreateSource(audioEl)
          am.connectInput(source)
          ;(am as any).connectSpeakers = true
        }
        amRef.current = am

        // Beat detection via separate analyser for auto-rotate
        const beatAnalyser = ctx.createAnalyser()
        beatAnalyser.fftSize = 256
        beatAnalyser.smoothingTimeConstant = 0.8
        if (audioStream) {
          const s = ctx.createMediaStreamSource(audioStream)
          s.connect(beatAnalyser)
        } else if (audioEl) {
          getOrCreateSource(audioEl).connect(beatAnalyser)
        }
        const beatData = new Uint8Array(beatAnalyser.frequencyBinCount)
        const beatLoop = () => {
          rafRef.current = requestAnimationFrame(beatLoop)
          const raw = detectBeats(readBands(beatAnalyser, beatData))
          if (raw.beatKick) onBeatRef.current?.('kick')
          if (raw.beatSnare) onBeatRef.current?.('snare')
          if (raw.beatHat) onBeatRef.current?.('hat')
        }
        rafRef.current = requestAnimationFrame(beatLoop)
      } catch { am = null }

    } else if (modeEntry.engine === 'shader') {
      const fragSrc = SHADER_MAP[mode]
      if (!fragSrc) return

      const initShader = (p: AnalyserPipeline | StreamAnalyserPipeline) => {
        pipeline = p
        const glCanvas = glCanvasRef.current
        if (!glCanvas || !glCanvas.isConnected) return
        shader = shaderRef.current || new ShaderEngine()
        shaderRef.current = shader
        const dpr = window.devicePixelRatio || 1
        const cw = glCanvas.offsetWidth || 320, ch = glCanvas.offsetHeight || 240
        glCanvas.width = Math.round(cw * dpr)
        glCanvas.height = Math.round(ch * dpr)
        if (!shader.init(glCanvas, fragSrc)) { console.warn('Shader init failed for', mode); pipeline?.cleanup(); pipeline = null; return }
        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (!glCanvas || !pipeline || !shader) return
          const cw = glCanvas.offsetWidth, ch = glCanvas.offsetHeight
          if (glCanvas.width !== Math.round(cw * dpr) || glCanvas.height !== Math.round(ch * dpr)) {
            glCanvas.width = Math.round(cw * dpr); glCanvas.height = Math.round(ch * dpr)
          }
          const raw = detectBeats(readBands(pipeline.analyser, pipeline.data))
          smooth = smoothBands(smooth, raw)
          smoothRef.current = smooth
          if (raw.beatKick) onBeatRef.current?.('kick')
          if (raw.beatSnare) onBeatRef.current?.('snare')
          if (raw.beatHat) onBeatRef.current?.('hat')
          if (scanlineRef.current) scanlineRef.current.style.opacity = String(0.04 + smooth.bass * 0.08)
          const sp = visParamsRef.current?.shader ?? {}
          const hueRad = (visParamsRef.current?.hueShift ?? 0) * Math.PI / 180
          shader.draw(scaleBands(smooth, visParamsRef.current?.sensitivity ?? 1, visParamsRef.current?.waveformMix ?? 1), { ...sp, colorShift: (sp.colorShift ?? 0) + hueRad })
        }
        rafRef.current = requestAnimationFrame(loop)
      }

      if (audioStream) {
        const sp = getStreamPipeline(512)
        if (sp) initShader(sp)
      } else if (audioEl) {
        cancelWait = createAnalyserWhenReady(audioEl, 512, initShader)
      }

    } else {
      engine = createCustomEngine(mode)
      if (!engine) return
      engineRef.current = engine

      const initCustom = (p: AnalyserPipeline | StreamAnalyserPipeline) => {
        pipeline = p
        engine!.reset()
        const dpr = window.devicePixelRatio || 1
        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          const canvas = canvasRef.current
          if (!canvas || !pipeline || !engine) return
          const cw = canvas.offsetWidth, ch = canvas.offsetHeight
          if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
            canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr)
            const ctx2 = canvas.getContext('2d')
            ctx2?.scale(dpr, dpr)
            engine!.reset()
          }
          const ctx2d = canvas.getContext('2d')
          if (!ctx2d) return
          const raw = detectBeats(readBands(pipeline.analyser, pipeline.data))
          smooth = smoothBands(smooth, raw)
          smoothRef.current = smooth
          if (raw.beatKick) onBeatRef.current?.('kick')
          if (raw.beatSnare) onBeatRef.current?.('snare')
          if (raw.beatHat) onBeatRef.current?.('hat')
          if (scanlineRef.current) scanlineRef.current.style.opacity = String(0.04 + smooth.bass * 0.08)
          const scaled = scaleBands(smooth, visParamsRef.current?.sensitivity ?? 1, visParamsRef.current?.waveformMix ?? 1)
          const hs = visParamsRef.current?.hueShift ?? 0
          if (mode === 'particles') {
            (engine as ParticleEngine).draw(ctx2d, cw, ch, scaled, { ...visParamsRef.current?.particle, hueShift: hs })
          } else {
            engine!.draw(ctx2d, cw, ch, scaled, { ...visParamsRef.current?.custom, hueShift: hs })
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }

      if (audioStream) {
        const sp = getStreamPipeline(512)
        if (sp) initCustom(sp)
      } else if (audioEl) {
        cancelWait = createAnalyserWhenReady(audioEl, 512, initCustom)
      }
    }

    return () => {
      cancelWait?.()
      cancelAnimationFrame(rafRef.current)
      pipeline?.cleanup()
      if (am) { try { am.destroy() } catch { /* */ } amRef.current = null }
      if (shader) shader.destroy()
      engineRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEl, audioStream, mode])

  useEffect(() => {
    return () => { shaderRef.current?.dispose(); shaderRef.current = null }
  }, [])

  // Live-patch audiomotion
  useEffect(() => {
    const am = amRef.current
    if (!am || modeEntry.engine !== 'audiomotion') return
    const vp = visParams || DEFAULT_VIS_PARAMS
    am.smoothing = vp.smoothing
    am.barSpace = vp.barSpace
    const s = vp.sensitivity || 1
    const minDb = -85 / s
    const maxDb = -25 / s
    if (minDb < maxDb) am.setSensitivity(minDb, maxDb)
    if (mode === 'radial') (am as any).spinSpeed = vp.spinSpeed
    if (mode === 'line') { am.lineWidth = vp.lineWidth; am.fillAlpha = vp.fillAlpha }
    am.gradient = vp.gradient === 'warm' ? 'crt-warm' : 'crt-green'
  }, [visParams, mode, modeEntry.engine])

  const baseStyle: React.CSSProperties = { width: '100%', height: '100%', display: 'block', background: '#0a0c08', opacity, transition: 'opacity 150ms ease-in-out' }
  const hiddenStyle: React.CSSProperties = { ...baseStyle, position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={modeEntry.engine === 'audiomotion' ? baseStyle : hiddenStyle} />
      <canvas ref={glCanvasRef} style={modeEntry.engine === 'shader' ? baseStyle : hiddenStyle} />
      <canvas ref={canvasRef} style={modeEntry.engine === 'custom' ? baseStyle : hiddenStyle} />
      <div ref={scanlineRef} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px)',
        backgroundSize: '100% 3px',
        opacity: 0.04,
        animation: 'retro-scanline-scroll 4s linear infinite',
      }} />
    </div>
  )
}

export function RetroTVPanel({ onClose }: { onClose: () => void }) {
  const { scale, zOf, bringToFront, endDrag, isDragging } = usePanelCtx()
  const geo = loadGeo('retrotv', { x: 200, y: 100, w: 480, h: 0 })
  const [media, setMedia] = useState<MediaSource | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isOn, setIsOn] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileObjUrl, setFileObjUrl] = useState<string | null>(null)
  const prevBlobRef = useRef<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [saveFlash, setSaveFlash] = useState<'saved' | 'exists' | null>(null)
  const [crtAnim, setCrtAnim] = useState<'off' | 'on' | null>(null)
  const [muted, setMuted] = useState(false)
  const [mediaElReady, setMediaElReady] = useState<HTMLMediaElement | null>(null)
  const [visOverlay, setVisOverlay] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [visMode, setVisMode] = useState<VisMode>(() => {
    return (localStorage.getItem('retrotv-vismode') as VisMode) || 'bars'
  })
  const [savedList, setSavedList] = useState<SavedItem[]>([])
  const [showVisParams, setShowVisParams] = useState(false)
  const [showPresetsMenu, setShowPresetsMenu] = useState(false)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [showPresetNameInput, setShowPresetNameInput] = useState(false)
  const [visParams, setVisParams] = useState<VisParams>(() => {
    try { return { ...DEFAULT_VIS_PARAMS, ...JSON.parse(localStorage.getItem('retrotv-visparams') || '{}') } } catch { return { ...DEFAULT_VIS_PARAMS } }
  })

  const [isFullscreen, setIsFullscreen] = useState(false)
  const tvRef = useRef<HTMLDivElement>(null)

  const [panelSourceId, setPanelSourceId] = useState<string | null>(null)
  const captureSources = useCaptureSourceList()
  const panelStream = useCaptureStream(panelSourceId)

  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(false)
  autoRotateRef.current = autoRotate
  const kickCountRef = useRef(0)

  const handleBeat = useCallback((type: 'kick' | 'snare' | 'hat') => {
    if (!autoRotateRef.current || type !== 'kick') return
    kickCountRef.current++
    if (kickCountRef.current >= 16) {
      kickCountRef.current = 0
      setVisMode(prev => {
        const idx = VIS_MODES.findIndex(m => m.id === prev)
        const next = (idx + 1) % VIS_MODES.length
        localStorage.setItem('retrotv-vismode', VIS_MODES[next].id)
        return VIS_MODES[next].id
      })
    }
  }, [])

  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const toggleRecording = useCallback(() => {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }
    const canvas = activeCanvasRef.current
    if (!canvas) return
    const canvasStream = canvas.captureStream(30)
    const audioCtx = getSharedAudioContext()
    const dest = audioCtx.createMediaStreamDestination()
    if (panelStream) {
      try { audioCtx.createMediaStreamSource(panelStream).connect(dest) } catch { /* */ }
    } else if (mediaElRef.current) {
      try { getOrCreateSource(mediaElRef.current).connect(dest) } catch { /* */ }
    }
    for (const t of dest.stream.getAudioTracks()) canvasStream.addTrack(t)
    const chunks: Blob[] = []
    recordChunksRef.current = chunks
    const mr = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9,opus' })
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    mr.onstop = () => {
      setRecording(false)
      mediaRecorderRef.current = null
      if (chunks.length === 0) return
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `retrotv-${Date.now()}.webm`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
    mr.start(100)
    mediaRecorderRef.current = mr
    setRecording(true)
  }, [recording, panelStream])

  useEffect(() => {
    return () => { mediaRecorderRef.current?.stop() }
  }, [])

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('retrotv-volume')
    return saved ? parseFloat(saved) : 80
  })

  const ytPlayerRef = useRef<any>(null)
  const ytContainerRef = useRef<HTMLDivElement>(null)
  const mediaElRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const tickRef = useRef<number>(0)
  const hideTimerRef = useRef<number>(0)

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      tvRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const showInput = hovered || inputFocused || !media || showSaved

  const refreshSaved = useCallback(() => {
    try { setSavedList(JSON.parse(localStorage.getItem('retrotv-saved') || '[]')) } catch { setSavedList([]) }
  }, [])

  const deleteSaved = useCallback((url: string) => {
    const raw = localStorage.getItem('retrotv-saved') || '[]'
    let list: SavedItem[] = []
    try { list = JSON.parse(raw) } catch { /* */ }
    list = list.filter(i => i.url !== url)
    localStorage.setItem('retrotv-saved', JSON.stringify(list))
    setSavedList(list)
  }, [])

  const loadSaved = useCallback((item: { url: string; type: string }) => {
    const ytId = extractYouTubeId(item.url)
    if (ytId) {
      setMedia({ type: 'youtube', videoId: ytId })
      setUrlInput(item.url)
    } else {
      setMedia({ type: 'file', url: item.url, mime: item.type === 'audio' || detectFileType(item.url) === 'audio' ? 'audio' : 'video' })
      setUrlInput(item.url)
    }
    setIsOn(true)
    setShowSaved(false)
  }, [])

  useEffect(() => {
    return () => { if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current) }
  }, [])

  useEffect(() => {
    localStorage.setItem('retrotv-volume', String(volume))
  }, [volume])

  useEffect(() => {
    localStorage.setItem('retrotv-visparams', JSON.stringify(visParams))
  }, [visParams])

  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      const yt = ytPlayerRef.current
      if (yt?.getCurrentTime) {
        setCurrentTime(yt.getCurrentTime())
        setDuration(yt.getDuration?.() || 0)
        setPlaying(yt.getPlayerState?.() === 1)
      }
    }, 500)
    return () => clearInterval(tickRef.current)
  }, [])

  // Create/destroy YT player only when media changes (not isOn)
  useEffect(() => {
    if (!media || media.type !== 'youtube') {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy() } catch { /* */ } ytPlayerRef.current = null }
      return
    }
    const containerId = 'retrotv-yt-' + media.videoId
    ensureYTApi(() => {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy() } catch { /* */ } ytPlayerRef.current = null }
      const el = document.getElementById(containerId)
      if (!el) return
      ytPlayerRef.current = new window.YT.Player(containerId, {
        videoId: media.videoId,
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3, disablekb: 0, fs: 0, playsinline: 1 },
        events: { onReady: (e: any) => { e.target.setVolume(volume) } },
      })
    })
    return () => {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy() } catch { /* */ } ytPlayerRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media])

  // Pause/resume when power toggles
  useEffect(() => {
    const yt = ytPlayerRef.current
    if (!yt?.getPlayerState) return
    if (isOn) { try { yt.playVideo() } catch { /* */ } }
    else { try { yt.pauseVideo() } catch { /* */ } }
  }, [isOn])

  useEffect(() => { ytPlayerRef.current?.setVolume?.(muted ? 0 : volume) }, [volume, muted])
  useEffect(() => { if (mediaElRef.current) mediaElRef.current.volume = muted ? 0 : volume / 100 }, [volume, muted])

  const togglePlay = useCallback(() => {
    getSharedAudioContext()
    const yt = ytPlayerRef.current
    if (yt?.getPlayerState) { yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo(); return }
    const el = mediaElRef.current
    if (el) { el.paused ? el.play().catch(() => {}) : el.pause() }
  }, [])

  const handleSave = useCallback(() => {
    if (!media) return
    const url = mediaToUrl(media)
    const raw = localStorage.getItem('retrotv-saved') || '[]'
    let list: SavedItem[] = []
    try { list = JSON.parse(raw) } catch { /* */ }
    if (list.some(i => i.url === url)) {
      setSaveFlash('exists')
      setTimeout(() => setSaveFlash(null), 1500)
      return
    }
    let thumb: string | undefined
    if (media.type === 'youtube') {
      thumb = ytThumb(media.videoId)
    } else if (media.type === 'file' && media.mime === 'video' && mediaElRef.current instanceof HTMLVideoElement) {
      thumb = captureVideoThumb(mediaElRef.current) ?? undefined
    }
    list.push({ url, type: media.type, title: urlInput || url, savedAt: new Date().toISOString(), thumb })
    localStorage.setItem('retrotv-saved', JSON.stringify(list))
    setSaveFlash('saved')
    setTimeout(() => setSaveFlash(null), 1500)
  }, [media, urlInput])

  const handleSubmit = useCallback(() => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    const ytId = extractYouTubeId(trimmed)
    if (ytId) setMedia({ type: 'youtube', videoId: ytId })
    else setMedia({ type: 'file', url: trimmed, mime: detectFileType(trimmed) === 'audio' ? 'audio' : 'video' })
    setIsOn(true)
  }, [urlInput])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current)
    const url = URL.createObjectURL(file)
    prevBlobRef.current = url
    setFileObjUrl(url)
    setMedia({ type: 'file', url, mime: detectFileType(file.name) === 'audio' ? 'audio' : 'video' })
    setIsOn(true)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current)
    const url = URL.createObjectURL(file)
    prevBlobRef.current = url
    setFileObjUrl(url)
    setMedia({ type: 'file', url, mime: detectFileType(file.name) === 'audio' ? 'audio' : 'video' })
    setIsOn(true)
  }, [])

  const onMediaTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    const el = e.currentTarget
    setCurrentTime(el.currentTime)
    setDuration(el.duration || 0)
    setPlaying(!el.paused)
  }, [])

  const onMediaRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    mediaElRef.current = el
    if (el) el.volume = muted ? 0 : volume / 100
    setMediaElReady(el)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hideTimerRef.current)
    setHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = window.setTimeout(() => setHovered(false), 800)
  }, [])

  const isYouTube = media?.type === 'youtube'
  const youtubeUrl = isYouTube ? `https://www.youtube.com/watch?v=${media.videoId}` : null

  const tvW = 480
  const hasMedia = isOn && media

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || tvW, height: 'auto' as unknown as number }}
      dragHandleClassName="retrotv-drag"
      scale={scale}
      enableResizing={false}
      disableDragging={isFullscreen}
      onDragStart={() => bringToFront('retrotv')}
      onDragStop={(_e, d) => { saveGeo('retrotv', { x: d.x, y: d.y }); endDrag('retrotv') }}
      style={{ zIndex: isFullscreen ? 9999 : zOf('retrotv', 10) }}
      className={`panel-drag ${isDragging('retrotv') ? 'dragging' : ''}`}
    >
      <div
        ref={tvRef}
        style={{
          width: isFullscreen ? '100vw' : tvW,
          height: isFullscreen ? '100vh' : undefined,
          userSelect: 'none',
          display: isFullscreen ? 'flex' : undefined,
          flexDirection: isFullscreen ? 'column' : undefined,
          background: isFullscreen ? '#000' : undefined,
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* TV Body */}
        <div className={isFullscreen ? undefined : 'retrotv-drag'} style={{
          position: 'relative', width: '100%',
          ...(isFullscreen ? { flex: 1, minHeight: 0 } : { paddingBottom: '80%' }),
          background: isFullscreen ? '#000' : RETRO.bodyGradient,
          borderRadius: isFullscreen ? 0 : RETRO.radiusBody,
          cursor: isFullscreen ? undefined : 'grab',
        }}>
          {/* Bezel outer */}
          <div style={{
            position: 'absolute', inset: isFullscreen ? 0 : '2.9% 2.2%', bottom: isFullscreen ? 0 : '3%',
            background: isFullscreen ? 'transparent' : RETRO.bezelOuter, borderRadius: isFullscreen ? 0 : RETRO.radiusBezelOuter,
          }}>
            {/* Bezel inner */}
            <div style={{
              position: 'absolute', inset: isFullscreen ? 0 : '3.8% 3.8%',
              background: isFullscreen ? 'transparent' : RETRO.bezelInner, borderRadius: isFullscreen ? 0 : RETRO.radiusBezelInner,
            }}>
              {/* Screen */}
              <div style={retroScreenStyle(isOn || crtAnim === 'off')}>
                {/* CRT content wrapper — animated on power toggle */}
                <div
                  className={crtAnim === 'off' ? 'retrotv-crt-off' : crtAnim === 'on' ? 'retrotv-crt-on' : undefined}
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                {isOn && !media && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: 20,
                  }}>
                    <div style={{ fontSize: 32, opacity: 0.4 }}>📺</div>
                    <div>Cole uma URL do YouTube, arraste um arquivo, ou use os controles abaixo</div>
                  </div>
                )}

                {media?.type === 'youtube' && (
                  <div ref={ytContainerRef} id={`retrotv-yt-${media.videoId}`} style={{ width: '100%', height: '100%', visibility: isOn ? 'visible' : 'hidden' }} />
                )}
                {isOn && media?.type === 'youtube' && (
                  <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 1 }} />
                )}

                {isOn && media?.type === 'file' && media.mime === 'video' && (
                  <>
                    <video
                      ref={onMediaRef as React.RefCallback<HTMLVideoElement>}
                      src={media.url} autoPlay loop onClick={togglePlay}
                      onTimeUpdate={onMediaTimeUpdate}
                      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', cursor: 'pointer' }}
                    />
                    {visOverlay && mediaElReady && (
                      <div onClick={togglePlay} style={{
                        position: 'absolute', inset: 0, cursor: 'pointer',
                        background: 'rgba(0,0,0,0.5)',
                      }}>
                        <CrtVisualizer audioEl={mediaElReady} mode={visMode} visParams={visParams} onBeat={handleBeat} activeCanvasRef={activeCanvasRef} />
                      </div>
                    )}
                  </>
                )}

                {isOn && media?.type === 'file' && media.mime === 'audio' && (
                  <>
                    <div onClick={togglePlay} style={{
                      position: 'absolute', inset: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#0a0c08',
                    }}>
                      {mediaElReady
                        ? <CrtVisualizer audioEl={mediaElReady} mode={visMode} visParams={visParams} onBeat={handleBeat} activeCanvasRef={activeCanvasRef} />
                        : <div style={{ fontSize: 48, opacity: 0.4 }}>🎵</div>
                      }
                    </div>
                    <audio
                      ref={onMediaRef as React.RefCallback<HTMLAudioElement>}
                      src={media.url} autoPlay loop
                      onTimeUpdate={onMediaTimeUpdate}
                      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                    />
                  </>
                )}

                {isOn && media?.type === 'panel' && panelStream && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#0a0c08',
                  }}>
                    <CrtVisualizer audioStream={panelStream} mode={visMode} visParams={visParams} onBeat={handleBeat} activeCanvasRef={activeCanvasRef} />
                  </div>
                )}

                {isOn && media?.type === 'panel' && !panelStream && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: 20,
                  }}>
                    <div style={{ fontSize: 24, opacity: 0.4 }}>🎛</div>
                    <div>Panel sem sinal — toque algo no painel selecionado</div>
                  </div>
                )}

                {hasMedia && <div style={retroVignetteOverlay} />}

                {recording && (
                  <div style={{
                    position: 'absolute', top: 8, right: 10, zIndex: 5,
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '2px 8px', borderRadius: 3,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                    animation: 'retrotv-rec-blink 1s ease-in-out infinite',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3333' }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#ff5555', fontFamily: 'monospace', letterSpacing: '0.1em' }}>REC</span>
                  </div>
                )}

                {hasMedia && duration > 0 && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', zIndex: 4,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity 0.3s',
                    pointerEvents: hovered ? 'auto' : 'none',
                  }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtTime(currentTime)}
                    </span>
                    <input
                      type="range" min={0} max={duration || 1} step={0.1}
                      value={currentTime}
                      onChange={e => {
                        const t = Number(e.target.value)
                        const yt = ytPlayerRef.current
                        if (yt?.seekTo) { yt.seekTo(t, true) }
                        else if (mediaElRef.current) { mediaElRef.current.currentTime = t }
                        setCurrentTime(t)
                      }}
                      style={{
                        flex: 1, height: 4, accentColor: 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtTime(duration)}
                    </span>
                  </div>
                )}
                </div>{/* end CRT content wrapper */}
              </div>
            </div>
          </div>
        </div>

        {/* Console bar */}
        <div style={retroConsoleBarStyle}>
          {/* ── Section: Transport ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => {
              if (isOn) {
                setCrtAnim('off')
                setTimeout(() => { setIsOn(false); setCrtAnim(null) }, 500)
              } else {
                setIsOn(true)
                setCrtAnim('on')
                setTimeout(() => setCrtAnim(null), 400)
              }
            }} style={retroPowerBtnStyle(isOn)}>⏻</button>
            <div style={retroLedStyle(isOn, RETRO.ledPowerOn, RETRO.ledPowerOff)} />
            <div style={retroLedStyle(!!media, RETRO.ledSignalOn, RETRO.ledSignalOff)} />

            <div
              onDoubleClick={() => setMuted(v => !v)}
              title={muted ? 'Double-click: unmute' : `Vol ${Math.round(volume)}% — double-click: mute`}
            >
              <AppKnob
                label={muted ? 'MUTE' : ''}
                min={0} max={100}
                value={volume}
                onChange={v => { setVolume(v); if (muted) setMuted(false) }}
                size={38}
                theme="light"
              />
            </div>

            {hasMedia && (
              <button
                onClick={togglePlay} title={playing ? 'Pause' : 'Play'}
                style={{ ...retroDialStyle(38), transition: 'transform 0.12s ease, box-shadow 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = RETRO.dialShadow }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
              >
                <div style={{ ...retroDialInnerStyle(playing ? RETRO.dialGreen : RETRO.dialRed, 38), transition: 'background 0.25s ease' }}>
                  {playing ? '⏸' : '▶'}
                </div>
              </button>
            )}
          </div>

          {/* ── Section: Visualizer ── */}
          {hasMedia && (() => {
            const visActive = (media?.type === 'panel' && panelStream) || (mediaElReady && ((media?.type === 'file' && media.mime === 'audio') || visOverlay))
            const idx = VIS_MODES.findIndex(m => m.id === visMode)
            const prev = () => { const i = (idx - 1 + VIS_MODES.length) % VIS_MODES.length; setVisMode(VIS_MODES[i].id); localStorage.setItem('retrotv-vismode', VIS_MODES[i].id) }
            const next = () => { const i = (idx + 1) % VIS_MODES.length; setVisMode(VIS_MODES[i].id); localStorage.setItem('retrotv-vismode', VIS_MODES[i].id) }
            const arrowBtnStyle: React.CSSProperties = {
              width: 28, height: 28, border: 'none', cursor: 'pointer', background: 'transparent',
              color: 'rgba(0,0,0,0.5)', fontSize: 12, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 2, transition: 'background 0.12s',
            }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Video overlay toggle */}
                {mediaElReady && media?.type === 'file' && media.mime === 'video' && (
                  <button
                    onClick={() => setVisOverlay(v => !v)}
                    title={visOverlay ? 'Esconder visualizer' : 'Mostrar visualizer'}
                    style={{
                      ...retroDialStyle(28),
                      boxShadow: visOverlay ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 1px 1px rgba(0,0,0,0.2)',
                      fontSize: 11, color: RETRO.textOnChassis, fontWeight: 900,
                      background: visOverlay ? 'rgba(0,0,0,0.12)' : RETRO.dialGradient,
                      transition: 'transform 0.12s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  >◉</button>
                )}
                {/* Mode selector + settings — only when visualizer is active */}
                {visActive && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 0,
                      background: 'rgba(0,0,0,0.06)', borderRadius: 3,
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)',
                      padding: '0 1px',
                    }}>
                      <button onClick={prev} title="Previous mode" style={arrowBtnStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >◂</button>
                      <span
                        title={VIS_MODES[idx]?.label}
                        style={{
                          fontSize: 9, fontWeight: 800, textTransform: 'uppercase', fontFamily: 'monospace',
                          color: 'rgba(0,0,0,0.7)', letterSpacing: '0.05em',
                          minWidth: 50, textAlign: 'center', padding: '2px 4px',
                        }}
                      >{VIS_MODES[idx]?.label}</span>
                      <button onClick={next} title="Next mode" style={arrowBtnStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >▸</button>
                    </div>
                    <button
                      onClick={() => { setShowVisParams(v => !v); setShowPresetsMenu(false) }}
                      title="Visual parameters"
                      style={{
                        ...retroDialStyle(28),
                        boxShadow: showVisParams ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 1px 1px rgba(0,0,0,0.2)',
                        fontSize: 11, color: RETRO.textOnChassis, fontWeight: 900,
                        background: showVisParams ? 'rgba(0,0,0,0.12)' : RETRO.dialGradient,
                        transition: 'transform 0.12s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >⚙</button>
                    <button
                      onClick={() => { setAutoRotate(v => !v); kickCountRef.current = 0 }}
                      title={autoRotate ? 'Stop auto-rotate' : 'Auto-rotate on beats'}
                      style={{
                        ...retroDialStyle(28),
                        boxShadow: autoRotate ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 1px 1px rgba(0,0,0,0.2)',
                        fontSize: 11, color: RETRO.textOnChassis, fontWeight: 900,
                        background: autoRotate ? 'rgba(0,0,0,0.12)' : RETRO.dialGradient,
                        transition: 'transform 0.12s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >↻</button>
                  </>
                )}
              </div>
            )
          })()}

          {/* ── Section: System ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasMedia && (
              <button onClick={toggleRecording} title={recording ? 'Stop recording' : 'Record video'} style={{
                ...retroDialStyle(28),
                boxShadow: recording ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : '0 1px 1px rgba(0,0,0,0.2)',
                fontSize: 14, color: recording ? '#ff3333' : RETRO.textOnChassis, fontWeight: 900,
                background: recording ? 'rgba(0,0,0,0.12)' : RETRO.dialGradient,
                transition: 'transform 0.12s ease',
                animation: recording ? 'retrotv-rec-blink 1s ease-in-out infinite' : 'none',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >⏺</button>
            )}
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} style={{
              ...retroDialStyle(28),
              boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
              fontSize: 13, color: RETRO.textOnChassis, fontWeight: 900,
              transition: 'transform 0.12s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >⛶</button>
            {!isFullscreen && (
              <button onClick={onClose} title="Close" style={{
                ...retroDialStyle(28),
                boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
                fontSize: 11, color: RETRO.textOnChassis, fontWeight: 900,
                transition: 'transform 0.12s ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Bottom edge */}
        <div style={{ width: '100%', height: 4, background: RETRO.consoleBottomEdge, borderRadius: showVisParams ? 0 : '0 0 4px 4px' }} />

        {/* Vis Params knob drawer — clean hardware style */}
        {showVisParams && (() => {
          const modeEntry = VIS_MODES.find(m => m.id === visMode)
          const isParticle = visMode === 'particles'
          const isShader = modeEntry?.engine === 'shader'
          const isAudiomotion = modeEntry?.engine === 'audiomotion'
          const isCustom = modeEntry?.engine === 'custom' && !isParticle
          const isRadial = visMode === 'radial'
          const isLine = visMode === 'line'
          const vp = visParams
          const setVp = (patch: Partial<VisParams>) => setVisParams(prev => ({ ...prev, ...patch }))
          const setPp = (patch: Partial<ParticleParams>) => setVisParams(prev => ({ ...prev, particle: { ...prev.particle, ...patch } }))
          const setSp = (patch: Partial<ShaderParams>) => setVisParams(prev => ({ ...prev, shader: { ...prev.shader, ...patch } }))
          const importRef = React.createRef<HTMLInputElement>()

          const allPresets = getAllPresets()
          const modePresets = allPresets.filter(p => p.mode === visMode)

          const handleSavePreset = () => {
            const name = presetNameInput.trim()
            if (!name) { setShowPresetNameInput(true); return }
            const userPresets = loadUserPresets()
            const existing = userPresets.findIndex(p => p.name === name)
            const entry: VisPreset = { name, mode: visMode, params: { ...vp } }
            if (existing >= 0) userPresets[existing] = entry
            else userPresets.push(entry)
            saveUserPresets(userPresets)
            setShowPresetsMenu(false)
            setShowPresetNameInput(false)
            setPresetNameInput('')
          }

          const handleExport = () => {
            const all = [...BUILTIN_PRESETS, ...loadUserPresets()]
            const blob = new Blob([exportPresetsJSON(all)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'retrotv-vis-presets.json'; a.click()
            URL.revokeObjectURL(url)
            setShowPresetsMenu(false)
          }

          const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const imported = importPresetsJSON(reader.result as string)
              if (!imported) { alert('Invalid preset file'); return }
              const userPresets = loadUserPresets()
              imported.forEach(p => {
                if (p.builtIn) return
                const idx = userPresets.findIndex(u => u.name === p.name)
                if (idx >= 0) userPresets[idx] = p
                else userPresets.push(p)
              })
              saveUserPresets(userPresets)
              alert(`Imported ${imported.filter(p => !p.builtIn).length} presets`)
            }
            reader.readAsText(file)
            e.target.value = ''
            setShowPresetsMenu(false)
          }

          const menuItemStyle: React.CSSProperties = {
            display: 'block', width: '100%', textAlign: 'left',
            padding: '4px 10px', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 9, color: RETRO.textOnChassis,
            fontFamily: 'monospace', fontWeight: 600,
          }

          return (
            <div style={{
              width: '100%', background: RETRO.consoleSurface,
              borderRadius: '0 0 4px 4px',
              padding: '6px 10px 4px',
              borderTop: '1px solid rgba(0,0,0,0.1)',
              position: 'relative',
            }}>
              {/* Knobs — centered, with fixed-position action buttons on the right */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                {/* Gradient toggle — audiomotion only */}
                {isAudiomotion && (
                  <div
                    onClick={() => setVp({ gradient: vp.gradient === 'green' ? 'warm' : 'green' })}
                    title={`Palette: ${vp.gradient} — click to toggle`}
                    style={{
                      width: 14, height: 14, borderRadius: '50%', cursor: 'pointer', marginBottom: 4,
                      background: vp.gradient === 'warm' ? '#d4943a' : '#50b868',
                      border: '1px solid rgba(0,0,0,0.2)',
                      boxShadow: `0 0 4px ${vp.gradient === 'warm' ? 'rgba(212,148,58,0.4)' : 'rgba(80,184,104,0.4)'}`,
                      transition: 'background 0.15s',
                    }}
                  />
                )}

                <AppKnob label="SENS" min={0.2} max={5} value={vp.sensitivity}
                  onChange={v => setVp({ sensitivity: v })} size={32} theme="light" />
                <AppKnob label="WAVE" min={0} max={1} value={vp.waveformMix}
                  onChange={v => setVp({ waveformMix: v })} size={32} theme="light" />
                <AppKnob label="HUE" min={0} max={360} value={vp.hueShift}
                  onChange={v => setVp({ hueShift: v })} size={32} theme="light" />

                {isAudiomotion && (
                  <AppKnob label="SMOOTH" min={0} max={0.95} value={vp.smoothing}
                    onChange={v => setVp({ smoothing: v })} size={32} theme="light" />
                )}
                {isAudiomotion && !isLine && (
                  <AppKnob label="SPACE" min={0} max={1} value={vp.barSpace}
                    onChange={v => setVp({ barSpace: v })} size={32} theme="light" />
                )}
                {isAudiomotion && isRadial && (
                  <AppKnob label="SPIN" min={0} max={15} value={vp.spinSpeed}
                    onChange={v => setVp({ spinSpeed: v })} size={32} theme="light" />
                )}
                {isAudiomotion && isLine && (
                  <>
                    <AppKnob label="WIDTH" min={0.1} max={12} value={vp.lineWidth}
                      onChange={v => setVp({ lineWidth: v })} size={32} theme="light" />
                    <AppKnob label="FILL" min={0} max={1} value={vp.fillAlpha}
                      onChange={v => setVp({ fillAlpha: v })} size={32} theme="light" />
                  </>
                )}
                {isShader && (
                  <>
                    <AppKnob label="SPEED" min={0} max={10} value={vp.shader.speed ?? 1}
                      onChange={v => setSp({ speed: v })} size={32} theme="light" />
                    <AppKnob label="ZOOM" min={0.1} max={10} value={vp.shader.zoom ?? 1}
                      onChange={v => setSp({ zoom: v })} size={32} theme="light" />
                    <AppKnob label="COLOR" min={-3.14} max={3.14} value={vp.shader.colorShift ?? 0}
                      onChange={v => setSp({ colorShift: v })} size={32} theme="light" />
                    <AppKnob label="REACT" min={0} max={5} value={vp.shader.reactivity ?? 1}
                      onChange={v => setSp({ reactivity: v })} size={32} theme="light" />
                    <AppKnob label="BASS" min={0} max={5} value={vp.shader.bassWeight ?? 1}
                      onChange={v => setSp({ bassWeight: v })} size={32} theme="light" />
                    <AppKnob label="MID" min={0} max={5} value={vp.shader.midWeight ?? 1}
                      onChange={v => setSp({ midWeight: v })} size={32} theme="light" />
                    <AppKnob label="HIGH" min={0} max={5} value={vp.shader.highWeight ?? 1}
                      onChange={v => setSp({ highWeight: v })} size={32} theme="light" />
                    <AppKnob label="WARP" min={0} max={5} value={vp.shader.distortion ?? 1}
                      onChange={v => setSp({ distortion: v })} size={32} theme="light" />
                    <AppKnob label="GLOW" min={0} max={5} value={vp.shader.glow ?? 1}
                      onChange={v => setSp({ glow: v })} size={32} theme="light" />
                    <AppKnob label="DETAIL" min={0.1} max={5} value={vp.shader.complexity ?? 1}
                      onChange={v => setSp({ complexity: v })} size={32} theme="light" />
                  </>
                )}
                {isParticle && (
                  <>
                    <AppKnob label="SPEED" min={0} max={10} value={vp.particle.speed ?? 1.6}
                      onChange={v => setPp({ speed: v })} size={32} theme="light" />
                    <AppKnob label="BRANCH" min={0} max={1} value={vp.particle.branching ?? 0.3}
                      onChange={v => setPp({ branching: v })} size={32} theme="light" />
                    <AppKnob label="CMPLX" min={0.1} max={10} value={vp.particle.complexity ?? 1.2}
                      onChange={v => setPp({ complexity: v })} size={32} theme="light" />
                    <AppKnob label="TENSI" min={0} max={1} value={vp.particle.tension ?? 0.12}
                      onChange={v => setPp({ tension: v })} size={32} theme="light" />
                    <AppKnob label="LIFE" min={10} max={2000} value={vp.particle.lifespan ?? 300}
                      onChange={v => setPp({ lifespan: Math.round(v) })} size={32} theme="light" />
                    <AppKnob label="TRAIL" min={1} max={100} value={vp.particle.trailLen ?? 16}
                      onChange={v => setPp({ trailLen: Math.round(v) })} size={32} theme="light" />
                    <AppKnob label="FADE" min={0.01} max={0.2} value={vp.particle.fade ?? 0.04}
                      onChange={v => setPp({ fade: v })} size={32} theme="light" />
                    <AppKnob label="MAX" min={50} max={5000} value={vp.particle.maxParticles ?? 600}
                      onChange={v => setPp({ maxParticles: Math.round(v) })} size={32} theme="light" />
                  </>
                )}
                {isCustom && KNOB_REGISTRY[visMode]?.map(k => (
                  <AppKnob key={k.key} label={k.label} min={k.min} max={k.max}
                    value={vp.custom[k.key] ?? k.default}
                    onChange={v => setVp({ custom: { ...vp.custom, [k.key]: k.step ? Math.round(v) : v } })}
                    size={32} theme="light" />
                ))}

              </div>{/* end knobs flex */}
                {/* Shuffle — fixed right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, marginBottom: 2 }}>
                <button
                  onClick={() => {
                    const rp: VisParams = {
                      sensitivity: 0.6 + Math.random() * 2,
                      smoothing: 0.3 + Math.random() * 0.6,
                      barSpace: Math.random() * 0.5,
                      spinSpeed: 0.5 + Math.random() * 4,
                      lineWidth: 0.5 + Math.random() * 4,
                      fillAlpha: Math.random() * 0.6,
                      gradient: Math.random() > 0.5 ? 'warm' : 'green',
                      particle: {
                        speed: 0.3 + Math.random() * 4, branching: Math.random() * 0.8,
                        complexity: 0.3 + Math.random() * 4, tension: Math.random() * 0.4,
                        maxParticles: 200 + Math.floor(Math.random() * 1000),
                        lifespan: 80 + Math.floor(Math.random() * 500),
                        trailLen: 4 + Math.floor(Math.random() * 30),
                        fade: 0.01 + Math.random() * 0.15,
                      },
                      shader: {
                        speed: 0.2 + Math.random() * 4,
                        zoom: 0.3 + Math.random() * 4,
                        colorShift: (Math.random() - 0.5) * 6.28,
                        reactivity: 0.3 + Math.random() * 3,
                        bassWeight: Math.random() * 3,
                        midWeight: Math.random() * 3,
                        highWeight: Math.random() * 3,
                        distortion: 0.2 + Math.random() * 3,
                        glow: 0.3 + Math.random() * 3,
                        complexity: 0.3 + Math.random() * 3,
                      },
                      custom: (() => {
                        const c: Record<string, number> = {}
                        for (const k of KNOB_REGISTRY[visMode] || []) {
                          const v = k.min + Math.random() * (k.max - k.min)
                          c[k.key] = k.step ? Math.round(v) : v
                        }
                        return c
                      })(),
                    }
                    setVisParams(rp)
                  }}
                  title="Shuffle params"
                  style={{
                    width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.15)',
                    background: 'rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: 12,
                    color: RETRO.textOnChassis, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform 0.12s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >🎲</button>

                {/* Presets menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowPresetsMenu(v => !v)}
                    title="Presets & export"
                    style={{
                      width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.15)',
                      background: showPresetsMenu ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)',
                      cursor: 'pointer', fontSize: 10, color: RETRO.textOnChassis, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'transform 0.12s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                  >...</button>

                  {/* Dropdown menu */}
                  {showPresetsMenu && (
                    <div style={{
                      position: 'absolute', bottom: 22, right: 0, zIndex: 20,
                      background: '#e8e0d8', borderRadius: 4, minWidth: 140,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.12)',
                      overflow: 'hidden',
                    }}>
                      {/* Presets section */}
                      <div style={{ padding: '4px 10px 2px', fontSize: 7, fontWeight: 800, color: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>PRESETS</div>
                      {modePresets.map(preset => (
                        <button key={preset.name} style={menuItemStyle}
                          onClick={() => { setVisParams({ ...preset.params }); setVisMode(preset.mode); localStorage.setItem('retrotv-vismode', preset.mode); setShowPresetsMenu(false) }}
                          onContextMenu={e => { e.preventDefault(); if (!preset.builtIn && confirm(`Delete "${preset.name}"?`)) { const up = loadUserPresets().filter(p => p.name !== preset.name); saveUserPresets(up) } }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >{preset.builtIn ? '' : '* '}{preset.name}</button>
                      ))}
                      {/* Divider */}
                      <div style={{ height: 1, background: 'rgba(0,0,0,0.1)', margin: '2px 0' }} />
                      {showPresetNameInput ? (
                        <div style={{ display: 'flex', gap: 2, padding: '3px 6px' }}>
                          <input
                            autoFocus
                            value={presetNameInput}
                            onChange={e => setPresetNameInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setShowPresetNameInput(false); setPresetNameInput('') } }}
                            placeholder="Name..."
                            style={{
                              flex: 1, height: 20, borderRadius: 2, border: '1px solid rgba(0,0,0,0.2)',
                              background: '#fff', color: '#000', fontSize: 9, padding: '0 4px',
                              fontFamily: 'monospace', outline: 'none',
                            }}
                          />
                          <button onClick={handleSavePreset} style={{
                            ...menuItemStyle, width: 'auto', padding: '2px 6px',
                            background: 'rgba(0,0,0,0.06)', borderRadius: 2,
                          }}>OK</button>
                        </div>
                      ) : (
                        <button style={menuItemStyle} onClick={() => setShowPresetNameInput(true)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >Save preset...</button>
                      )}
                      <button style={menuItemStyle} onClick={handleExport}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >Export JSON</button>
                      <button style={menuItemStyle} onClick={() => importRef.current?.click()}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >Import JSON</button>
                      <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                    </div>
                  )}
                </div>
                </div>{/* end action buttons */}
              </div>{/* end outer flex */}
            </div>
          )
        })()}

        {/* Feet */}
        {!isFullscreen && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 5.5%', marginTop: -1 }}>
            <div style={retroFootStyle} />
            <div style={retroFootStyle} />
          </div>
        )}

        {/* Saved media drawer */}
        {showSaved && (
          <div style={{
            marginTop: 6, borderRadius: 6,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.06)',
            maxHeight: 200, overflowY: 'auto',
          }}>
            {savedList.length === 0 && (
              <div style={{ padding: '12px 10px', color: 'var(--text-20)', fontSize: 'var(--fs-xs)', textAlign: 'center' }}>
                Nenhuma mídia salva
              </div>
            )}
            {savedList.map((item, i) => {
              const ytId = extractYouTubeId(item.url)
              const thumb = item.thumb || (ytId ? ytThumb(ytId) : null)
              return (
                <div
                  key={i}
                  onClick={() => loadSaved(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px',
                    borderBottom: i < savedList.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 48, height: 28, borderRadius: 3, flexShrink: 0, overflow: 'hidden',
                    background: '#1a1c18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                      />
                    ) : (
                      <span style={{ fontSize: 12, opacity: 0.3 }}>🎵</span>
                    )}
                  </div>
                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--fs-xs)', color: 'var(--text-70)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={item.url}>
                      {item.title || item.url}
                    </div>
                    <div style={{ fontSize: 'var(--fs-3xs)', color: 'var(--text-20)', marginTop: 1 }}>
                      {ytId ? 'YouTube' : item.type === 'audio' ? 'Audio' : 'Video'}
                    </div>
                  </div>
                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteSaved(item.url) }}
                    title="Remover"
                    style={{
                      width: 16, height: 16, borderRadius: 3, border: 'none', cursor: 'pointer',
                      background: 'transparent', color: 'var(--text-20)', fontSize: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--status-err)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-20)')}
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}

        {/* URL input — auto-hides when not interacting */}
        <div style={{
          marginTop: 8, display: 'flex', gap: 4, padding: '0 2px',
          opacity: showInput ? 1 : 0,
          maxHeight: showInput ? 36 : 0,
          overflow: 'hidden',
          transition: 'opacity 0.3s, max-height 0.3s',
          pointerEvents: showInput ? 'auto' : 'none',
        }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="YouTube URL ou link direto..."
            style={{
              flex: 1, height: 28, borderRadius: 4,
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', fontSize: 10, padding: '0 8px', outline: 'none',
            }}
          />
          <button onClick={handleSubmit} title="Carregar" style={{
            height: 28, padding: '0 10px', borderRadius: 4,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 10, cursor: 'pointer',
          }}>▶</button>
          {/* Open YouTube link in browser */}
          {youtubeUrl && (
            <button
              onClick={() => window.open(youtubeUrl, '_blank')}
              title="Abrir no YouTube"
              style={{
                height: 28, padding: '0 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 10, cursor: 'pointer',
              }}
            >↗</button>
          )}
          <button onClick={() => fileRef.current?.click()} title="Abrir arquivo" style={{
            height: 28, padding: '0 10px', borderRadius: 4,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 10, cursor: 'pointer',
          }}>📂</button>
          {captureSources.length > 0 && (
            <select
              value={media?.type === 'panel' ? media.panelId : ''}
              onChange={e => {
                const id = e.target.value
                if (!id) { if (media?.type === 'panel') setMedia(null); setPanelSourceId(null); return }
                setPanelSourceId(id)
                setMedia({ type: 'panel', panelId: id })
                setIsOn(true)
              }}
              title="Input de painel"
              style={{
                height: 28, borderRadius: 4, padding: '0 4px',
                background: media?.type === 'panel' ? 'rgba(100,255,150,0.15)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${media?.type === 'panel' ? 'rgba(100,255,150,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: '#fff', fontSize: 9, cursor: 'pointer', outline: 'none',
                maxWidth: 90,
              }}
            >
              <option value="" style={{ background: '#222', color: '#fff' }}>🎛 Panel</option>
              {captureSources.map(src => (
                <option key={src.id} value={src.id} style={{ background: '#222', color: '#fff' }}>
                  {src.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => { const next = !showSaved; setShowSaved(next); if (next) refreshSaved() }}
            title="Salvos"
            style={{
              height: 28, padding: '0 8px', borderRadius: 4,
              background: showSaved ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 10, cursor: 'pointer',
            }}
          >☆</button>
          {media && (
            <button
              onClick={handleSave}
              title="Salvar mídia"
              style={{
                height: 28, padding: '0 8px', borderRadius: 4,
                background: saveFlash === 'saved' ? 'rgba(100,255,100,0.15)' : saveFlash === 'exists' ? 'rgba(255,200,50,0.15)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${saveFlash === 'saved' ? 'rgba(100,255,100,0.3)' : saveFlash === 'exists' ? 'rgba(255,200,50,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: '#fff', fontSize: 10, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >{saveFlash === 'saved' ? '✓ Saved' : saveFlash === 'exists' ? 'Already saved' : '💾'}</button>
          )}
          <input ref={fileRef} type="file" accept="video/*,audio/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>
      </div>
    </Rnd>
  )
}
