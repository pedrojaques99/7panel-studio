import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

export class GridEngine implements VisEngine {
  private t = 0
  private prevCols = new Float32Array(32)
  private kickFlash = 0
  private scanReverse = false

  reset() { this.t = 0; this.prevCols.fill(0); this.kickFlash = 0; this.scanReverse = false }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    const { bass, mid, highMid, volume, subBass, high, lowMid, waveform, waveformMix: mix, beatKick, beatSnare, beatHat } = bands

    if (beatKick) this.kickFlash = 1
    if (beatSnare) this.scanReverse = !this.scanReverse
    this.kickFlash *= 0.88
    this.t += 0.016

    ctx.fillStyle = '#0a0a18'
    ctx.fillRect(0, 0, w, h)

    const cols = params?.cols ?? 32
    const rows = params?.rows ?? 14
    if (this.prevCols.length !== cols) this.prevCols = new Float32Array(cols)
    const gap = 2
    const cellW = (w - gap * (cols + 1)) / cols
    const cellH = (h - gap * (rows + 1)) / rows
    const bandArr = [subBass, bass, lowMid, mid, highMid, high, volume]

    const wfCols = new Float32Array(cols)
    if (waveform && waveform.length > 0 && mix > 0) {
      const ratio = waveform.length / cols
      for (let c = 0; c < cols; c++) {
        const lo = Math.floor(c * ratio)
        const hi = Math.min(Math.floor((c + 1) * ratio), waveform.length)
        let sum = 0
        for (let j = lo; j < hi; j++) sum += Math.abs(waveform[j])
        wfCols[c] = hi > lo ? sum / (hi - lo) : 0
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gap + c * (cellW + gap)
        const y = gap + r * (cellH + gap)

        const bandIdx = Math.floor((c / cols) * 7)
        const band = bandArr[bandIdx]
        const rowFactor = 1 - Math.abs(r - rows / 2) / (rows / 2)

        const wfEnergy = wfCols[c] * 2
        const blended = band * (1 - mix) + (band * 0.4 + wfEnergy * 0.6) * mix

        this.prevCols[c] += (blended - this.prevCols[c]) * 0.3
        const v = this.prevCols[c] * rowFactor

        const heightScale = 0.3 + v * 0.7
        const drawH = cellH * heightScale
        const drawY = y + (cellH - drawH) / 2

        const hue = (bandIdx * 50 + this.t * 15 + (params?.hueShift ?? 0)) % 360
        const sat = 50 + v * 30
        const light = 30 + v * 40
        const alpha = 0.3 + v * 0.7

        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
        ctx.fillRect(x, drawY, cellW, drawH)

        if (v > (params?.glowThresh ?? 0.5)) {
          ctx.shadowColor = `hsla(${hue}, 80%, 60%, ${(v - 0.5) * 0.6})`
          ctx.shadowBlur = 4
          ctx.fillRect(x, drawY, cellW, drawH)
          ctx.shadowBlur = 0
        }
      }
    }

    // Beat kick white flash overlay
    if (this.kickFlash > 0.05) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.kickFlash * 0.12})`
      ctx.fillRect(0, 0, w, h)
    }

    // Beat hat sparkle
    if (beatHat) {
      for (let s = 0; s < 6; s++) {
        const sx = Math.random() * w, sy = Math.random() * h
        ctx.fillStyle = `rgba(255, 255, 255, 0.5)`
        ctx.fillRect(sx, sy, cellW, cellH * 0.3)
      }
    }

    // Scan line — reverses on snare
    const scanDir = this.scanReverse ? -1 : 1
    const scanX = ((this.t * (params?.scanSpeed ?? 80) * scanDir + bass * 200) % (w + 40) + w + 40) % (w + 40) - 20
    ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + volume * 0.03})`
    ctx.fillRect(scanX - 2, 0, 4, h)
  }
}
