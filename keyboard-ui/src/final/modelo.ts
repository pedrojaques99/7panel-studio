/**
 * O projeto da /final como dado puro: trilhas, clipes, notas e as contas da edição.
 * Plano em `Jacão Ambients/PLANO-final.md`.
 *
 * Tudo em SEGUNDOS. A grade do bpm só existe na hora de encaixar (`encaixar`): faixa de
 * era5/era6 não tem bpm, e guardar posição em batida faria o sample escorregar quando o
 * bpm muda. Nota de melodia é relativa ao começo do clipe, então mover o clipe leva a
 * melodia junto.
 *
 * Toda edição devolve um projeto NOVO (nada muta): é isso que deixa o ⌘Z ser uma pilha.
 */
import { ESCALAS } from '../era6/modelo'
import type { FxParams } from '../lib/fx-rack'

export { ESCALAS }

export type TipoTrilha = 'audio' | 'melodia'
export type Instrumento = 'pad' | 'seno' | 'sino' | 'pluck' | 'baixo' | 'sample'
export const INSTRUMENTOS: { id: Instrumento; rotulo: string }[] = [
  { id: 'pad', rotulo: 'pad' }, { id: 'seno', rotulo: 'sine' }, { id: 'sino', rotulo: 'bell' },
  { id: 'pluck', rotulo: 'pluck' }, { id: 'baixo', rotulo: 'bass' }, { id: 'sample', rotulo: 'sample' },
]

export type Nota = { id: string; t: number; dur: number; midi: number; vel: number }
export type Clipe = {
  id: string; inicio: number; dur: number
  arquivo?: string; nome?: string; offset?: number; fadeIn?: number; fadeOut?: number; ganho?: number
  notas?: Nota[]
}
export type Trilha = {
  id: string; nome: string; tipo: TipoTrilha
  mudo: boolean; solo: boolean; armada: boolean
  volume: number            // dB
  pan: number               // -1..1
  instrumento?: Instrumento
  amostra?: string          // instrumento 'sample': arquivo tocado como nota
  amostraRaiz?: number      // classe da nota do sample (0 = C), lida do banco da era6; ausente = C
  corte?: number            // Hz, passa-baixa da trilha (FX); ausente ou no máximo = aberto
  sala?: number             // 0..1, envio pro reverb da casa (o mesmo "space" da era6)
  automacao?: Ponto[]       // volume em dB no tempo; com pontos, a curva manda e o fader descansa
  fx?: Partial<FxParams>    // rack da trilha (o mesmo da SynthPanel); ausente = sem cadeia, zero CPU
  eq?: Eq3                  // dB por banda; ausente = sem EQ
  clipes: Clipe[]
}
export type Eq3 = { low: number; mid: number; high: number }
export type Ponto = { id: string; t: number; db: number }
export type Projeto = {
  id: string; nome: string; bpm: number; compasso: number
  raiz: number              // 0 = C
  escala: number            // índice em ESCALAS
  master: number            // dB
  trilhas: Trilha[]
}

let seq = 0
export const novoId = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

export function novoProjeto(nome = 'sem nome'): Projeto {
  return { id: novoId('p'), nome, bpm: 72, compasso: 4, raiz: 2, escala: 1, master: -3, trilhas: [] }
}

export function novaTrilha(tipo: TipoTrilha, nome: string): Trilha {
  return {
    id: novoId('t'), nome, tipo, mudo: false, solo: false, armada: false, volume: tipo === 'audio' ? -6 : -16, pan: 0,
    instrumento: tipo === 'melodia' ? 'pad' : undefined, clipes: [],
  }
}

/* ── tempo ── */

export const batidaS = (bpm: number) => 60 / bpm
export const compassoS = (p: Pick<Projeto, 'bpm' | 'compasso'>) => batidaS(p.bpm) * p.compasso

/** Encaixa no múltiplo de `grade` (s) mais próximo; grade 0 = livre. */
export function encaixar(t: number, grade: number): number {
  if (grade <= 0) return Math.max(0, t)
  return Math.max(0, Math.round(t / grade) * grade)
}

export function duracaoProjeto(p: Projeto): number {
  let fim = 0
  for (const tr of p.trilhas) for (const c of tr.clipes) fim = Math.max(fim, c.inicio + c.dur)
  return fim
}

/** Solo manda: com qualquer solo ligado, só toca quem está em solo. Mudo sempre cala. */
export function audivel(trilhas: Trilha[]): Set<string> {
  const algumSolo = trilhas.some(t => t.solo)
  return new Set(trilhas.filter(t => !t.mudo && (!algumSolo || t.solo)).map(t => t.id))
}

/* ── edição (imutável) ── */

export function mudarTrilha(p: Projeto, id: string, f: (t: Trilha) => Trilha): Projeto {
  return { ...p, trilhas: p.trilhas.map(t => (t.id === id ? f(t) : t)) }
}

export function mudarClipe(p: Projeto, clipeId: string, f: (c: Clipe) => Clipe): Projeto {
  return { ...p, trilhas: p.trilhas.map(t => ({ ...t, clipes: t.clipes.map(c => (c.id === clipeId ? f(c) : c)) })) }
}

export function acharClipe(p: Projeto, clipeId: string): { trilha: Trilha; clipe: Clipe } | null {
  for (const trilha of p.trilhas) {
    const clipe = trilha.clipes.find(c => c.id === clipeId)
    if (clipe) return { trilha, clipe }
  }
  return null
}

export function removerClipe(p: Projeto, clipeId: string): Projeto {
  return { ...p, trilhas: p.trilhas.map(t => ({ ...t, clipes: t.clipes.filter(c => c.id !== clipeId) })) }
}

/** Move o clipe pra outra trilha do MESMO tipo (áudio não cai em trilha de melodia). */
export function moverClipe(p: Projeto, clipeId: string, inicio: number, trilhaId?: string): Projeto {
  const achado = acharClipe(p, clipeId)
  if (!achado) return p
  const destino = p.trilhas.find(t => t.id === trilhaId)
  const alvo = destino && destino.tipo === achado.trilha.tipo ? destino.id : achado.trilha.id
  const movido = { ...achado.clipe, inicio: Math.max(0, inicio) }
  return {
    ...p,
    trilhas: p.trilhas.map(t => {
      const sem = t.clipes.filter(c => c.id !== clipeId)
      return t.id === alvo ? { ...t, clipes: [...sem, movido] } : { ...t, clipes: sem }
    }),
  }
}

export const DUR_MIN = 0.05

/** Corta a borda esquerda: o áudio continua no mesmo lugar do tempo, só some o começo. */
export function aparar(c: Clipe, lado: 'esq' | 'dir', t: number, durFonte?: number): Clipe {
  const fim = c.inicio + c.dur
  if (lado === 'dir') {
    let dur = Math.max(DUR_MIN, t - c.inicio)
    if (durFonte !== undefined) dur = Math.min(dur, durFonte - (c.offset ?? 0))
    return { ...c, dur }
  }
  const offset0 = c.offset ?? 0
  // não passa do começo do arquivo (offset >= 0) nem do fim do clipe
  const inicio = Math.min(fim - DUR_MIN, Math.max(t, c.arquivo ? c.inicio - offset0 : 0, 0))
  const delta = inicio - c.inicio
  const notas = c.notas?.map(n => ({ ...n, t: n.t - delta })).filter(n => n.t + n.dur > 0 && n.t < fim - inicio)
  return { ...c, inicio, dur: fim - inicio, ...(c.arquivo ? { offset: offset0 + delta } : {}), ...(notas ? { notas } : {}) }
}

/** Divide no tempo `t` (absoluto). Fora do clipe não faz nada. */
export function dividir(p: Projeto, clipeId: string, t: number): Projeto {
  const achado = acharClipe(p, clipeId)
  if (!achado) return p
  const c = achado.clipe
  if (t <= c.inicio + DUR_MIN || t >= c.inicio + c.dur - DUR_MIN) return p
  const corte = t - c.inicio
  const a: Clipe = { ...c, dur: corte, fadeOut: 0, notas: c.notas?.filter(n => n.t < corte).map(n => ({ ...n, dur: Math.min(n.dur, corte - n.t) })) }
  const b: Clipe = {
    ...c, id: novoId('c'), inicio: t, dur: c.dur - corte, fadeIn: 0,
    ...(c.arquivo ? { offset: (c.offset ?? 0) + corte } : {}),
    notas: c.notas?.filter(n => n.t >= corte).map(n => ({ ...n, id: novoId('n'), t: n.t - corte })),
  }
  return mudarTrilha(p, achado.trilha.id, tr => ({ ...tr, clipes: tr.clipes.flatMap(x => (x.id === clipeId ? [a, b] : [x])) }))
}

export function duplicarClipe(p: Projeto, clipeId: string, inicio?: number): { projeto: Projeto; id: string } {
  const achado = acharClipe(p, clipeId)
  if (!achado) return { projeto: p, id: clipeId }
  const c = achado.clipe
  const novo: Clipe = { ...c, id: novoId('c'), inicio: inicio ?? c.inicio + c.dur, notas: c.notas?.map(n => ({ ...n, id: novoId('n') })) }
  return { projeto: mudarTrilha(p, achado.trilha.id, t => ({ ...t, clipes: [...t.clipes, novo] })), id: novo.id }
}

/* ── notas ── */

export const MIDI_MIN = 36   // C2
export const MIDI_MAX = 84   // C6

export const NOMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const nomeNota = (midi: number) => `${NOMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`

export function naEscala(midi: number, raiz: number, escala: number): boolean {
  const semis = (ESCALAS[escala] ?? ESCALAS[0]).semitons
  return semis.includes((((midi - raiz) % 12) + 12) % 12)
}

/** Grau da escala (0 = raiz da oitava 4) → midi. Teclado do PC toca por grau: não existe nota errada. */
export function grauParaMidi(grau: number, raiz: number, escala: number, oitava = 4): number {
  const semis = (ESCALAS[escala] ?? ESCALAS[0]).semitons
  const n = semis.length
  const o = Math.floor(grau / n)
  return 12 * (oitava + 1 + o) + raiz + semis[((grau % n) + n) % n]
}

/** Puxa uma nota pra dentro da escala (a de baixo, se cair no meio). */
export function prenderNaEscala(midi: number, raiz: number, escala: number): number {
  for (let d = 0; d < 12; d++) if (naEscala(midi - d, raiz, escala)) return midi - d
  return midi
}

export function notasNoClipe(c: Clipe, nota: Omit<Nota, 'id'>): Clipe {
  const n = { ...nota, id: novoId('n') }
  const fim = Math.max(c.dur, n.t + n.dur)
  return { ...c, dur: fim, notas: [...(c.notas ?? []), n] }
}

/* ── automação de volume ── */

export const AUTO_MIN = -60
export const AUTO_MAX = 6

/** Volume da curva no tempo `t`: reta entre pontos, e fora deles segura a ponta mais perto. */
export function valorAutomacao(pontos: Ponto[] | undefined, t: number, padrao: number): number {
  if (!pontos?.length) return padrao
  const ps = [...pontos].sort((a, b) => a.t - b.t)
  if (t <= ps[0].t) return ps[0].db
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i]
    if (t <= b.t) return b.t === a.t ? b.db : a.db + ((b.db - a.db) * (t - a.t)) / (b.t - a.t)
  }
  return ps[ps.length - 1].db
}

export function pontosOrdenados(pontos: Ponto[]): Ponto[] {
  return [...pontos].sort((a, b) => a.t - b.t)
}

export function mudarPonto(tr: Trilha, ponto: Ponto): Trilha {
  const resto = (tr.automacao ?? []).filter(p => p.id !== ponto.id)
  const db = Math.max(AUTO_MIN, Math.min(AUTO_MAX, ponto.db))
  return { ...tr, automacao: pontosOrdenados([...resto, { ...ponto, t: Math.max(0, ponto.t), db }]) }
}

/* ── histórico (⌘Z) ── */

export type Historico = { passado: Projeto[]; presente: Projeto; futuro: Projeto[] }
export const LIMITE_HISTORICO = 200

export const historicoDe = (p: Projeto): Historico => ({ passado: [], presente: p, futuro: [] })

export function empurrar(h: Historico, p: Projeto): Historico {
  if (p === h.presente) return h
  return { passado: [...h.passado, h.presente].slice(-LIMITE_HISTORICO), presente: p, futuro: [] }
}
/** Troca o presente sem virar passo do ⌘Z (o meio de um arrasto). */
export const substituir = (h: Historico, p: Projeto): Historico => ({ ...h, presente: p })

export function desfazer(h: Historico): Historico {
  const anterior = h.passado.at(-1)
  if (!anterior) return h
  return { passado: h.passado.slice(0, -1), presente: anterior, futuro: [h.presente, ...h.futuro] }
}
export function refazer(h: Historico): Historico {
  const [prox, ...resto] = h.futuro
  if (!prox) return h
  return { passado: [...h.passado, h.presente], presente: prox, futuro: resto }
}

/* ── formatos ── */

export function relogio(s: number): string {
  // arredonda ANTES de separar o minuto (senão 59,97 vira "0:60.0") e nunca abaixo de zero:
  // o Transport parado pode ler −0,001 e o relógio mostrava "-1:60.0"
  const d = Math.max(0, Math.round(s * 10))
  return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, '0')}`
}
/** "compasso.batida" contando de 1, como o Logic. */
export function compassoBatida(s: number, p: Pick<Projeto, 'bpm' | 'compasso'>): string {
  const b = Math.floor(Math.max(0, s) / batidaS(p.bpm) + 1e-9)
  return `${Math.floor(b / p.compasso) + 1}.${(b % p.compasso) + 1}`
}

export const nomeArquivo = (caminho: string) => caminho.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? caminho
/** Nome que o clipe mostra: o dado (o esticado aponta pra um hash de cache) ou o do arquivo. */
export const nomeClipe = (c: Clipe, padrao: string) => c.nome ?? (c.arquivo ? nomeArquivo(c.arquivo) : padrao)
