import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

export class ScopeEngine implements VisEngine {
  private phase = 0
  private history: Float32Array[] = []

  reset() { this.phase = 0; this.history = []; this.beatFlash = 0 }

  private beatFlash = 0

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    const trail = params?.trail ?? 0.15
    const glow = params?.glow ?? 8
    const lineW = params?.lineWidth ?? 1.5
    const maxHist = params?.history ?? 8
    const { bass, volume, waveform, waveformMix: mix, beatKick, beatSnare, beatHat, energyDelta } = bands
    const hueShift = params?.hueShift ?? 0
    const hue = (120 + hueShift) % 360

    if (beatKick) this.beatFlash = 1
    this.beatFlash *= 0.85

    // Trail fade — slower on beats for afterimage
    ctx.fillStyle = `hsla(${hue}, 40%, 3%, ${trail * (1 - this.beatFlash * 0.6)})`
    ctx.fillRect(0, 0, w, h)

    // Grid
    ctx.strokeStyle = `hsla(${hue}, 50%, 30%, 0.08)`
    ctx.lineWidth = 0.5
    const gx = 10, gy = 8
    for (let i = 0; i <= gx; i++) {
      const x = (i / gx) * w
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let i = 0; i <= gy; i++) {
      const y = (i / gy) * h
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    const cy = h / 2

    // Always generate synthetic wave (needed for fallback and blending)
    const { mid, highMid, subBass } = bands
    const freq = (params?.freq ?? 2) + mid * 6
    const phaseSpeed = params?.phaseSpeed ?? 0.02
    this.phase += phaseSpeed + bass * 0.08
    const amp = 0.3 + volume * 0.7
    const synthPts = new Float32Array(w)
    for (let i = 0; i < w; i++) {
      const x = i / w
      let y = Math.sin(x * Math.PI * 2 * freq + this.phase) * amp
      y += Math.sin(x * Math.PI * 2 * freq * 2.01 + this.phase * 1.5) * amp * 0.3 * highMid
      y += Math.cos(x * Math.PI * 2 * 0.5 + this.phase * 0.3) * amp * 0.5 * subBass
      synthPts[i] = y
    }

    // Real waveform resampled to screen width
    let realPts: Float32Array | null = null
    if (waveform && waveform.length > 0 && mix > 0) {
      realPts = new Float32Array(w)
      const ratio = waveform.length / w
      for (let i = 0; i < w; i++) {
        const srcIdx = i * ratio
        const lo = Math.floor(srcIdx)
        const hi = Math.min(lo + 1, waveform.length - 1)
        const frac = srcIdx - lo
        realPts[i] = waveform[lo] * (1 - frac) + waveform[hi] * frac
      }
    }

    // Blend synthetic and real based on waveformMix
    const pts = new Float32Array(w)
    for (let i = 0; i < w; i++) {
      const s = synthPts[i]
      const r = realPts ? realPts[i] : s
      pts[i] = s * (1 - mix) + r * mix
    }

    // Push to history
    this.history.push(pts)
    if (this.history.length > maxHist) this.history.shift()

    // Draw history (ghosting)
    for (let hi = 0; hi < this.history.length; hi++) {
      const age = (hi + 1) / this.history.length
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${age * 0.15})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      const row = this.history[hi]
      for (let i = 0; i < row.length; i++) {
        const y = cy - row[i] * (h * 0.45)
        i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
      }
      ctx.stroke()
    }

    // Main trace — beatKick brightens, beatSnare boosts glow, energyDelta widens
    const kickBoost = this.beatFlash
    ctx.strokeStyle = `hsla(${hue}, 80%, ${65 + kickBoost * 30}%, ${0.7 + volume * 0.3 + kickBoost * 0.3})`
    ctx.lineWidth = lineW + bass * 2 + kickBoost * 3 + Math.max(0, energyDelta) * 4
    ctx.shadowColor = `hsla(${hue}, 80%, 70%, ${0.8 + (beatSnare ? 0.2 : 0)})`
    ctx.shadowBlur = glow + volume * 12 + (beatSnare ? 20 : 0) + kickBoost * 15
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      const y = cy - pts[i] * (h * 0.45)
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Center line
    ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.06)`
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke()
  }
}
