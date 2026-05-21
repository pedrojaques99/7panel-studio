import type { AudioBands } from '../visualizer-engine'
import type { VisEngine } from './types'

const DVD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 108">
  <g id="dvd">
    <path d="M21.8 0h11.2L22.4 31.8H37l5.2-14.6h.2c.1 3.1.3 6.3.6 9.5.3 3.1.3 4.1.5 5.1h14.8L69.6 0H58.4l-4.8 8.6h-.2C53.2 5.7 52.8 2.8 52.4 0H38.6L33 14.4h-.2L33.4 0H21.8zM0 31.8h14.4c10.8 0 20.8-5.6 23.8-16.2C41.6 4.2 35.2 0 24 0H9.6L0 31.8zm16-7.2l4.8-17.6c3.8 0 8 0 6.8 8.2-1.4 7.2-5.4 9.4-11.6 9.4zM69.6 31.8h11.2c10.8 0 20.8-5.6 23.8-16.2C108 4.2 101.6 0 90.4 0H76l-6.4 31.8zm16-7.2l6.4-17.6c3.8 0 8 0 6.8 8.2-1.4 7.2-7 9.4-13.2 9.4z"/>
    <ellipse cx="110" cy="28" rx="28" ry="10"/>
    <ellipse cx="110" cy="28" rx="6" ry="4" fill="#000"/>
  </g>
</svg>`

const LOGO_W = 120
const LOGO_H = 62

export class FlowEngine implements VisEngine {
  private x = 0
  private y = 0
  private vx = 2
  private vy = 1.5
  private hue = Math.random() * 360
  private img: HTMLImageElement | null = null
  private imgLoaded = false
  private lastW = 0
  private lastH = 0

  reset() {
    this.x = 0
    this.y = 0
    this.vx = 2
    this.vy = 1.5
    this.hue = Math.random() * 360
    this.img = null
    this.imgLoaded = false
  }

  private ensureImage() {
    if (this.img) return
    this.img = new Image()
    this.img.onload = () => { this.imgLoaded = true }
    this.img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DVD_SVG)}`
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>) {
    this.ensureImage()

    if (this.lastW !== w || this.lastH !== h) {
      this.lastW = w
      this.lastH = h
      this.x = Math.random() * (w - LOGO_W)
      this.y = Math.random() * (h - LOGO_H)
    }

    const speed = (params?.speed ?? 2) + bands.bass * 3 + (bands.beatKick ? 4 : 0)
    const scale = speed / 2

    // clear
    ctx.fillStyle = '#05050f'
    ctx.fillRect(0, 0, w, h)

    // move
    this.x += this.vx * scale
    this.y += this.vy * scale

    let bounced = false
    if (this.x <= 0) { this.x = 0; this.vx = Math.abs(this.vx); bounced = true }
    if (this.x + LOGO_W >= w) { this.x = w - LOGO_W; this.vx = -Math.abs(this.vx); bounced = true }
    if (this.y <= 0) { this.y = 0; this.vy = Math.abs(this.vy); bounced = true }
    if (this.y + LOGO_H >= h) { this.y = h - LOGO_H; this.vy = -Math.abs(this.vy); bounced = true }

    if (bounced || bands.beatSnare) {
      this.hue = (this.hue + 60 + Math.random() * 60) % 360
    }

    // audio-reactive glow
    const glow = 4 + bands.volume * 20 + (bands.beatKick ? 15 : 0)

    ctx.save()
    ctx.translate(this.x, this.y)

    // draw colored logo
    if (this.imgLoaded && this.img) {
      ctx.filter = `hue-rotate(${this.hue}deg) brightness(${1.2 + bands.mid * 0.8}) drop-shadow(0 0 ${glow}px hsl(${this.hue}, 100%, 60%))`
      ctx.drawImage(this.img, 0, 0, LOGO_W, LOGO_H)
      ctx.filter = 'none'
    } else {
      // fallback text
      ctx.font = 'bold 36px Inter, sans-serif'
      ctx.fillStyle = `hsl(${this.hue}, 100%, 60%)`
      ctx.shadowBlur = glow
      ctx.shadowColor = ctx.fillStyle
      ctx.fillText('DVD', 20, 40)
    }

    ctx.restore()
  }
}
