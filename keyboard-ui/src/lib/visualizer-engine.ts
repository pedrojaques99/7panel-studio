import { getSharedAudioContext } from './audio-context'

// ── Types ──

export interface AudioBands {
  subBass: number; bass: number; lowMid: number
  mid: number; highMid: number; high: number
  volume: number
  waveform: Float32Array | null
  /** 0 = bands only, 1 = full waveform reactivity — set by global WAVE knob */
  waveformMix: number
  beatKick: boolean
  beatSnare: boolean
  beatHat: boolean
  energy: number
  energyDelta: number
}

export const ZERO_BANDS: AudioBands = {
  subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0, volume: 0,
  waveform: null, waveformMix: 1,
  beatKick: false, beatSnare: false, beatHat: false, energy: 0, energyDelta: 0,
}

// ── Source management (one MediaElementSource per element, ever) ──

const sourceMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

export function getOrCreateSource(el: HTMLMediaElement): MediaElementAudioSourceNode {
  let src = sourceMap.get(el)
  if (!src) {
    const ctx = getSharedAudioContext()
    src = ctx.createMediaElementSource(el)
    src.connect(ctx.destination)
    sourceMap.set(el, src)
  }
  return src
}

// ── Analyser pipeline ──

export interface AnalyserPipeline {
  analyser: AnalyserNode
  data: Uint8Array<ArrayBuffer>
  cleanup: () => void
}

export function createAnalyserPipeline(el: HTMLMediaElement, fftSize = 256): AnalyserPipeline | null {
  try {
    const ctx = getSharedAudioContext()
    const source = getOrCreateSource(el)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = fftSize
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    return { analyser, data, cleanup: () => { try { source.disconnect(analyser) } catch { /* */ } } }
  } catch {
    return null
  }
}

export function createAnalyserWhenReady(
  el: HTMLMediaElement,
  fftSize: number,
  onReady: (pipeline: AnalyserPipeline) => void,
): () => void {
  const tryConnect = () => {
    const p = createAnalyserPipeline(el, fftSize)
    if (p) onReady(p)
  }
  if (el.readyState >= 1) {
    tryConnect()
  } else {
    el.addEventListener('canplay', tryConnect, { once: true })
  }
  return () => el.removeEventListener('canplay', tryConnect)
}

// ── Band reading ──

const waveformCache = new WeakMap<AnalyserNode, Float32Array>()

export function readBands(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): AudioBands {
  analyser.getByteFrequencyData(data)
  const len = data.length
  const binHz = (analyser.context.sampleRate || 44100) / analyser.fftSize
  const band = (lo: number, hi: number) => {
    const s = Math.floor(lo / binHz), e = Math.min(Math.ceil(hi / binHz), len - 1)
    let sum = 0, c = 0
    for (let i = s; i <= e; i++) { sum += data[i]; c++ }
    return c > 0 ? (sum / c) / 255 : 0
  }

  let wf = waveformCache.get(analyser)
  if (!wf || wf.length !== analyser.fftSize) {
    wf = new Float32Array(analyser.fftSize)
    waveformCache.set(analyser, wf)
  }
  analyser.getFloatTimeDomainData(wf)

  return {
    subBass: band(20, 60), bass: band(60, 250), lowMid: band(250, 500),
    mid: band(500, 2000), highMid: band(2000, 4000), high: band(4000, 12000),
    volume: band(20, 20000),
    waveform: wf,
    waveformMix: 1,
    beatKick: false, beatSnare: false, beatHat: false, energy: 0, energyDelta: 0,
  }
}

// ── Stream-based analyser (for panel capture buses) ──

const streamSourceMap = new WeakMap<MediaStream, MediaStreamAudioSourceNode>()

export interface StreamAnalyserPipeline {
  analyser: AnalyserNode
  data: Uint8Array<ArrayBuffer>
  cleanup: () => void
}

export function createStreamAnalyser(stream: MediaStream, fftSize = 256): StreamAnalyserPipeline | null {
  try {
    const ctx = getSharedAudioContext()
    let source = streamSourceMap.get(stream)
    if (!source) {
      source = ctx.createMediaStreamSource(stream)
      streamSourceMap.set(stream, source)
    }
    const analyser = ctx.createAnalyser()
    analyser.fftSize = fftSize
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    return {
      analyser,
      data,
      cleanup: () => { try { source!.disconnect(analyser) } catch { /* */ } },
    }
  } catch {
    return null
  }
}

// ── Beat detection ──

const HISTORY_LEN = 20

class BeatDetector {
  private bassHist: number[] = []
  private midHist: number[] = []
  private highHist: number[] = []
  private kickCool = 0
  private snareCool = 0
  private hatCool = 0
  private prevEnergy = 0

  detect(bands: AudioBands): AudioBands {
    const { bass, mid, high, volume, waveform } = bands

    this.bassHist.push(bass)
    this.midHist.push(mid)
    this.highHist.push(high)
    if (this.bassHist.length > HISTORY_LEN) this.bassHist.shift()
    if (this.midHist.length > HISTORY_LEN) this.midHist.shift()
    if (this.highHist.length > HISTORY_LEN) this.highHist.shift()

    const avg = (arr: number[]) => {
      let s = 0
      for (let i = 0; i < arr.length; i++) s += arr[i]
      return arr.length > 0 ? s / arr.length : 0
    }

    this.kickCool = Math.max(0, this.kickCool - 1)
    this.snareCool = Math.max(0, this.snareCool - 1)
    this.hatCool = Math.max(0, this.hatCool - 1)

    let beatKick = false
    let beatSnare = false
    let beatHat = false

    if (this.kickCool <= 0 && bass > avg(this.bassHist) * 1.4 && bass > 0.15) {
      beatKick = true
      this.kickCool = 8
    }
    if (this.snareCool <= 0 && mid > avg(this.midHist) * 1.3 && mid > 0.1) {
      beatSnare = true
      this.snareCool = 5
    }
    if (this.hatCool <= 0 && high > avg(this.highHist) * 1.3 && high > 0.08) {
      beatHat = true
      this.hatCool = 3
    }

    let energy = volume
    if (waveform && waveform.length > 0) {
      let sumSq = 0
      for (let i = 0; i < waveform.length; i++) sumSq += waveform[i] * waveform[i]
      energy = Math.sqrt(sumSq / waveform.length)
    }
    const energyDelta = energy - this.prevEnergy
    this.prevEnergy = energy

    return { ...bands, beatKick, beatSnare, beatHat, energy, energyDelta }
  }
}

const beatDetector = new BeatDetector()

export function detectBeats(bands: AudioBands): AudioBands {
  return beatDetector.detect(bands)
}

// ── Smoothing ──

export function smoothBands(prev: AudioBands, next: AudioBands, t = 0.25): AudioBands {
  const l = (a: number, b: number) => a + (b - a) * t
  return {
    subBass: l(prev.subBass, next.subBass), bass: l(prev.bass, next.bass),
    lowMid: l(prev.lowMid, next.lowMid), mid: l(prev.mid, next.mid),
    highMid: l(prev.highMid, next.highMid), high: l(prev.high, next.high),
    volume: l(prev.volume, next.volume),
    waveform: next.waveform,
    waveformMix: next.waveformMix,
    beatKick: next.beatKick,
    beatSnare: next.beatSnare,
    beatHat: next.beatHat,
    energy: next.energy,
    energyDelta: next.energyDelta,
  }
}
