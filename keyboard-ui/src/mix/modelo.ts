/**
 * O que a /mix compartilha com o teste: contrato do backend (backend/mix_routes.py),
 * as constantes da tela e o volume do preview. Fora do Mix.tsx porque arquivo de
 * componente que exporta outra coisa quebra o fast refresh.
 */

export type Ambiente = {
  id: string
  titulo: string
  categorias: string[]
  origem: string
  dur_s: number | null
  lufs: number | null
  local: boolean
  loop: boolean
  avisos: string[]
}
export type Faixa = { grupo: string; nome: string; caminho: string; mb: number }
export type Camada = { id: string; nivel_db: number; respira: boolean }
export type Job = {
  status: 'running' | 'done' | 'error'
  progress?: number
  out?: string
  error?: string
  preview?: boolean
  avisos?: string[]
  lufs?: number | null
}

export const CATEGORIAS = [
  'chuva', 'vento', 'passaros', 'caverna', 'fogo', 'agua', 'floresta',
  'noite', 'cidade', 'interior', 'ruido', 'textura', 'outro',
] as const
export const PAPEL = ['lugar', 'textura'] as const
export const MAX_CAMADAS = 2
export const PREVIEW_S = 30
export const DURACOES: { rotulo: string; s: number | null }[] = [
  { rotulo: '= música', s: null }, { rotulo: '1 h', s: 3600 }, { rotulo: '3 h', s: 10800 },
]

/**
 * Volume do preview no browser. Aproximação, e a tela diz isso.
 *
 * Normaliza a cama pelo LUFS do catálogo (−30 como referência) e parte do 0,35 que o
 * liminal já usa de volume de ambiência, com a textura mais baixa que o lugar — o mesmo
 * degrau de 6 dB que o render aplica. O knob entra em dB por cima.
 */
export function volumePreview(lufs: number | null, nivelDb: number, indice: number): number {
  const base = indice === 0 ? 0.35 : 0.175
  const norm = lufs == null ? 1 : Math.pow(10, (-30 - lufs) / 20)
  return Math.max(0, Math.min(1, base * norm * Math.pow(10, nivelDb / 20)))
}

export const mmss = (s: number | null) =>
  s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const fmtDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} dB`
