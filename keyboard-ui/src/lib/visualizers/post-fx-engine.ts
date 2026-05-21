import type { AudioBands } from '../visualizer-engine'
import { POST_FX_LIST, type PostFxId } from './post-fx-shaders'

const VERT = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}`

interface FxSlot {
  id: PostFxId
  program: WebGLProgram | null
  compileFailed: boolean
  uTime: WebGLUniformLocation | null
  uRes: WebGLUniformLocation | null
  uIntensity: WebGLUniformLocation | null
  uAudio: WebGLUniformLocation | null
  uTexture: WebGLUniformLocation | null
  frag: string
}

export class PostFxEngine {
  private gl: WebGLRenderingContext | null = null
  private glCanvas: HTMLCanvasElement | null = null
  private overlay: HTMLCanvasElement | null = null
  private overlayCtx: CanvasRenderingContext2D | null = null
  private slots: FxSlot[] = []
  private activeIds = new Set<PostFxId>()
  private intensities = new Map<PostFxId, number>()
  private vsBuf: WebGLBuffer | null = null
  private fb: WebGLFramebuffer | null = null
  private texA: WebGLTexture | null = null
  private texB: WebGLTexture | null = null
  private sourceTexture: WebGLTexture | null = null
  private startTime = performance.now()
  private texW = 0
  private texH = 0
  private useCanvas2D = false
  private tempCanvas: HTMLCanvasElement | null = null
  private tempCtx: CanvasRenderingContext2D | null = null
  private _srcLogged = false
  flipY = false

  init(canvas: HTMLCanvasElement): boolean {
    this.overlay = canvas
    this.overlayCtx = canvas.getContext('2d')
    if (!this.overlayCtx) return false

    // Try WebGL on an offscreen canvas
    this.glCanvas = document.createElement('canvas')
    const gl = this.glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true })
    if (gl && !gl.isContextLost()) {
      this.gl = gl
      this.setupGl(gl)
    } else {
      console.warn('[PostFx] WebGL unavailable, using Canvas2D fallback')
      this.useCanvas2D = true
      this.glCanvas = null
    }

    this.tempCanvas = document.createElement('canvas')
    this.tempCtx = this.tempCanvas.getContext('2d')
    return true
  }

  private setupGl(gl: WebGLRenderingContext) {
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    this.vsBuf = buf
    this.fb = gl.createFramebuffer()
    this.sourceTexture = gl.createTexture()
    this.texA = this.createTex(gl)
    this.texB = this.createTex(gl)
    this.texW = 0; this.texH = 0

    if (this.slots.length === 0) {
      for (const def of POST_FX_LIST) {
        this.slots.push({
          id: def.id, program: null, compileFailed: false,
          uTime: null, uRes: null, uIntensity: null, uAudio: null, uTexture: null,
          frag: def.frag,
        })
      }
    } else {
      this.slots.forEach(s => { s.program = null; s.compileFailed = false })
    }
    this.startTime = performance.now()
  }

  setActive(id: PostFxId, on: boolean) {
    if (on) this.activeIds.add(id); else this.activeIds.delete(id)
  }
  isActive(id: PostFxId): boolean { return this.activeIds.has(id) }
  setIntensity(id: PostFxId, v: number) { this.intensities.set(id, v) }
  getIntensity(id: PostFxId): number { return this.intensities.get(id) ?? 1 }
  get hasActive(): boolean { return this.activeIds.size > 0 }

  draw(source: HTMLCanvasElement | HTMLDivElement, bands: AudioBands) {
    const c = this.overlay
    if (!c || this.activeIds.size === 0) { if (c) c.style.visibility = 'hidden'; return }

    if (this.useCanvas2D || !this.gl || this.gl.isContextLost()) {
      if (!this.useCanvas2D) this.useCanvas2D = true
      this.drawCanvas2D(source, c, bands)
      return
    }
    this.drawWebGL(source, c, bands)
  }

  // ── Canvas 2D fallback ──
  private drawCanvas2D(source: HTMLCanvasElement | HTMLDivElement, c: HTMLCanvasElement, bands: AudioBands) {
    let sourceEl: HTMLCanvasElement | null = null
    if (source instanceof HTMLCanvasElement) sourceEl = source
    else sourceEl = source.querySelector('canvas')
    if (!sourceEl || sourceEl.width === 0) { c.style.visibility = 'hidden'; return }

    c.style.visibility = 'visible'
    const dpr = window.devicePixelRatio || 1
    const cw = c.offsetWidth || 320
    const ch = c.offsetHeight || 240
    const pw = Math.round(cw * dpr)
    const ph = Math.round(ch * dpr)
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph }

    const ctx = this.overlayCtx
    if (!ctx) return

    ctx.clearRect(0, 0, pw, ph)
    if (this.flipY) {
      ctx.save()
      ctx.translate(0, ph)
      ctx.scale(1, -1)
      ctx.drawImage(sourceEl, 0, 0, pw, ph)
      ctx.restore()
    } else {
      ctx.drawImage(sourceEl, 0, 0, pw, ph)
    }

    if (this.activeIds.has('chromatic')) {
      const int = this.intensities.get('chromatic') ?? 1
      const off = Math.round((2 + bands.bass * 4) * int * dpr)
      if (off > 0) {
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.5 * int
        ctx.drawImage(c, off, 0, pw, ph)
        ctx.drawImage(c, -off, 0, pw, ph)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }

    if (this.activeIds.has('bloom') && this.tempCanvas && this.tempCtx) {
      const int = this.intensities.get('bloom') ?? 1
      const blur = Math.round((3 + bands.volume * 6) * int)
      if (blur > 0) {
        const tc = this.tempCanvas; const tctx = this.tempCtx
        tc.width = pw; tc.height = ph
        tctx.filter = `blur(${blur}px) brightness(1.3)`
        tctx.drawImage(c, 0, 0, pw, ph)
        tctx.filter = 'none'
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.5 * int
        ctx.drawImage(tc, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }

    if (this.activeIds.has('crt')) {
      const int = this.intensities.get('crt') ?? 1
      ctx.fillStyle = `rgba(0,0,0,${0.08 * int})`
      const step = Math.max(2, Math.round(3 * dpr))
      for (let y = 0; y < ph; y += step) ctx.fillRect(0, y, pw, 1)
      const grad = ctx.createRadialGradient(pw / 2, ph / 2, pw * 0.3, pw / 2, ph / 2, pw * 0.8)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, `rgba(0,0,0,${0.4 * int})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, pw, ph)
    }

    if (this.activeIds.has('vhs')) {
      const int = this.intensities.get('vhs') ?? 1
      const strips = 3 + Math.floor(bands.bass * 5)
      for (let i = 0; i < strips; i++) {
        const y = Math.floor(Math.random() * ph)
        const h = 1 + Math.floor(Math.random() * 3 * dpr)
        const shift = Math.round((Math.random() - 0.5) * 6 * int * dpr)
        if (shift !== 0) ctx.drawImage(c, 0, y, pw, h, shift, y, pw, h)
      }
      ctx.globalAlpha = 0.06 * int
      ctx.fillStyle = `hsl(0,0%,${Math.random() * 100}%)`
      ctx.fillRect(0, 0, pw, ph)
      ctx.globalAlpha = 1
    }

    if (this.activeIds.has('grain')) {
      const int = this.intensities.get('grain') ?? 1
      ctx.globalAlpha = 0.08 * int
      const gs = Math.max(4, Math.round(6 * dpr))
      for (let x = 0; x < pw; x += gs) {
        for (let y = 0; y < ph; y += gs) {
          const v = Math.floor(Math.random() * 255)
          ctx.fillStyle = `rgb(${v},${v},${v})`
          ctx.fillRect(x, y, gs, gs)
        }
      }
      ctx.globalAlpha = 1
    }

    if (this.activeIds.has('pixelate') && this.tempCanvas && this.tempCtx) {
      const int = this.intensities.get('pixelate') ?? 1
      const cellSize = Math.max(2, Math.round(4 + (1 - int) * 12))
      const tc = this.tempCanvas; const tctx = this.tempCtx
      const sw = Math.ceil(pw / cellSize)
      const sh = Math.ceil(ph / cellSize)
      tc.width = sw; tc.height = sh
      tctx.imageSmoothingEnabled = false
      tctx.drawImage(c, 0, 0, sw, sh)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, pw, ph)
      ctx.drawImage(tc, 0, 0, sw, sh, 0, 0, pw, ph)
      ctx.imageSmoothingEnabled = true
    }

    if (this.activeIds.has('edgeglow') && this.tempCanvas && this.tempCtx) {
      const int = this.intensities.get('edgeglow') ?? 1
      const tc = this.tempCanvas; const tctx = this.tempCtx
      tc.width = pw; tc.height = ph
      tctx.filter = 'contrast(3) brightness(0.5)'
      tctx.drawImage(c, 0, 0)
      tctx.filter = 'none'
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.4 * int * (1 + bands.volume)
      ctx.drawImage(tc, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
  }

  // ── WebGL path ──
  private drawWebGL(source: HTMLCanvasElement | HTMLDivElement, c: HTMLCanvasElement, bands: AudioBands) {
    const gl = this.gl!
    const glc = this.glCanvas!
    const active = this.slots.filter(s => {
      if (!this.activeIds.has(s.id) || s.compileFailed) return false
      if (!s.program) {
        const prog = this.buildProgram(gl, s.frag)
        if (!prog) { s.compileFailed = true; return false }
        s.program = prog
        s.uTime = gl.getUniformLocation(prog, 'iTime')
        s.uRes = gl.getUniformLocation(prog, 'iResolution')
        s.uIntensity = gl.getUniformLocation(prog, 'iIntensity')
        s.uAudio = gl.getUniformLocation(prog, 'iAudio')
        s.uTexture = gl.getUniformLocation(prog, 'iTexture')
      }
      return true
    })
    if (active.length === 0) { c.style.visibility = 'hidden'; return }
    c.style.visibility = 'visible'

    const dpr = window.devicePixelRatio || 1
    const cw = c.offsetWidth || 320
    const ch = c.offsetHeight || 240
    const pw = Math.round(cw * dpr)
    const ph = Math.round(ch * dpr)
    if (glc.width !== pw || glc.height !== ph) { glc.width = pw; glc.height = ph }
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph }

    if (this.texW !== pw || this.texH !== ph) {
      this.resizeTex(gl, this.texA!, pw, ph)
      this.resizeTex(gl, this.texB!, pw, ph)
      this.texW = pw; this.texH = ph
    }

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    let sourceEl: HTMLCanvasElement | null = null
    if (source instanceof HTMLCanvasElement) sourceEl = source
    else sourceEl = source.querySelector('canvas')
    if (!sourceEl || sourceEl.width === 0) return
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl)

    const iTime = (performance.now() - this.startTime) / 1000
    const audioArr = new Float32Array([
      bands.subBass, bands.bass, bands.lowMid, bands.mid, bands.highMid, bands.high, bands.volume,
    ])

    let readTex = this.sourceTexture!
    const texes = [this.texA!, this.texB!]
    let writeIdx = 0

    for (let i = 0; i < active.length; i++) {
      const slot = active[i]
      const isLast = i === active.length - 1
      if (isLast) gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texes[writeIdx], 0)
      }
      gl.viewport(0, 0, pw, ph)
      gl.useProgram(slot.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, readTex)
      if (slot.uTexture) gl.uniform1i(slot.uTexture, 0)
      if (slot.uTime) gl.uniform1f(slot.uTime, iTime)
      if (slot.uRes) gl.uniform2f(slot.uRes, pw, ph)
      if (slot.uIntensity) gl.uniform1f(slot.uIntensity, this.intensities.get(slot.id) ?? 1)
      if (slot.uAudio) gl.uniform1fv(slot.uAudio, audioArr)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vsBuf)
      const loc = gl.getAttribLocation(slot.program, 'a_pos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (!isLast) { readTex = texes[writeIdx]; writeIdx = 1 - writeIdx }
    }

    // Copy WebGL result to the visible overlay canvas
    const ctx = this.overlayCtx
    if (ctx) {
      ctx.clearRect(0, 0, pw, ph)
      ctx.drawImage(glc, 0, 0)
    }
  }

  dispose() {
    const gl = this.gl
    if (gl) {
      this.slots.forEach(s => { if (s.program) gl.deleteProgram(s.program) })
      if (this.sourceTexture) gl.deleteTexture(this.sourceTexture)
      if (this.texA) gl.deleteTexture(this.texA)
      if (this.texB) gl.deleteTexture(this.texB)
      if (this.fb) gl.deleteFramebuffer(this.fb)
      if (this.vsBuf) gl.deleteBuffer(this.vsBuf)
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    }
    this.slots = []
    this.gl = null
    this.glCanvas = null
    this.overlay = null
    this.overlayCtx = null
    this.tempCanvas = null
    this.tempCtx = null
  }

  private createTex(gl: WebGLRenderingContext): WebGLTexture {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    return tex
  }

  private resizeTex(gl: WebGLRenderingContext, tex: WebGLTexture, w: number, h: number) {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  }

  private buildProgram(gl: WebGLRenderingContext, fragSrc: string): WebGLProgram | null {
    const vs = this.compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return null
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); return null }
    return prog
  }

  private compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null }
    return s
  }
}
