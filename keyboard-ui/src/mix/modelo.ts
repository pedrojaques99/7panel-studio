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
  uso?: number
}
export type Faixa = {
  grupo: string; nome: string; caminho: string; mb: number
  dur_s: number | null; modificado: string | null
}
export type Camada = { id: string; nivel_db: number; respira: boolean; gap_s: number }
/* mix com nome, gravado em backend/assets/mixes_salvos.json — tudo que o export precisa */
export type MixSalvo = {
  id: string; nome: string; musica: string; camadas: Camada[]
  visual_id: string | null; duracao_s: number | null; formato: 'mp3' | 'wav'; salvo_em: string
}
export type Visual = {
  id: string
  titulo: string
  tipo: 'video' | 'imagem'
  dur_s: number | null
  categorias: string[]
  thumb: string | null
}
export type Job = {
  status: 'running' | 'done' | 'error'
  progress?: number
  out?: string
  /* só quando teve visual: job.out vira o .mp4 e o áudio puro (fade/limiter já aplicados,
     sem vídeo por cima) continua salvo aqui — ver PLAN-mix-export-video.md */
  audio_out?: string
  compondo?: boolean
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
export const MAX_CAMADAS = 12   // mesmo teto do backend (dsp/mix.py) — sanidade da linha de
                                 // comando do ffmpeg, não limite criativo
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
/* pro timecode do transporte: a era3/stretch/1h inteira e feita de faixa de 1h+, "60:15"
   nao le como tempo — precisa da hora. */
export const tempo = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}
export const fmtDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} dB`
export const fmtS = (v: number) => (v <= 0 ? 'sem gap' : `${v.toFixed(0)} s`)

/**
 * Sugestão de próxima camada: heurística client-side, sem histórico novo no backend
 * além do contador de uso que já vem no `/api/mix/catalog` (campo `uso`).
 *
 * Pontua por categoria ainda não usada nas camadas ativas (o que mais evita sopa),
 * penaliza quem dispararia o mesmo aviso de repetição que `avisos` já calcula na tela,
 * e usa `uso` só como desempate leve — a categoria nova pesa mais que a mais usada.
 */
export function sugerirCamadas(
  ambientes: Ambiente[],
  porId: Map<string, Ambiente>,
  ativas: Camada[],
  duracaoAlvo: number | null,
  limite = 6,
): Ambiente[] {
  if (ativas.length >= MAX_CAMADAS) return []
  const idsAtivos = new Set(ativas.map(c => c.id))
  const categoriasUsadas = new Set(ativas.flatMap(c => porId.get(c.id)?.categorias ?? []))
  const pontuado = ambientes
    .filter(a => !idsAtivos.has(a.id))
    .map(a => {
      let pontos = 0
      if (!a.categorias.some(k => categoriasUsadas.has(k))) pontos += 3
      if (a.avisos.length === 0) pontos += 2
      if (duracaoAlvo && a.dur_s && a.dur_s < 480 && duracaoAlvo / a.dur_s > 12) pontos -= 3
      pontos += Math.min(a.uso ?? 0, 5) * 0.2
      return { a, pontos }
    })
  pontuado.sort((x, y) => y.pontos - x.pontos)
  return pontuado.slice(0, limite).map(p => p.a)
}

/** Compara ids (sem olhar nível/gap) — pra só oferecer "usar combo salvo" quando muda algo real. */
export function combosIguais(a: Camada[], b: Camada[]): boolean {
  if (a.length !== b.length) return false
  const s = (xs: Camada[]) => xs.map(c => c.id).slice().sort().join(',')
  return s(a) === s(b)
}
