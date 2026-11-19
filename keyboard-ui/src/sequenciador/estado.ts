/**
 * Estado puro do /sequenciador: geometria da grade (a mesma conta do `desenharPartitura`),
 * edição de notas e o link de compartilhar. Nada de Tone aqui, pra dar pra testar sem áudio.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { ESTILOS, FORMAS, gerarNotas, type NomeEstilo, type Nota } from '@jaques/padroes'

export const NOMES_ESTILO: NomeEstilo[] = ['eno', 'aphex', 'prog', 'drone']

/** segundos por passo (16 avos) no BPM do estilo: o relógio do desenho */
export const passoDoEstilo = (e: NomeEstilo) => 60 / ESTILOS[e].bpm / 4
export const colunasDoEstilo = (e: NomeEstilo) => ESTILOS[e].passos * ESTILOS[e].compassos
export const linhasDoEstilo = (e: NomeEstilo) => ESTILOS[e].escala.length

// ── geometria (espelha desenharPartitura: c = célula, m = 2c) ──────────────────

export interface Grade { largura: number; altura: number; celula: number; colunas: number; linhas: number; escalaGlifo?: number }

/** lado do glifo em px: no estilo "bio" (padrão do motor) a forma ocupa `escalaGlifo` = 2,6 células */
export const ladoGlifo = (g: Grade) => g.celula * (g.escalaGlifo ?? 2.6)

const medidas = (g: Grade) => {
  const c = g.celula, m = c * 2
  const areaW = g.largura - m * 2, areaH = g.altura - m * 2 - c * 2
  return { c, m, areaH, colW: areaW / g.colunas, rowH: areaH / Math.max(1, g.linhas - 1) }
}

/** canto de cima à esquerda do glifo da célula (col, row), no mesmo espaço de pixels do canvas */
export function posCelula(g: Grade, col: number, row: number) {
  const { c, m, areaH, colW, rowH } = medidas(g)
  return { x: m + col * colW, y: m + c * 2 + areaH - row * rowH }
}

/** célula mais perto de um ponto (centro do glifo), presa dentro da grade */
export function celulaEm(g: Grade, x: number, y: number) {
  const { c, m, areaH, colW, rowH } = medidas(g)
  const meio = ladoGlifo(g) / 2
  const col = Math.round((x - meio - m) / colW)
  const row = Math.round((m + c * 2 + areaH - (y - meio)) / rowH)
  return { col: Math.max(0, Math.min(g.colunas - 1, col)), row: Math.max(0, Math.min(g.linhas - 1, row)) }
}

/** índice da nota sob o ponto (o glifo inteiro, com folga), a de centro mais perto; ou -1 */
export function notaEm(g: Grade, notas: Nota[], x: number, y: number): number {
  const G = ladoGlifo(g), folga = g.celula * 0.25
  let melhor = -1, dist = Infinity
  for (let i = 0; i < notas.length; i++) {
    const p = posCelula(g, notas[i].col, notas[i].row)
    if (x < p.x - folga || x > p.x + G + folga || y < p.y - folga || y > p.y + G + folga) continue
    const d = Math.hypot(x - (p.x + G / 2), y - (p.y + G / 2))
    if (d < dist) { dist = d; melhor = i }
  }
  return melhor
}

// ── edição ───────────────────────────────────────────────────────────────────

export const DURACOES = [
  { id: 'curta', rotulo: 'curta', fator: 0.35 },
  { id: 'media', rotulo: 'média', fator: 1 },
  { id: 'longa', rotulo: 'longa', fator: 2.5 },
] as const

/** a nota sempre carrega t coerente com a coluna, no relógio do estilo */
export function comColuna(e: NomeEstilo, n: Nota, col: number, row: number): Nota {
  return { ...n, col, row, t: col * passoDoEstilo(e) }
}

export function novaNota(e: NomeEstilo, col: number, row: number, glifo: number, acento: boolean, fatorDur: number): Nota {
  return { col, row, glifo: glifo % FORMAS.length, t: col * passoDoEstilo(e), dur: ESTILOS[e].soltura * fatorDur, acento }
}

export const ordenar = (notas: Nota[]) => [...notas].sort((a, b) => a.t - b.t || a.row - b.row)

/** já existe nota nessa célula? (ignora o índice que está sendo arrastado) */
export const ocupada = (notas: Nota[], col: number, row: number, ignorar = -1) =>
  notas.some((n, i) => i !== ignorar && n.col === col && n.row === row)

// ── compartilhar ─────────────────────────────────────────────────────────────

/** nota compacta: [col, row, glifo, acento 0/1, dur em centésimos, rótulo?] */
type NotaCompacta = [number, number, number, number, number, string?]
export interface Partilha { estilo: NomeEstilo; seed: number; notas?: Nota[]; bpm?: number }

export function codificar(p: Partilha): string {
  const corpo: { v: 1; e: NomeEstilo; s: number; b?: number; n?: NotaCompacta[] } = { v: 1, e: p.estilo, s: p.seed }
  if (p.bpm && p.bpm !== ESTILOS[p.estilo].bpm) corpo.b = p.bpm
  if (p.notas) corpo.n = p.notas.map((n) => {
    const c: NotaCompacta = [n.col, n.row, n.glifo, n.acento ? 1 : 0, Math.round((n.dur ?? 0.3) * 100)]
    if (n.rotulo) c.push(n.rotulo)
    return c
  })
  return compressToEncodedURIComponent(JSON.stringify(corpo))
}

export function decodificar(s: string): Partilha | null {
  try {
    const txt = decompressFromEncodedURIComponent(s)
    if (!txt) return null
    const o = JSON.parse(txt)
    if (o?.v !== 1 || !NOMES_ESTILO.includes(o.e) || !Number.isFinite(o.s)) return null
    const e = o.e as NomeEstilo
    const p: Partilha = { estilo: e, seed: o.s }
    if (Number.isFinite(o.b)) p.bpm = o.b
    if (Array.isArray(o.n)) {
      const cols = colunasDoEstilo(e), lins = linhasDoEstilo(e)
      p.notas = ordenar((o.n as NotaCompacta[])
        .filter((c) => Array.isArray(c) && c[0] >= 0 && c[0] < cols && c[1] >= 0 && c[1] < lins)
        .map(([col, row, glifo, ac, dur, rot]) => {
          const n = novaNota(e, col, row, glifo, ac === 1, 1)
          n.dur = dur / 100
          if (rot) n.rotulo = rot
          return n
        }))
    }
    return p
  } catch {
    return null
  }
}

/** a partitura de um link: as notas editadas se vieram, senão a gerada pela semente */
export const notasDaPartilha = (p: Partilha) => p.notas ?? gerarNotas(p.estilo, p.seed)
