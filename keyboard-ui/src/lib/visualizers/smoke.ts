import { createNoise2D } from 'simplex-noise'
import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

interface SmokeParticle {
  x: number; y: number; vx: number; vy: number
  size: number; life: number; maxLife: number
  hue: number; alpha: number
}

export class SmokeEngine implements VisEngine {
  private particles: SmokeParticle[] = []
  private noise = createNoise2D()
  private t = 0

  reset() {
    this.particles = []
    this.noise = createNoise2D()
    this.t = 0
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    const { bass, mid, volume, subBass, high, waveform, waveformMix: mix, beatKick, beatSnare, energyDelta } = bands
    this.t += 0.01

    ctx.fillStyle = `rgba(8, 8, 10, ${0.06 + volume * 0.04})`
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2

    let wfPeak = 0
    if (waveform && waveform.length > 0 && mix > 0) {
      for (let i = 0; i < waveform.length; i++) {
        const abs = Math.abs(waveform[i])
        if (abs > wfPeak) wfPeak = abs
      }
    }
    const reactivity = volume * (1 - mix) + wfPeak * mix
    const kickBurst = beatKick ? 3 : 1
    const spawnRate = ((params?.spawnRate ?? 2) + Math.floor(reactivity * 8)) * kickBurst

    for (let i = 0; i < spawnRate; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 5 + Math.random() * 15

      let dirBias = 0
      if (waveform && waveform.length > 0 && mix > 0) {
        const sampleIdx = Math.floor(Math.random() * waveform.length)
        dirBias = waveform[sampleIdx] * 3 * mix
      }

      this.particles.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 0.5 + dirBias,
        vy: (params?.rise ?? -0.5) - Math.random() * 1.5 - bass * 2,
        size: (params?.size ?? 8) + Math.random() * 20 + reactivity * 30 + (beatKick ? 25 : 0),
        life: 80 + Math.random() * 60,
        maxLife: 80 + Math.random() * 60,
        hue: 200 + Math.random() * 40 + mid * 80 + (beatSnare ? 60 : 0),
        alpha: 0.15 + reactivity * 0.2,
      })
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      const n = this.noise(p.x * (params?.turbulence ?? 0.005) + this.t, p.y * (params?.turbulence ?? 0.005))
      p.vx += Math.cos(n * Math.PI * 2) * 0.1 * (1 + high)
      p.vy += Math.sin(n * Math.PI * 2) * 0.05 - 0.02
      p.vx *= 0.98; p.vy *= 0.98
      p.x += p.vx; p.y += p.vy
      p.life--

      const age = p.life / p.maxLife
      const a = age * p.alpha

      if (a > 0.005) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + (1 - age) * 0.8))
        const hs = (p.hue + (params?.hueShift ?? 0)) % 360
        grad.addColorStop(0, `hsla(${hs}, 30%, 60%, ${a})`)
        grad.addColorStop(0.5, `hsla(${hs}, 20%, 40%, ${a * 0.4})`)
        grad.addColorStop(1, `hsla(${hs}, 10%, 20%, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + (1 - age) * 0.8), 0, Math.PI * 2)
        ctx.fill()
      }

      if (p.life <= 0) this.particles.splice(i, 1)
    }

    const maxP = params?.maxPart ?? 500
    if (this.particles.length > maxP) this.particles.splice(0, this.particles.length - maxP)

    const glowReact = volume * (1 - mix) + wfPeak * mix
    const edBoost = Math.max(0, energyDelta) * 40
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 + subBass * 60 + edBoost)
    glow.addColorStop(0, `rgba(200, 180, 255, ${0.1 + glowReact * 0.15})`)
    glow.addColorStop(1, 'rgba(200, 180, 255, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, 40 + subBass * 60, 0, Math.PI * 2)
    ctx.fill()
  }
}
