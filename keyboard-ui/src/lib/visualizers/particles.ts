import { createNoise2D } from 'simplex-noise'
import type { AudioBands } from '../visualizer-engine'

const PHI = 1.61803398875
const GOLDEN_ANGLE = (Math.PI * 2) / (PHI * PHI)

interface Particle {
  x: number; y: number; vx: number; vy: number
  trail: { x: number; y: number }[]
  life: number; maxLife: number; hue: number
}

function spawn(cx: number, cy: number, life: number): Particle {
  const a = Math.random() * Math.PI * 2
  return {
    x: cx + (Math.random() - 0.5) * 40, y: cy + (Math.random() - 0.5) * 40,
    vx: Math.cos(a), vy: Math.sin(a),
    trail: [], life, maxLife: life, hue: Math.random() * 360,
  }
}

export interface ParticleParams {
  speed: number
  branching: number
  complexity: number
  tension: number
  maxParticles: number
  lifespan: number
  trailLen: number
  fade: number
  hueShift: number
}

export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  speed: 1.6, branching: 0.3, complexity: 1.2, tension: 0.12,
  maxParticles: 600, lifespan: 300, trailLen: 16, fade: 0.04,
}

export class ParticleEngine {
  private particles: Particle[] = []
  private noise2D = createNoise2D()

  reset() {
    this.particles = []
    this.noise2D = createNoise2D()
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Partial<ParticleParams>) {
    const cfg = { ...DEFAULT_PARTICLE_PARAMS, ...params }
    const { bass, mid, high, volume, subBass, waveform, waveformMix: mix, beatKick, beatSnare, beatHat } = bands

    let rawRms = volume
    let rawPeak = volume
    if (waveform && waveform.length > 0 && mix > 0) {
      let sumSq = 0
      let peak = 0
      for (let i = 0; i < waveform.length; i++) {
        sumSq += waveform[i] * waveform[i]
        const abs = Math.abs(waveform[i])
        if (abs > peak) peak = abs
      }
      rawRms = Math.sqrt(sumSq / waveform.length)
      rawPeak = peak
    }
    const wfRms = volume * (1 - mix) + rawRms * mix
    const wfPeak = volume * (1 - mix) + rawPeak * mix

    const speed = cfg.speed + bass * 3 + (beatHat ? 3 : 0)
    const branching = Math.min(1, cfg.branching + mid * 0.5 + (beatSnare ? 0.4 : 0))
    const complexity = cfg.complexity + high * 2
    const tension = cfg.tension + subBass * 0.15
    const maxP = cfg.maxParticles + Math.floor(wfPeak * 600)
    const lifespan = cfg.lifespan

    ctx.fillStyle = `rgba(10, 12, 8, ${Math.max(0.01, cfg.fade + wfRms * 0.05)})`
    ctx.fillRect(0, 0, w, h)

    const newParts: Particle[] = []

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      const ns = 0.002 * complexity
      const n = this.noise2D(p.x * ns, p.y * ns)
      const ta = n * Math.PI * 2 * PHI

      let wfNudge = 0
      if (waveform && waveform.length > 0 && mix > 0) {
        const sampleIdx = Math.floor((p.x / w) * waveform.length) % waveform.length
        wfNudge = (waveform[Math.abs(sampleIdx)] ?? 0) * 2 * mix
      }

      p.vx += Math.cos(ta) * tension
      p.vy += Math.sin(ta) * tension + wfNudge * 0.3
      const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1
      p.vx = (p.vx / mag) * speed * 0.98
      p.vy = (p.vy / mag) * speed * 0.98
      p.x += p.vx; p.y += p.vy
      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > cfg.trailLen) p.trail.shift()

      if (Math.random() < branching * 0.03 && p.life > 10 && this.particles.length + newParts.length < maxP) {
        const dir = Math.random() > 0.5 ? 1 : -1
        const ao = GOLDEN_ANGLE * dir, cos = Math.cos(ao), sin = Math.sin(ao)
        newParts.push({
          x: p.x, y: p.y,
          vx: (p.vx * cos - p.vy * sin) * 0.9,
          vy: (p.vx * sin + p.vy * cos) * 0.9,
          trail: [{ x: p.x, y: p.y }],
          life: p.life * (1 / PHI), maxLife: p.life * (1 / PHI),
          hue: (p.hue + 30) % 360,
        })
      }

      p.life--
      if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
        this.particles.splice(i, 1); continue
      }

      if (p.trail.length >= 2) {
        const alpha = (p.life / p.maxLife) * (0.4 + wfRms * 0.4)
        ctx.beginPath()
        ctx.moveTo(p.trail[0].x, p.trail[0].y)
        for (let j = 1; j < p.trail.length; j++) {
          const xc = (p.trail[j].x + p.trail[j - 1].x) / 2
          const yc = (p.trail[j].y + p.trail[j - 1].y) / 2
          ctx.quadraticCurveTo(p.trail[j - 1].x, p.trail[j - 1].y, xc, yc)
        }
        ctx.strokeStyle = `hsla(${(p.hue + (cfg.hueShift || 0)) % 360}, 60%, 55%, ${alpha})`
        ctx.lineWidth = Math.max(0.3, alpha * (1.2 + bass * 3) + 0.5)
        ctx.stroke()

        const dot = (1 + wfPeak * 4) * alpha
        if (dot > 0.3) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, dot, 0, Math.PI * 2)
          ctx.fillStyle = ctx.strokeStyle
          ctx.fill()
        }
      }
    }

    this.particles.push(...newParts)

    // beatKick: burst 5-10 particles from center
    if (beatKick) {
      const burst = 5 + Math.floor(Math.random() * 6)
      for (let i = 0; i < burst; i++) this.particles.push(spawn(w / 2, h / 2, lifespan))
    }

    if (this.particles.length < 3) {
      for (let i = 0; i < 2; i++) this.particles.push(spawn(w / 2, h / 2, lifespan))
    }
  }
}
