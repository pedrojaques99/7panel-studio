import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=<>{}[]|/\\~^'
const KANJI = '音波光闇風火水雷夢幻星空月雨雪花鳥魚龍虎'

interface Glyph {
  x: number; y: number; char: string
  size: number; life: number; maxLife: number
  hue: number; vx: number; vy: number
  set: 'latin' | 'kanji'
}

export class LettersEngine implements VisEngine {
  private glyphs: Glyph[] = []
  private t = 0

  reset() { this.glyphs = []; this.t = 0 }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    const { bass, mid, high, volume, subBass, highMid, waveform, waveformMix: mix, beatKick, beatSnare, beatHat } = bands
    this.t += 0.016

    let rawPeak = volume
    if (waveform && waveform.length > 0 && mix > 0) {
      let peak = 0
      for (let i = 0; i < waveform.length; i++) {
        const abs = Math.abs(waveform[i])
        if (abs > peak) peak = abs
      }
      rawPeak = peak
    }
    const wfPeak = volume * (1 - mix) + rawPeak * mix

    ctx.fillStyle = `rgba(5, 5, 12, ${0.08 + wfPeak * 0.06})`
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2
    const spawnCount = (params?.spawnBase ?? 1) + Math.floor(wfPeak * 5) + (beatKick ? 8 : 0)

    for (let i = 0; i < spawnCount; i++) {
      const useKanji = beatKick ? true : Math.random() < (params?.kanjiRatio ?? 0.3)
      const set = useKanji ? KANJI : GLYPHS
      const a = Math.random() * Math.PI * 2
      const r = 10 + Math.random() * 30
      const speed = (params?.speed ?? 0.5) + wfPeak * 3

      let angleBias = 0
      if (waveform && waveform.length > 0 && mix > 0) {
        const sampleIdx = Math.floor(Math.random() * waveform.length)
        angleBias = waveform[sampleIdx] * 2 * mix
      }

      this.glyphs.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        char: set[Math.floor(Math.random() * set.length)],
        size: (params?.glyphSize ?? 8) + Math.random() * 16 + bass * 20,
        life: 60 + Math.random() * 60,
        maxLife: 60 + Math.random() * 60,
        hue: Math.random() * 360,
        vx: Math.cos(a) * speed + angleBias,
        vy: Math.sin(a) * speed,
        set: useKanji ? 'kanji' : 'latin',
      })
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i]
      g.x += g.vx
      g.y += g.vy
      g.vx *= 0.98
      g.vy *= 0.98
      g.life--

      const age = g.life / g.maxLife
      const a = age * (0.5 + wfPeak * 0.5)

      if (a > 0.01) {
        const pulse = 1 + (g.set === 'kanji' ? subBass : mid) * 0.3
        const sz = g.size * pulse * (0.5 + age * 0.5)

        ctx.font = `${g.set === 'kanji' ? '600' : '700'} ${sz}px ${g.set === 'kanji' ? 'serif' : 'monospace'}`
        const gh = (g.hue + (params?.hueShift ?? 0)) % 360
        const snareBoost = beatSnare ? 25 : 0
        ctx.fillStyle = `hsla(${gh}, 60%, ${60 + snareBoost}%, ${Math.min(1, a + (beatSnare ? 0.3 : 0))})`

        if (a > 0.3) {
          ctx.shadowColor = `hsla(${gh}, 80%, 70%, ${a * 0.4})`
          ctx.shadowBlur = 4 + wfPeak * 6
        }

        ctx.fillText(g.char, g.x, g.y)
        ctx.shadowBlur = 0
      }

      if (g.life <= 0) this.glyphs.splice(i, 1)
    }

    const maxG = params?.maxGlyphs ?? 300
    if (this.glyphs.length > maxG) this.glyphs.splice(0, this.glyphs.length - maxG)

    // Matrix rain on high frequencies or hat beats
    if (high > 0.3 || beatHat) {
      const cols = 4 + Math.floor(highMid * 8) + (beatHat ? 6 : 0)
      ctx.font = '700 10px monospace'
      for (let c = 0; c < cols; c++) {
        const x = Math.random() * w
        const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        ctx.fillStyle = `rgba(80, 255, 120, ${(high - 0.3) * 0.15})`
        ctx.fillText(char, x, Math.random() * h)
      }
    }
  }
}
