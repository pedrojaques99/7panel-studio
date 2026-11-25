/**
 * A partitura pintada (PLANO-visual-era6.md). Aqui se desenha o evento que o motor mandou
 * tocar, não o áudio que saiu. Grão vira pincelada, estalo vira poeira, e a sala decide
 * quanto tempo a tinta leva pra secar.
 *
 * A secagem anda no relógio do áudio (um passo por tick do motor), não no relógio de parede.
 * Por isso a mesma sessão pinta a mesma imagem ao vivo e no export offline.
 */
import { rng, TICK_S, type Grao, type Rng } from './modelo'

export type RGB = [number, number, number]
export type Paleta = { stops: RGB[]; neutro: RGB; fundo: RGB }
export const LADO = 2048

/* tokens que viram tinta: a cor só pode ser mistura deles (portão de paleta) */
const TOKENS_STOPS = ['--vintage-meter-red', '--vintage-accent', '--vintage-meter-yellow', '--vintage-value', '--vintage-meter-green']
const TOKEN_NEUTRO = '--vintage-text-muted'
const TOKEN_FUNDO = '--vintage-surface-1'

function parseCor(s: string): RGB | null {
  s = s.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const m = /rgba?\(([^)]+)\)/.exec(s)
  if (m) {
    const [r, g, b] = m[1].split(/[ ,/]+/).map(Number)
    return [r, g, b]
  }
  return null
}

/** Lê os tokens do CSS. Token que não é hex/rgb (ex.: color-mix) é resolvido pelo navegador num elemento de teste. */
export function lerPaleta(el: HTMLElement = document.documentElement): Paleta {
  const css = getComputedStyle(el)
  const sonda = document.createElement('span')
  document.body.appendChild(sonda)
  const ler = (tok: string): RGB => {
    const cru = parseCor(css.getPropertyValue(tok))
    if (cru) return cru
    sonda.style.color = `var(${tok})`
    return parseCor(getComputedStyle(sonda).color) ?? [128, 128, 128]
  }
  const p = { stops: TOKENS_STOPS.map(ler), neutro: ler(TOKEN_NEUTRO), fundo: ler(TOKEN_FUNDO) }
  sonda.remove()
  return p
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const mix = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Cor do sample a partir da medida do banco:
 * - centroide escolhe a posição entre os tokens (grave e quente → agudo e frio), em escala log de 150 a 6000 Hz
 * - flatness puxa pro neutro: ruído sai acinzentado, tonal sai com cor
 */
export function corDoSample(centroideHz: number, flatness: number, p: Paleta): RGB {
  const pos = clamp01(Math.log(Math.max(150, centroideHz) / 150) / Math.log(6000 / 150)) * (p.stops.length - 1)
  const i = Math.min(p.stops.length - 2, Math.floor(pos))
  const base = mix(p.stops[i], p.stops[i + 1], pos - i)
  return mix(base, p.neutro, clamp01(flatness / 0.2) * 0.8)
}

export type InfoGrao = { camada: number; frac: number; mao: boolean; deriva: boolean; cor: RGB }
export type Traco = {
  x: number; y: number; comprimento: number; largura: number; cor: RGB; alfa: number
  sentido: 1 | -1; inclina: number; curva: number; nitida: boolean; puida: boolean; camada: number
}

// um pincel por camada, fino: a pintura é trama de grafite, não mancha (px a 2048)
const PINCEL = [0.8, 1.2, 0.6, 1.5, 1, 1.8]

/**
 * Grão → traço. A tela inteira se enche porque os dois eixos são contínuos:
 * - x = pan (com a órbita, varre de canto a canto)
 * - y = de onde o grão saiu no sample (0 em cima, fim do sample embaixo): position e spray andando
 *   espalham a pintura pela altura toda
 * - pitch = inclinação do traço (agudo sobe, grave desce), não uma faixa fixa
 */
export function graoParaTraco(g: Grao, info: InfoGrao, lado = LADO): Traco {
  const st = 12 * Math.log2(g.rate)
  const escala = lado / 2048
  const base = PINCEL[info.camada % PINCEL.length] * (0.6 + 0.8 * Math.min(1, g.ganho)) * escala
  const comum = { x: ((g.pan + 1) / 2) * lado, cor: info.cor, nitida: info.mao, puida: info.deriva && !info.mao, camada: info.camada, sentido: 1 as const, curva: 0 }
  // nota: traço reto e longo na altura da nota (grave embaixo), a partitura propriamente dita
  if (g.forma === 'nota') {
    return {
      ...comum, y: (1 - clamp01((st + 24) / 48)) * lado, inclina: 0,
      comprimento: Math.min(lado * 0.3, Math.max(4, (g.dur / g.rate) * lado * 0.04)),
      largura: base * 1.6, alfa: 0.2 + 0.4 * Math.min(1, g.ganho),
    }
  }
  // golpe: carimbo curto e grosso, na altura da fatia do sample que tocou
  if (g.forma === 'golpe') {
    return { ...comum, y: clamp01(info.frac) * lado, inclina: 0, comprimento: 3 * escala, largura: base * 5, alfa: 0.45 }
  }
  return {
    x: ((g.pan + 1) / 2) * lado,
    y: clamp01(info.frac) * lado,
    comprimento: Math.min(lado * 0.25, Math.max(2, g.dur * lado * 0.25)),
    largura: PINCEL[info.camada % PINCEL.length] * (0.6 + 0.8 * Math.min(1, g.ganho)) * (lado / 2048),
    cor: info.cor,
    alfa: 0.12 + 0.35 * Math.min(1, g.ganho),
    sentido: g.reverso ? -1 : 1,
    inclina: Math.max(-1, Math.min(1, st / 24)),
    curva: (info.frac - 0.5) * 0.3,
    nitida: info.mao,
    puida: info.deriva && !info.mao,
    camada: info.camada,
  }
}

/* ── o pintor: desenha em qualquer canvas 2D (tela ao vivo ou OffscreenCanvas do export) ── */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export class Pintor {
  private r: Rng
  cicatriz: Float32Array[]
  private ctx: Ctx
  private lado: number
  private paleta: Paleta

  constructor(ctx: Ctx, paleta: Paleta, seed: number, lado = LADO, camadas = 6) {
    this.ctx = ctx
    this.lado = lado
    this.paleta = paleta
    this.r = rng(seed)
    this.cicatriz = Array.from({ length: camadas }, () => new Float32Array(512))
    this.limpar()
  }

  limpar() {
    const [r, g, b] = this.paleta.fundo
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.fillStyle = `rgb(${r},${g},${b})`
    this.ctx.fillRect(0, 0, this.lado, this.lado)
    for (const c of this.cicatriz) c.fill(0)
  }

  traco(t: Traco) {
    const c = this.ctx
    const [r, g, b] = t.cor
    const x1 = t.x + t.sentido * t.comprimento
    const y1 = t.y - t.inclina * t.comprimento * 0.5
    const cx = (t.x + x1) / 2
    const cy = (t.y + y1) / 2 - t.curva * t.comprimento
    // cor sólida com alfa baixo e sem somar luz: leve de ver e barato de desenhar (sem gradiente por grão)
    c.globalCompositeOperation = 'source-over'
    c.lineCap = 'butt'
    c.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.min(1, t.nitida ? t.alfa * 1.8 : t.alfa).toFixed(3)})`
    c.lineWidth = t.largura
    // drift = pontilhado; mão = contínuo e um pouco mais forte
    c.setLineDash(t.puida ? [t.largura * 3 + 2, t.largura * 2 + 3] : [])
    c.beginPath()
    c.moveTo(t.x, t.y)
    c.quadraticCurveTo(cx, cy, x1, y1)
    c.stroke()
    c.setLineDash([])
  }

  grao(g: Grao, info: InfoGrao) {
    this.traco(graoParaTraco(g, info, this.lado))
    const bin = Math.min(511, Math.floor(info.frac * 512))
    this.cicatriz[info.camada][bin] += g.ganho
  }

  /** Estalo = poeira. A posição vem do rng do pintor, que avança na mesma ordem ao vivo e offline. */
  estalo(amp: number) {
    const c = this.ctx
    const [r, g, b] = this.paleta.neutro
    c.globalCompositeOperation = 'lighter'
    c.fillStyle = `rgba(${r},${g},${b},${(0.15 + amp * 0.7).toFixed(3)})`
    const s = (1 + amp * 3) * (this.lado / 2048)
    c.fillRect(this.r() * this.lado, this.r() * this.lado, s, s)
  }

  /**
   * Um tick de secagem. Sala longa = tinta demora a perder o brilho (sala × 8 s). Escuro baixo
   * (LP fechado) = a tinta seca mais depressa, envelhece.
   */
  secar(sala: number, escuroHz: number) {
    const tau = 0.6 + sala * 8
    const envelhece = Math.sqrt(2200 / Math.max(400, escuroHz))
    // traço fino some rápido se secar no mesmo ritmo da mancha antiga: seca a 1/3 disso
    const k = Math.min(0.5, (1 - Math.exp(-TICK_S / tau)) * 0.12 * envelhece)
    const [r, g, b] = this.paleta.fundo
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.fillStyle = `rgba(${r},${g},${b},${k.toFixed(4)})`
    this.ctx.fillRect(0, 0, this.lado, this.lado)
  }

  /** Granulação de filme (chiado) assada na capa. Na tela ao vivo é um overlay de CSS. */
  granular(chiadoDb: number, seed: number) { granularEm(this.ctx, this.lado, this.lado, chiadoDb, seed) }
}

export function granularEm(ctx: Ctx, w: number, h: number, chiadoDb: number, seed: number) {
  const dens = Math.min(1, Math.max(0, (chiadoDb + 80) / 50))
  if (dens <= 0) return
  const r = rng(seed)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = (r() - 0.5) * 22 * dens
    d[i] += v; d[i + 1] += v; d[i + 2] += v
  }
  ctx.putImageData(img, 0, 0)
}

/** Canvas (ao vivo ou offscreen) → PNG. A capa ao vivo ganha a granulação assada numa cópia. */
export async function paraPng(src: HTMLCanvasElement | OffscreenCanvas, chiadoDb?: number, seed = 0, lado?: number): Promise<Blob> {
  const w = lado ?? src.width, h = lado ?? src.height
  const off = new OffscreenCanvas(w, h)
  const c = off.getContext('2d')!
  c.drawImage(src, 0, 0, w, h)
  if (chiadoDb !== undefined) granularEm(c, w, h, chiadoDb, seed)
  return off.convertToBlob({ type: 'image/png' })
}

/** Desenha a cicatriz: forma de onda de cada sample (picos) e, por cima, onde os grãos leram. */
export function pintarCicatriz(ctx: Ctx, largura: number, altura: number, picos: (Float32Array | null)[],
  cicatriz: Float32Array[], cores: RGB[], paleta: Paleta) {
  const [fr, fg, fb] = paleta.fundo
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = `rgb(${fr},${fg},${fb})`
  ctx.fillRect(0, 0, largura, altura)
  const faixa = altura / cicatriz.length
  const [nr, ng, nb] = paleta.neutro
  cicatriz.forEach((heat, i) => {
    const y0 = i * faixa
    const meio = y0 + faixa / 2
    const pk = picos[i]
    if (pk) {
      ctx.fillStyle = `rgba(${nr},${ng},${nb},0.35)`
      for (let k = 0; k < pk.length; k++) {
        const h = pk[k] * faixa * 0.42
        ctx.fillRect((k / pk.length) * largura, meio - h, largura / pk.length + 0.5, h * 2)
      }
    }
    const max = Math.max(1e-6, ...heat)
    const [r, g, b] = cores[i] ?? paleta.neutro
    for (let k = 0; k < heat.length; k++) {
      if (!heat[k]) continue
      // raiz: poucas leituras já aparecem, e muitas não estouram
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.sqrt(heat[k] / max).toFixed(3)})`
      ctx.fillRect((k / heat.length) * largura, y0 + 2, largura / heat.length + 0.5, faixa - 4)
    }
  })
}

/** Picos da forma de onda (512 colunas) pra cicatriz. */
export function picosDe(buf: AudioBuffer, colunas = 512): Float32Array {
  const d = buf.getChannelData(0)
  const out = new Float32Array(colunas)
  const passo = Math.max(1, Math.floor(d.length / colunas))
  for (let k = 0; k < colunas; k++) {
    let m = 0
    for (let i = k * passo; i < Math.min(d.length, (k + 1) * passo); i += 8) m = Math.max(m, Math.abs(d[i]))
    out[k] = m
  }
  return out
}
