import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

interface Ring {
  radius: number; maxRadius: number; alpha: number
  hue: number; width: number; speed: number
}

export class RingsEngine implements VisEngine {
  private rings: Ring[] = []
  private t = 0
  private beatCool = 0

  reset() { this.rings = []; this.t = 0; this.beatCool = 0 }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    const { bass, mid, volume, subBass, highMid, high, waveform, waveformMix: mix, beatKick, beatSnare, beatHat } = bands
    this.t += 0.016
    this.beatCool = Math.max(0, this.beatCool - 1)

    ctx.fillStyle = `rgba(5, 5, 8, ${0.08 + volume * 0.05})`
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) * 0.45

    // Beat-detected spawns
    if (beatKick) {
      this.rings.push({
        radius: 5, maxRadius: maxR * 0.95,
        alpha: 0.9, hue: (this.t * 40) % 360,
        width: 4 + bass * 4, speed: (params?.ringSpeed ?? 2) + 6,
      })
    }
    if (beatSnare) {
      this.rings.push({
        radius: 8, maxRadius: maxR * 0.6,
        alpha: 0.6, hue: (this.t * 60 + 180) % 360,
        width: 2 + mid * 2, speed: (params?.ringSpeed ?? 2) + 3,
      })
    }
    if (beatHat) {
      for (let h2 = 0; h2 < 3; h2++) {
        this.rings.push({
          radius: 3, maxRadius: maxR * (0.2 + Math.random() * 0.2),
          alpha: 0.4, hue: (this.t * 80 + h2 * 120) % 360,
          width: 0.5, speed: 4 + Math.random() * 3,
        })
      }
    }
    // Fallback ambient rings when no beat detection fires
    if (!beatKick && bass > (params?.beatThresh ?? 0.5) && this.beatCool <= 0) {
      this.rings.push({
        radius: 5, maxRadius: maxR * (0.5 + bass * 0.5),
        alpha: 0.6 + volume * 0.4, hue: (this.t * 40) % 360,
        width: 2 + bass * 4, speed: (params?.ringSpeed ?? 2) + bass * 4,
      })
      this.beatCool = 5
    }
    if (Math.random() < 0.03 + mid * 0.05) {
      this.rings.push({
        radius: 2, maxRadius: maxR * (0.3 + mid * 0.4),
        alpha: 0.2 + mid * 0.3, hue: (this.t * 60 + 120) % 360,
        width: 0.5 + mid * 2, speed: 1 + mid * 2,
      })
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.radius += r.speed
      const age = r.radius / r.maxRadius
      const a = r.alpha * (1 - age * age)

      if (a > 0.01 && r.radius < r.maxRadius) {
        if (waveform && waveform.length > 0 && mix > 0) {
          const steps = Math.min(128, waveform.length)
          ctx.beginPath()
          for (let s = 0; s <= steps; s++) {
            const angle = (s / steps) * Math.PI * 2
            const wfIdx = Math.floor((s / steps) * waveform.length)
            const wfVal = waveform[wfIdx] ?? 0
            const modRadius = r.radius + wfVal * r.radius * 0.25 * mix
            const px = cx + Math.cos(angle) * modRadius
            const py = cy + Math.sin(angle) * modRadius
            s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
          }
          ctx.closePath()
        } else {
          ctx.beginPath()
          ctx.arc(cx, cy, r.radius, 0, Math.PI * 2)
        }
        const hs = params?.hueShift ?? 0
        ctx.strokeStyle = `hsla(${(r.hue + hs) % 360}, 70%, 60%, ${a})`
        ctx.lineWidth = r.width * (1 - age * 0.5)
        ctx.shadowColor = `hsla(${(r.hue + hs) % 360}, 80%, 70%, ${a * 0.5})`
        ctx.shadowBlur = (params?.glow ?? 6) + volume * 8
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      if (r.radius >= r.maxRadius) this.rings.splice(i, 1)
    }

    const maxRings = params?.maxRings ?? 40
    if (this.rings.length > maxRings) this.rings.splice(0, this.rings.length - maxRings)

    // Rotating outer arcs — waveform modulates arc radius
    const arcCount = 6
    for (let i = 0; i < arcCount; i++) {
      const angle = (i / arcCount) * Math.PI * 2 + this.t * (params?.arcSpeed ?? 0.5)
      const band = [subBass, bass, mid, highMid, high, volume][i]
      const r = maxR * 0.6 + band * maxR * 0.35
      const a = 0.1 + band * 0.3
      ctx.beginPath()
      ctx.arc(cx, cy, r, angle, angle + 0.3 + band * 0.4)
      ctx.strokeStyle = `hsla(${(i * 60 + this.t * 20 + (params?.hueShift ?? 0)) % 360}, 60%, 55%, ${a})`
      ctx.lineWidth = 1 + band * 2
      ctx.stroke()
    }
  }
}
