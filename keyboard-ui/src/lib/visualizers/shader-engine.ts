import type { AudioBands } from '../visualizer-engine'

export interface ShaderParams {
  speed: number
  zoom: number
  colorShift: number
  reactivity: number
  bassWeight: number
  midWeight: number
  highWeight: number
  distortion: number
  glow: number
  complexity: number
}

export const DEFAULT_SHADER_PARAMS: ShaderParams = {
  speed: 1, zoom: 1, colorShift: 0, reactivity: 1,
  bassWeight: 1, midWeight: 1, highWeight: 1,
  distortion: 1, glow: 1, complexity: 1,
}

const VERT = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}`

export class ShaderEngine {
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private uTime = -1
  private uRes = -1
  private uBands = -1
  private uSpeed = -1
  private uZoom = -1
  private uColorShift = -1
  private uDistortion = -1
  private uGlow = -1
  private uComplexity = -1
  private startTime = 0
  private canvas: HTMLCanvasElement | null = null
  private vsBuf: WebGLBuffer | null = null

  init(canvas: HTMLCanvasElement, fragSrc: string): boolean {
    let gl = this.gl
    if (!gl || this.canvas !== canvas) {
      // Try to reuse existing context on the same canvas (avoids context limit exhaustion)
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })
      if (!gl) {
        // Context lost or limit reached — force-release old context and retry
        if (this.gl) {
          const ext = this.gl.getExtension('WEBGL_lose_context')
          if (ext) ext.loseContext()
          this.gl = null
        }
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })
        if (!gl) {
          console.warn('WebGL context null — canvas:', canvas.width, 'x', canvas.height, 'connected:', canvas.isConnected)
          return false
        }
      }
      this.gl = gl
      this.canvas = canvas

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
      this.vsBuf = buf
    }

    if (this.program) { gl.deleteProgram(this.program); this.program = null }

    this.startTime = performance.now()

    const vs = this.compile(gl.VERTEX_SHADER, VERT)
    const fs = this.compile(gl.FRAGMENT_SHADER, `precision mediump float;\n${fragSrc}`)
    if (!vs || !fs) return false

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Shader link:', gl.getProgramInfoLog(prog))
      gl.deleteProgram(prog)
      return false
    }
    this.program = prog
    gl.useProgram(prog)

    this.uTime = gl.getUniformLocation(prog, 'iTime') as number
    this.uRes = gl.getUniformLocation(prog, 'iResolution') as number
    this.uBands = gl.getUniformLocation(prog, 'iAudio') as number
    this.uSpeed = gl.getUniformLocation(prog, 'iSpeed') as number
    this.uZoom = gl.getUniformLocation(prog, 'iZoom') as number
    this.uColorShift = gl.getUniformLocation(prog, 'iColorShift') as number
    this.uDistortion = gl.getUniformLocation(prog, 'iDistortion') as number
    this.uGlow = gl.getUniformLocation(prog, 'iGlow') as number
    this.uComplexity = gl.getUniformLocation(prog, 'iComplexity') as number

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vsBuf)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    return true
  }

  draw(bands: AudioBands, params?: Partial<ShaderParams>) {
    const gl = this.gl
    const c = this.canvas
    if (!gl || !c || !this.program) return

    const p = { ...DEFAULT_SHADER_PARAMS, ...params }

    gl.viewport(0, 0, c.width, c.height)
    gl.uniform1f(this.uTime, (performance.now() - this.startTime) / 1000)
    gl.uniform2f(this.uRes, c.width, c.height)
    if (this.uBands !== -1) {
      const r = p.reactivity
      gl.uniform1fv(this.uBands, new Float32Array([
        bands.subBass * r * p.bassWeight,
        bands.bass * r * p.bassWeight,
        bands.lowMid * r * p.midWeight,
        bands.mid * r * p.midWeight,
        bands.highMid * r * p.highWeight,
        bands.high * r * p.highWeight,
        bands.volume * r,
      ]))
    }

    if (this.uSpeed !== -1) gl.uniform1f(this.uSpeed, p.speed)
    if (this.uZoom !== -1) gl.uniform1f(this.uZoom, p.zoom)
    if (this.uColorShift !== -1) gl.uniform1f(this.uColorShift, p.colorShift)
    if (this.uDistortion !== -1) gl.uniform1f(this.uDistortion, p.distortion)
    if (this.uGlow !== -1) gl.uniform1f(this.uGlow, p.glow)
    if (this.uComplexity !== -1) gl.uniform1f(this.uComplexity, p.complexity)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy() {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program)
    }
    this.program = null
  }

  dispose() {
    this.destroy()
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    }
    this.gl = null
    this.canvas = null
    this.vsBuf = null
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!
    const s = gl.createShader(type)
    if (!s) { console.warn('createShader null — GL error:', gl.getError()); return null }
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Shader compile error:', gl.getShaderInfoLog(s) || '(no info)', '\nSource:', src.slice(0, 200))
      gl.deleteShader(s)
      return null
    }
    return s
  }
}
